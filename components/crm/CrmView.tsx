"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Users, Trash2, ExternalLink, Eye, UserPlus, AlertCircle, ChevronLeft, Pencil, CornerDownLeft } from "lucide-react";
import { deleteCrmContact, createCrmContact, updateCrmContactField } from "@/lib/actions/crm";
import { isFihristRow } from "@/lib/crm/constants";
import {
  CRM_SEGMENTS,
  CRM_GRID_COLUMNS,
  crmCategory,
  crmCategoryOfSegment,
  segmentLabel,
  statusLabel,
  sourceLabel,
  type CrmFieldKey,
} from "@/lib/crm/constants";
import { formatDateOnlyTR } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { SortHeader } from "@/components/ui/SortHeader";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { seedingStep } from "@/lib/crm/seeding";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { CrmCell, focusCell } from "./CrmGridCells";
import { ContactMatchingPanel } from "./ContactMatchingPanel";
import type { WorkspaceContact } from "@/types";
import { istanbulTodayISO } from "@/lib/utils/today";

export interface CrmMember {
  userId: string;
  name: string;
  email?: string | null;
  /** profiles.avatar_url — eşleştirilmiş kişi listede fotoğrafıyla çıkar. */
  photoUrl?: string | null;
}
type Member = CrmMember;

interface Props {
  contacts: WorkspaceContact[];
  members: Member[];
  taskCounts: Record<string, number>;
  isAdmin: boolean;
  initialSegment: string;
  /** Hangi KUTUnun içindeyiz (Celebrity, Basın, Outsource…). Boşsa liste tüm
   *  kayıtları gösterir — kutucuk girişi ayrı bir ekranda (CrmCategoryGrid). */
  categoryKey?: string | null;
  /** True when the additive CRM columns are not yet migrated on this DB. */
  setupRequired?: boolean;
  setupMessage?: string | null;
  setupTechnicalDetail?: string | null;
}

// diacritic-insensitive search
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

/** Boş metin → null. Sunucu "" kaydetmez, tarih alanları ise "" ile patlar. */
const nz = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

type Draft = Record<CrmFieldKey, string>;
const emptyDraft = (segment: string): Draft =>
  Object.fromEntries(CRM_GRID_COLUMNS.map((c) => [c.key, c.key === "segment" ? segment : ""])) as Draft;

/** Izgarada okunabilir metin — sıralama ve fihrist satırları için. */
function displayOf(c: WorkspaceContact, key: CrmFieldKey, memberName: Map<string, string>): string {
  const raw = (c as unknown as Record<string, string | null>)[key] ?? "";
  if (!raw) return "";
  switch (key) {
    case "segment": return segmentLabel(raw) ?? raw;
    case "crm_status": return statusLabel(raw) ?? raw;
    case "source_channel": return sourceLabel(raw) ?? raw;
    case "seeding_stage": {
      const st = seedingStep(raw);
      return st ? `${st.order}/7 · ${st.label}` : raw;
    }
    case "owner_id": return memberName.get(raw) ?? "";
    case "last_contact_at":
    case "next_follow_up_at": return formatDateOnlyTR(raw) ?? raw;
    default: return raw;
  }
}

export function CrmView({
  contacts, members, taskCounts, isAdmin, initialSegment,
  categoryKey = null, setupRequired = false, setupMessage = null, setupTechnicalDetail = null,
}: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState(initialSegment);
  const [sort, setSort] = useState<{ key: CrmFieldKey; dir: "asc" | "desc" } | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [isAdding, startAdd] = useTransition();
  /* Silme / kaydetme hatası GÖRÜNÜR olmalı: sonuç okunmazsa ekran
     "kaydedildi" der ama hiçbir şey değişmemiştir. */
  const [error, setError] = useState<string | null>(null);
  const [showMatching, setShowMatching] = useState(false);

  const category = useMemo(() => crmCategory(categoryKey), [categoryKey]);

  /* Yeni satır, İÇİNDE BULUNULAN kutunun altında doğar — tekrar segment
     seçtirmek gereksiz (2026-09-07: "Şurada bir artı olursa Berna'yı hemen
     kaydederiz"). */
  const defaultSegment = category?.primary ?? "";
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultSegment));

  const memberName = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);
  const memberPhoto = useMemo(() => new Map(members.map((m) => [m.userId, m.photoUrl ?? null])), [members]);
  const photoOf = (c: WorkspaceContact) => (c.user_id ? memberPhoto.get(c.user_id) ?? null : null);
  /* Hücrelerin sorumlu listesi — CrmCell yalnız id+ad ister. */
  const cellMembers = useMemo(() => members.map((m) => ({ userId: m.userId, name: m.name })), [members]);

  const segmentOptions = useMemo(
    () => (category ? CRM_SEGMENTS.filter((sg) => category.segments.includes(sg.key)) : [...CRM_SEGMENTS]),
    [category],
  );

  /* EŞLEŞTİRME YALNIZ CRM KAYITLARINDA — fihrist satırlarının sistem hesabı
     olamaz, panele verilince sayaç yanlış okunur ve düğme boşa basar. */
  const matchableContacts = useMemo(() => contacts.filter((c) => !isFihristRow(c.id)), [contacts]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return contacts.filter((c) => {
      /* Kutunun kapsamı KUTUCUK IZGARASIYLA AYNI KURALDAN okunur — sayı ile
         liste ayrışamasın (tanınmayan segment ikisinde de "Diğer"e düşer). */
      if (category && crmCategoryOfSegment(c.segment).key !== category.key) return false;
      if (segment && c.segment !== segment) return false;
      if (!q) return true;
      const hay = norm([c.name, c.organization, c.email, c.phone, c.role_label, c.notes].filter(Boolean).join(" "));
      return hay.includes(q);
    });
  }, [contacts, query, segment, category]);

  const rows = useMemo(() => {
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = displayOf(a, sort.key, memberName);
      const bv = displayOf(b, sort.key, memberName);
      /* Boş hücreler her zaman SONDA — yön değişince "boşlar" başa çıkıp
         dolu satırları aşağı itmesin. */
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv, "tr") * dir;
    });
  }, [filtered, sort, memberName]);

  function toggleSort(key: CrmFieldKey) {
    setSort((s) => (s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  }

  /** Tek hücre kaydeder — satırın geri kalanına DOKUNMAZ. */
  async function commitCell(id: string, field: CrmFieldKey, next: string): Promise<string | null> {
    const res = await updateCrmContactField(id, field, next);
    if ("error" in res) { setError(res.error); return res.error; }
    setError(null);
    router.refresh();
    return null;
  }

  /* ÇİFT KAYIT KALKANI. Taslak satır hem `onBlur` hem Enter hem de "Ekle" ile
     kaydediyor; ikisi aynı tikte tetiklenirse `isAdding` daha dönmemiş olur ve
     aynı kişi iki kez açılırdı. Ref anında değişir. */
  const adding = useRef(false);

  /** Taslak satır kaydı açar ve imleci yeni boş satıra taşır. */
  function commitDraft() {
    if (!draft.name.trim() || adding.current) return;
    adding.current = true;
    setError(null);
    startAdd(async () => {
      const res = await createCrmContact({
        name: draft.name.trim(),
        kind: "external",
        organization: nz(draft.organization),
        role_label: nz(draft.role_label),
        segment: nz(draft.segment) ?? nz(defaultSegment),
        crm_status: nz(draft.crm_status),
        seeding_stage: nz(draft.seeding_stage),
        source_channel: nz(draft.source_channel),
        owner_id: nz(draft.owner_id),
        phone: nz(draft.phone),
        email: nz(draft.email),
        last_contact_at: nz(draft.last_contact_at),
        next_follow_up_at: nz(draft.next_follow_up_at),
        notes: nz(draft.notes),
      });
      adding.current = false;
      if ("error" in res) { setError(res.error); return; }
      setDraft(emptyDraft(defaultSegment));
      router.refresh();
      /* "Sırasıyla ekleye ekleye ilerleyebilelim" — imleç yeni boş satırın
         ilk hücresine döner, elin klavyeden kalkmaz. */
      if (typeof window !== "undefined") requestAnimationFrame(() => focusCell("name", -1));
    });
  }

  async function handleDelete(c: WorkspaceContact) {
    if (!(await ask({
      title: "İlişki kaydı silinsin mi?",
      message: `"${c.name}" CRM’den kalıcı olarak silinir.`,
    }))) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteCrmContact(c.id);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  const canWrite = isAdmin && !setupRequired;
  const segmentScope = category ? category.segments : null;

  const emptyState = (
    <EmptyState
      compact
      icon={contacts.length === 0 ? Users : Search}
      title={contacts.length === 0 ? "Henüz ilişki kaydı yok." : "Aramaya uyan kayıt yok."}
      description={
        contacts.length === 0
          ? (canWrite ? "Alttaki boş satıra yazmaya başlayın." : undefined)
          : "Aramayı ya da segment süzgecini değiştirin."
      }
    />
  );

  /* Toplam sütun sayısı — boş durum satırının kaç hücreyi kaplayacağı. */
  const colCount = CRM_GRID_COLUMNS.length + 1 + (canWrite ? 1 : 0);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {category && (
        <Link
          href="/crm"
          className="anim-fade-down -ml-1 mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-ink"
        >
          <ChevronLeft size={15} aria-hidden /> Tüm gruplar
        </Link>
      )}
      <ModulePageHeader
        title={category ? `CRM · ${category.label}` : "CRM"}
        rightSlot={
          isAdmin ? (
            /* "Yeni ilişki ekle" DÜĞMESİ YOK: kayıt açmanın yeri artık tablonun
               en altındaki boş satır. Düğme, kalkan pencereyi geri çağırırdı. */
            <Badge className="bg-surface-muted text-muted">
              <CornerDownLeft size={13} aria-hidden />
              Alttaki boş satıra yazın
            </Badge>
          ) : (
            <Badge className="bg-surface-muted text-muted">
              <Eye size={13} aria-hidden />
              Salt görüntüleme
            </Badge>
          )
        }
      />

      {setupRequired && (
        <div className="mb-4">
          <SetupRequiredNotice
            message={
              setupMessage ??
              "CRM alanları için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra yeni ilişki ekleme aktif olacak."
            }
            technicalDetail={isAdmin ? setupTechnicalDetail : null}
          />
        </div>
      )}

      {/* Araç çubuğu — arama ve süzgeç aynı yükseklikte (h-9). */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsim, kurum, e-posta ara…"
            aria-label="İlişki ara"
            className="pl-9"
          />
        </div>
        {segmentOptions.length > 1 && (
          <SelectInput
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            aria-label="Segment süzgeci"
            className="w-auto min-w-[168px] text-muted"
          >
            <option value="">{category ? `Tüm ${category.label.toLocaleLowerCase("tr")}` : "Tüm segmentler"}</option>
            {segmentOptions.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </SelectInput>
        )}
        {canWrite && (
          <Button
            variant="secondary"
            className="sm:ml-auto"
            onClick={() => setShowMatching((v) => !v)}
            aria-expanded={showMatching}
            aria-controls="crm-matching-panel"
            title="CRM kişilerini sistem hesaplarıyla eşleştir"
          >
            <UserPlus size={15} aria-hidden />
            {showMatching ? "Eşleştirmeyi kapat" : "Kişi eşleştirme"}
          </Button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="anim-fade-down mb-3 flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {canWrite && showMatching && (
        <div id="crm-matching-panel">
          <ContactMatchingPanel contacts={matchableContacts} members={members} />
        </div>
      )}

      {/* ── EXCEL IZGARASI ────────────────────────────────────────────────
          On üç alanın hepsi sütun. İlk sütun YAPIŞIK: yatay kaydırırken
          kimin satırında olduğunuz görünür kalsın. `border-separate` +
          `border-spacing-0`, yapışık sütunun çizgisi kaydırırken kaybolmasın
          diye (collapse'ta kenarlık hücreye ait olmuyor). */}
      <div className="anim-fade-up hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card lg:block">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <colgroup>
            {CRM_GRID_COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 120 }} />
            {canWrite && <col style={{ width: 52 }} />}
          </colgroup>
          <thead>
            <tr className="select-none">
              {CRM_GRID_COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap border-b border-line bg-surface-muted px-2 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle",
                    i === 0 && "sticky left-0 z-20 border-r border-line",
                  )}
                >
                  <SortHeader
                    active={sort?.key === c.key}
                    dir={sort?.key === c.key && sort.dir === "desc" ? "desc" : "asc"}
                    onSort={() => toggleSort(c.key)}
                  >
                    {c.label}
                  </SortHeader>
                </th>
              ))}
              <th scope="col" className="whitespace-nowrap border-b border-line bg-surface-muted px-2 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                Görevler
              </th>
              {canWrite && <th className="border-b border-line bg-surface-muted px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount}>{emptyState}</td>
              </tr>
            )}
            {rows.map((c, rowIndex) => {
              /* FİHRİST SATIRI SALT OKUNUR: kayıt `workspace_manufacturers`'ta
                 yaşıyor ve föylerdeki üretici/kalıpçı/nakışçı bağları ona
                 işaret ediyor. Buradan yazmak o bağları koparırdı. */
              const fihrist = isFihristRow(c.id);
              const n = taskCounts[c.id] ?? 0;
              return (
                <tr key={c.id} className="group transition-colors duration-150 ease-standard hover:bg-surface-hover">
                  {CRM_GRID_COLUMNS.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-b border-hairline px-1 py-0.5 align-middle",
                        i === 0 && "sticky left-0 z-10 border-r border-line bg-surface group-hover:bg-surface-hover",
                      )}
                    >
                      {i === 0 ? (
                        /* Ad hücresi kimliği taşır: fotoğraf solda, yazılan ad
                           sağda — aynı insan her ekranda aynı görünür. */
                        <div className="flex min-w-0 items-center gap-1.5">
                          <PersonAvatar name={c.name} photoUrl={photoOf(c)} size="sm" title={c.name} />
                          {fihrist ? (
                            <span className="min-w-0 flex-1 truncate px-2 text-[13px] text-ink" title={c.name}>{c.name}</span>
                          ) : (
                            <CrmCell
                              column={col}
                              row={rowIndex}
                              value={(c as unknown as Record<string, string | null>)[col.key] ?? ""}
                              disabled={!canWrite}
                              members={cellMembers}
                              segmentScope={segmentScope}
                              onCommit={(next) => commitCell(c.id, col.key, next)}
                              className="font-medium"
                            />
                          )}
                        </div>
                      ) : fihrist ? (
                        <span className="block truncate px-2 text-[13px] text-subtle" title={displayOf(c, col.key, memberName)}>
                          {displayOf(c, col.key, memberName) || "—"}
                        </span>
                      ) : (
                        <CrmCell
                          column={col}
                          row={rowIndex}
                          value={(c as unknown as Record<string, string | null>)[col.key] ?? ""}
                          disabled={!canWrite}
                          members={cellMembers}
                          segmentScope={segmentScope}
                          onCommit={(next) => commitCell(c.id, col.key, next)}
                          className={cn(
                            col.key === "next_follow_up_at" &&
                              c.next_follow_up_at &&
                              c.next_follow_up_at < istanbulTodayISO() &&
                              "font-medium text-danger",
                          )}
                        />
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap border-b border-hairline px-2 py-0.5 align-middle">
                    {n > 0 ? (
                      <Link
                        href={`/list?person=${c.id}`}
                        className="tap-target inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
                      >
                        Görevleri aç <ExternalLink size={12} aria-hidden />
                      </Link>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="border-b border-hairline px-1 py-0.5 text-right align-middle">
                      {fihrist ? (
                        <Link
                          href="/collection/veri?k=usta"
                          aria-label="Fihrist'te düzenle"
                          title="Fihrist'te düzenle"
                          className="tap-target inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
                        >
                          <Pencil size={14} aria-hidden />
                        </Link>
                      ) : (
                        <IconButton
                          size="sm"
                          aria-label="Sil"
                          title="Satırı sil"
                          disabled={isDeleting}
                          onClick={() => handleDelete(c)}
                          className="hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* ── BOŞ SATIR — kayıt açmanın TEK yeri ──────────────────────
                Excel'in son satırı gibi hep orada durur. Ad yazılıp Enter'a
                basıldığında kayıt açılır ve imleç yeni boş satıra iner. */}
            {canWrite && (
              <tr
                className="bg-surface-muted"
                onBlur={(e) => {
                  /* Satırdan TAMAMEN çıkıldıysa yazılanı kaydet — yarım
                     doldurulmuş bir satır sekme değiştirince kaybolmasın. */
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitDraft();
                }}
              >
                {CRM_GRID_COLUMNS.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      "border-b border-hairline px-1 py-0.5 align-middle",
                      i === 0 && "sticky left-0 z-10 border-r border-line bg-surface-muted",
                    )}
                  >
                    <CrmCell
                      column={col}
                      row={-1}
                      value={draft[col.key]}
                      members={cellMembers}
                      segmentScope={segmentScope}
                      placeholder={i === 0 ? "Yeni kayıt — ad yazın…" : undefined}
                      onDraftChange={(next) => setDraft((d) => ({ ...d, [col.key]: next }))}
                      onEnter={commitDraft}
                      onCommit={async () => null}
                      className={i === 0 ? "font-medium" : undefined}
                    />
                  </td>
                ))}
                <td className="border-b border-hairline px-2 py-0.5 align-middle" colSpan={2}>
                  <Button size="sm" variant="secondary" onClick={commitDraft} loading={isAdding} disabled={!draft.name.trim()}>
                    Ekle
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── DAR EKRAN ────────────────────────────────────────────────────
          Telefonda on üç sütunluk ızgara okunmuyor; aynı hücreler alt alta
          etiketli alanlar olarak çizilir. Davranış AYNI bileşenden geldiği
          için iki görünüm birbirinden ayrışamaz. */}
      <div className="space-y-2 lg:hidden">
        {rows.length === 0 ? (
          <div className="anim-fade-up rounded-card border border-line bg-surface shadow-card">{emptyState}</div>
        ) : (
          rows.map((c, rowIndex) => {
            const fihrist = isFihristRow(c.id);
            return (
              <div key={c.id} className="anim-fade-up rounded-card border border-line bg-surface p-3 shadow-card">
                <div className="mb-2 flex items-center gap-2 border-b border-hairline pb-2">
                  <PersonAvatar name={c.name} photoUrl={photoOf(c)} size="sm" title={c.name} />
                  {/* Ad KART BAŞLIĞIDIR; aşağıdaki alan listesinde tekrar
                      edilmez (aynı şeyi iki kez yazmak satır kazandırmıyor,
                      yalnız kartı uzatıyordu). Başlık yine de yazılabilir. */}
                  {fihrist ? (
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{c.name || "—"}</span>
                  ) : (
                    <CrmCell
                      column={CRM_GRID_COLUMNS[0]}
                      row={rowIndex}
                      value={c.name ?? ""}
                      disabled={!canWrite}
                      members={cellMembers}
                      segmentScope={segmentScope}
                      onCommit={(next) => commitCell(c.id, "name", next)}
                      className="flex-1 text-[13.5px] font-medium"
                    />
                  )}
                  {canWrite && (fihrist ? (
                    <Link
                      href="/collection/veri?k=usta"
                      aria-label="Fihrist'te düzenle"
                      title="Fihrist'te düzenle"
                      className="tap-target inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted"
                    >
                      <Pencil size={14} aria-hidden />
                    </Link>
                  ) : (
                    <IconButton
                      size="sm"
                      aria-label="Sil"
                      title="Kaydı sil"
                      disabled={isDeleting}
                      onClick={() => handleDelete(c)}
                      className="shrink-0 hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  ))}
                </div>
                <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
                  {CRM_GRID_COLUMNS.filter((col) => col.key !== "name").map((col) => (
                    <div key={col.key} className="contents">
                      <dt className="truncate text-[12px] text-subtle">{col.label}</dt>
                      <dd className="min-w-0">
                        {fihrist ? (
                          <span className="block truncate px-2 py-1.5 text-[13px] text-subtle">
                            {displayOf(c, col.key, memberName) || "—"}
                          </span>
                        ) : (
                          <CrmCell
                            column={col}
                            row={rowIndex}
                            value={(c as unknown as Record<string, string | null>)[col.key] ?? ""}
                            disabled={!canWrite}
                            members={cellMembers}
                            segmentScope={segmentScope}
                            onCommit={(next) => commitCell(c.id, col.key, next)}
                          />
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {(taskCounts[c.id] ?? 0) > 0 && (
                  <Link href={`/list?person=${c.id}`} className="tap-target mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand">
                    Görevleri aç <ExternalLink size={11} aria-hidden />
                  </Link>
                )}
              </div>
            );
          })
        )}

        {canWrite && (
          <div
            className="anim-fade-up rounded-card border border-dashed border-line bg-surface-muted p-3"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitDraft();
            }}
          >
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Yeni kayıt</p>
            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
              {CRM_GRID_COLUMNS.map((col, i) => (
                <div key={col.key} className="contents">
                  <dt className="truncate text-[12px] text-subtle">{col.label}</dt>
                  <dd className="min-w-0">
                    <CrmCell
                      column={col}
                      row={-1}
                      value={draft[col.key]}
                      members={cellMembers}
                      segmentScope={segmentScope}
                      placeholder={i === 0 ? "Ad yazın…" : undefined}
                      onDraftChange={(next) => setDraft((d) => ({ ...d, [col.key]: next }))}
                      onEnter={commitDraft}
                      onCommit={async () => null}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <Button size="sm" className="mt-2.5 w-full" onClick={commitDraft} loading={isAdding} disabled={!draft.name.trim()}>
              Ekle
            </Button>
          </div>
        )}
      </div>

      {/* Kaç kayıt görüldüğünü söyleyen satır — LİSTEYİ TARİF EDER. */}
      {rows.length > 0 && (
        <p className="mt-2 px-1 text-[12px] tabular-nums text-subtle">{rows.length} kayıt gösteriliyor</p>
      )}

      {dialog}
    </div>
  );
}
