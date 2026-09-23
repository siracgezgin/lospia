"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, Trash2, Pencil, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  createManufacturer, updateManufacturer, deleteManufacturer,
  uploadManufacturerPhoto, deleteManufacturerPhoto,
  type ManufacturerInput,
} from "@/lib/actions/manufacturers";
import { assignPersonTones } from "@/lib/design/person-colors";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, FieldGrid, TextInput, SelectInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import type { Manufacturer } from "@/types";

export type ManagerManufacturer = Pick<
  Manufacturer,
  "id" | "name" | "photo_url" | "city" | "country" | "currency"
  | "lead_time_days" | "min_order_qty" | "contact_name" | "phone" | "email" | "notes" | "is_active"
  | "role" | "address"
> & {
  /** Kartela / kumaş fotoğrafları (20240355). Migration uygulanmadan gelmez. */
  photos?: { url: string; path: string; caption?: string }[] | null;
};

/** Fihristteki iş kolları. Sıra bilinçli: üretim zinciri baştan sona. */
const ROLES = [
  { key: "uretici", label: "Üretici" },
  { key: "kalipci", label: "Kalıpçı" },
  { key: "nakisci", label: "Nakışçı" },
  { key: "kumasci", label: "Kumaşçı" },
  { key: "aksesuarci", label: "Aksesuarcı" },
  { key: "diger", label: "Diğer" },
] as const;
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

interface Props {
  manufacturers: ManagerManufacturer[];
  /** Föy sayısı — usta başına, "kaç ürün orada dikiliyor" bilgisi. */
  sheetCounts: Record<string, number>;
  canManage: boolean;
}

/** Türkçe duyarsız arama normalizasyonu — uygulamadaki her arama kutusuyla
 *  AYNI kural (ğüşıöç → gusioc); "cihan" yazan "Cihan"ı da bulur. */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");
}

function emptyDraft(): ManufacturerInput {
  return {
    name: "", role: "uretici" as const, address: "", photo_url: "", city: "", country: "", currency: "TL",
    lead_time_days: "", min_order_qty: "",
    contact_name: "", phone: "", email: "", notes: "", is_active: true, photos: [],
  };
}

function draftOf(m: ManagerManufacturer): ManufacturerInput {
  return {
    name: m.name,
    photo_url: m.photo_url ?? "",
    photos: m.photos ?? [],
    role: m.role ?? "uretici",
    address: m.address ?? "",
    city: m.city ?? "",
    country: m.country ?? "",
    currency: m.currency ?? "TL",
    lead_time_days: m.lead_time_days ?? "",
    min_order_qty: m.min_order_qty ?? "",
    contact_name: m.contact_name ?? "",
    phone: m.phone ?? "",
    email: m.email ?? "",
    notes: m.notes ?? "",
    is_active: m.is_active,
  };
}

/**
 * Üretici (Usta) yönetimi.
 *
 * Aslı Hanım (2026-08-19): "Cihan Usta, o ustaları da öyle açacağız. Cihan diye
 * bir fotoğraf, Hakan diye bir olsa, ona gireceksin, bunlar açılacak — hangi
 * ürünler orada dikiliyor."
 *
 * Teslim süresi ve minimum adet alanları Zedonk (rakip PLM) incelemesinden
 * geldi: sipariş verirken sorulan ilk iki soru bunlar.
 *
 * Yüzey: bölüm kartının içinde her usta ayrı bir kartken (kenarlık + gölge +
 * renkli kenar) liste "kart içinde kart"tı. Artık ince çizgiyle ayrılmış
 * satırlar; rengi rozet taşır. Form ham input yerine Field primitifleri.
 * Silme onaysız gidiyordu — artık sorulur.
 */
export function ManufacturersManager({ manufacturers, sheetCounts, canManage }: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ManufacturerInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();
  /* ARAMA İSTEMCİDE: usta listesi sunucudan tamamı yüklü geliyor. Ad dışında
     şehir ve ilgili kişi de aranır — "İstanbul'daki ustalar" diye bakılıyor. */
  const [query, setQuery] = useState("");

  /* Düzenlenen satır aramadan MUAF: form açıkken kutuya yazınca satır elenip
     yarım doldurulmuş form gözden kayboluyordu. */
  /* ROL SÜZGECİ. Aslı Hanım (23.09.2026) sourcing'i başlıklar hâlinde tarif
     ediyor: "Kumaş sourcing, aksesuar sourcing, nakışçı, kalıpçı." Tek liste
     beş iş kolunu birden taşıdığı için kumaş arayan kişi üreticilerin arasında
     dolaşıyordu. Çip satırı o başlıkların karşılığı — yeni bir sayfa ya da
     açılır kutu açmadan (tek tasarım dili). */
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const roleCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of manufacturers) out[m.role ?? "uretici"] = (out[m.role ?? "uretici"] ?? 0) + 1;
    return out;
  }, [manufacturers]);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return manufacturers.filter((m) => {
      if (m.id === editingId) return true;
      if (roleFilter && (m.role ?? "uretici") !== roleFilter) return false;
      if (!q) return true;
      return norm([m.name, m.city, m.country, m.contact_name, m.phone].filter(Boolean).join(" ")).includes(q);
    });
  }, [manufacturers, query, editingId, roleFilter]);

  /* Renk atamaları TÜM listeden türetilir: aramada bir usta düşünce geri
     kalanların rengi değişmesin (kişi rengi kimliğin parçası). */
  const tones = assignPersonTones(manufacturers.map((m) => m.id));

  function run(fn: () => Promise<{ error?: string } | unknown>, after?: () => void) {
    setError(null);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      if (res && "error" in res && res.error) { setError(res.error); return; }
      after?.();
      router.refresh();
    });
  }

  const openAdd = () => { setDraft(emptyDraft()); setAdding(true); setEditingId(null); setError(null); };
  const openEdit = (m: ManagerManufacturer) => { setDraft(draftOf(m)); setEditingId(m.id); setAdding(false); setError(null); };
  const close = () => { setAdding(false); setEditingId(null); setError(null); };

  async function remove(m: ManagerManufacturer) {
    const ok = await ask({
      title: "Ustayı silmek istiyor musunuz?",
      message: `${m.name} silinecek. Föye bağlıysa silinmez; onun yerine pasif yapın.`,
      confirmLabel: "Sil",
    });
    if (!ok) return;
    run(() => deleteManufacturer(m.id));
  }

  const form = (
    <div className="space-y-4 rounded-card bg-surface-sunken/60 p-4">
      <FieldGrid>
        <Field label="Usta adı" required className="sm:col-span-2">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Usta ya da atölye adı" autoFocus />
        </Field>
        {/* ROL — fihrist BEŞ iş kolunu birden tutuyor. Aslı Hanım (21.09.2026):
            "oradan üretici, kalıpçı, nakışçı seçmemiz gerekiyor"; (23.09.2026):
            "Kumaş sourcing, aksesuar sourcing, nakışçı, kalıpçı — fihrist
            dediğimiz yer." Ayrı bir sourcing tablosu açmak aynı alanları
            (ad, telefon, adres, e-posta) ikinci kez tanımlamak olurdu.
            Föydeki seçiciler ve Sourcing sekmesi bu alana göre süzer. */}
        <Field label="Rolü">
          <SelectInput
            value={draft.role ?? "uretici"}
            onChange={(e) => setDraft({ ...draft, role: e.target.value as typeof draft.role })}
          >
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Adres">
          <TextInput value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Mahalle, cadde, no" />
        </Field>
        <Field label="Fotoğraf bağlantısı" className="sm:col-span-2">
          <TextInput value={draft.photo_url ?? ""} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Kartelalar" className="sm:col-span-2">
          <KartelaAlbum
            photos={draft.photos ?? []}
            canManage={canManage}
            onChange={(next) => setDraft({ ...draft, photos: next })}
          />
        </Field>
        <Field label="Şehir">
          <TextInput value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="İstanbul" />
        </Field>
        <Field label="Para birimi">
          <TextInput value={draft.currency ?? "TL"} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} placeholder="TL" />
        </Field>
        <Field label="Teslim süresi (gün)">
          <TextInput value={String(draft.lead_time_days ?? "")} onChange={(e) => setDraft({ ...draft, lead_time_days: e.target.value })} placeholder="30" inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="Minimum adet">
          <TextInput value={String(draft.min_order_qty ?? "")} onChange={(e) => setDraft({ ...draft, min_order_qty: e.target.value })} placeholder="50" inputMode="numeric" className="tabular-nums" />
        </Field>
        <Field label="İlgili kişi">
          <TextInput value={draft.contact_name ?? ""} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} />
        </Field>
        <Field label="Telefon">
          <TextInput type="tel" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="tabular-nums" />
        </Field>
        <Field label="Not" className="sm:col-span-2">
          <TextInput value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
      </FieldGrid>

      <label className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand)]"
        />
        <span>Aktif <span className="text-muted">— pasif usta föy seçiminde “(pasif)” görünür, geçmiş kayıtlar korunur.</span></span>
      </label>

      <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={close} disabled={busy}>Vazgeç</Button>
        <Button
          size="sm"
          onClick={() =>
            run(
              () => (editingId ? updateManufacturer(editingId, draft) : createManufacturer(draft)),
              close,
            )
          }
          loading={busy}
          disabled={!draft.name.trim()}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>
      )}

      {adding && form}

      {/* Tek kutu, yeni açılır liste yok — ad · şehir · ilgili kişi hepsi
          aynı kutudan aranır. */}
      {manufacturers.length > 0 && Object.keys(roleCounts).length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <RoleChip active={roleFilter === null} onClick={() => setRoleFilter(null)}>
            Tümü
          </RoleChip>
          {ROLES.filter((r) => roleCounts[r.key]).map((r) => (
            <RoleChip
              key={r.key}
              active={roleFilter === r.key}
              onClick={() => setRoleFilter(roleFilter === r.key ? null : r.key)}
            >
              {r.label}
              {/* Sayı listeyi TARİF ediyor, kimseyi puanlamıyor — sadelik
                  kuralının serbest bıraktığı taraf. */}
              <span className="ml-1 tabular-nums opacity-60">{roleCounts[r.key]}</span>
            </RoleChip>
          ))}
        </div>
      )}

      {manufacturers.length > 0 && (
        <div className="relative max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Usta ara…"
            aria-label="Usta ara"
            className="pl-9"
          />
        </div>
      )}

      {manufacturers.length === 0 && !adding ? (
        <EmptyState
          title="Henüz usta yok"
          description="Föylerdeki üretici adları kayda dönüşünce burada görünür."
          compact
        />
      ) : query.trim() && visible.length === 0 ? (
        /* Kayıt var ama arama tutmadı. Koşulda `query` ŞART: form açıkken
           boş liste bu dala düşmemeli. */
        <EmptyState icon={Search} title="Eşleşen usta yok" description="Aramayı değiştirin." compact />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {visible.map((m) => {
            const tone = tones[m.id]!;
            const count = sheetCounts[m.id] ?? 0;
            if (editingId === m.id) return <li key={m.id} className="py-3">{form}</li>;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                {/* Fotoğraf, yoksa baş harf — sembol ikonlar kaldırıldı
                    (Aslı Hanım, 2026-08-24). Pasif usta renksiz kalır. */}
                <PersonAvatar
                  name={m.name}
                  photoUrl={m.photo_url}
                  colorHex={m.is_active ? tone.hex : null}
                  size="md"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("truncate text-[14px] font-semibold tracking-tight", m.is_active ? "text-ink" : "text-muted")}>
                      {m.name}
                    </span>
                    {/* Satırdaki tek rozet: durum. */}
                    {!m.is_active && <Badge className="bg-surface-sunken text-subtle">Pasif</Badge>}
                  </span>
                  {/* "N föy" listeyi tarif eder (o ustada kaç ürün dikiliyor). */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                    <span className="tabular-nums">{count} föy</span>
                    {m.city && <span>{m.city}</span>}
                    {m.lead_time_days != null && <span className="tabular-nums">{m.lead_time_days} gün teslim</span>}
                    {m.min_order_qty != null && <span className="tabular-nums">min {m.min_order_qty} adet</span>}
                    {m.phone && <span className="tabular-nums">{m.phone}</span>}
                  </span>
                </span>

                {canManage && (
                  <span className="flex shrink-0 items-center">
                    <IconButton size="sm" onClick={() => openEdit(m)} aria-label={`${m.name} — düzenle`} title="Düzenle">
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label={`${m.name} — sil`}
                      title={count > 0 ? "Föye bağlı — silmek yerine pasif yapın" : "Sil"}
                      className="hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !adding && (
        <Button variant="secondary" size="sm" onClick={openAdd}>
          <Plus size={14} aria-hidden /> Usta ekle
        </Button>
      )}

      {dialog}
    </div>
  );
}

/**
 * KARTELA ALBÜMÜ — firmanın kumaş/aksesuar fotoğrafları.
 *
 * Aslı Hanım (23.09.2026): "Emin Bey telefonu, adı, hangi kumaşları olduğunun
 * fotoğrafları… onun kartelaları." Kumaş seçimi bu karelere bakılarak
 * yapılıyor; tek bir kapak görseli (photo_url) o işi görmüyordu.
 *
 * Yüklenen dosya ANINDA depoya gider, kayıt ise "Kaydet" ile yazılır. Bu
 * sırayı tersine çevirmek, kaydetmeden çıkan kullanıcının yüklediği dosyayı
 * öksüz bırakırdı; böyle çalışınca öksüz kalan tek şey depodaki dosya olur ve
 * o da kaydın albümünde görünmez.
 */
function KartelaAlbum({
  photos, canManage, onChange,
}: {
  photos: { url: string; path: string; caption?: string }[];
  canManage: boolean;
  onChange: (_next: { url: string; path: string; caption?: string }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    setBusy(true);
    try {
      const next = [...photos];
      for (const file of Array.from(files).slice(0, 12)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadManufacturerPhoto(fd);
        if ("error" in res) { setErr(res.error); break; }
        next.push({ url: res.url, path: res.path });
      }
      onChange(next);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(ph: { url: string; path: string }) {
    onChange(photos.filter((x) => x.path !== ph.path));
    /* Depodan silme SESSİZ: kayıt zaten listeden düştü, dosyanın silinememesi
       kullanıcıya gösterilecek bir şey değil. */
    await deleteManufacturerPhoto(ph.path).catch(() => {});
  }

  return (
    <div className="space-y-2">
      {err && <p role="alert" className="text-[12.5px] text-danger">{err}</p>}
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((ph) => (
            <li key={ph.path} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ph.url}
                alt={ph.caption ?? "Kartela"}
                className="h-20 w-20 rounded-card border border-line object-cover"
              />
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(ph)}
                  aria-label="Kartelayı sil"
                  title="Kartelayı sil"
                  className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line bg-surface text-subtle shadow-card transition-colors duration-150 hover:text-danger"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => add(e.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={busy}
            className="border-dashed"
          >
            {!busy && <ImagePlus size={13} aria-hidden />} Kartela ekle
          </Button>
        </>
      )}
    </div>
  );
}

/** Rol çipi — Koleksiyon'daki alt kategori çipiyle aynı dil. */
function RoleChip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "tap-target h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150",
        active
          ? "bg-brand-soft text-brand-strong ring-1 ring-brand-ring"
          : "bg-surface-muted text-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
