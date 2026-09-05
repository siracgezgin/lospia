"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { Plus, Search, Users, Pencil, Trash2, ExternalLink, Eye, UserPlus, AlertCircle } from "lucide-react";
import { deleteCrmContact } from "@/lib/actions/crm";
import {
  CRM_SEGMENTS,
  segmentLabel,
  statusLabel,
  SEGMENT_TONE,
  STATUS_TONE,
} from "@/lib/crm/constants";
import { formatDateOnlyTR } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { SortHeader } from "@/components/ui/SortHeader";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { seedingStep, nextSeedingStep, SEEDING_TOTAL } from "@/lib/crm/seeding";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { CrmContactModal } from "./CrmContactModal";
import { ContactMatchingPanel } from "./ContactMatchingPanel";
import type { WorkspaceContact } from "@/types";

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

const columnHelper = createColumnHelper<WorkspaceContact>();

/**
 * SEEDING ADIM GÖSTERGESİ — yedi küçük çentik + "4/7 · Kargo".
 *
 * Önce ince bir ilerleme çubuğuydu: yüzde gibi okunuyordu ve dolu kısım
 * "ne kadar iyi gidiyor" hissi veriyordu. Oysa süreç yedi AYRIK adımdır —
 * kaçıncı adımda olunduğu sayılabilmeli. Çentikler adımı sayar, etiket
 * adı söyler; renk tek başına anlam taşımaz (metin her zaman yanında).
 */
function SeedingSteps({ stage, className }: { stage: string | null | undefined; className?: string }) {
  const st = seedingStep(stage);
  if (!st) return <span className="text-subtle">—</span>;
  const next = nextSeedingStep(st.key);
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={next ? `${st.note}\nSıradaki: ${next.label}` : st.note}
    >
      <span className="inline-flex shrink-0 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: SEEDING_TOTAL }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-2 rounded-[2px]",
              i < st.order ? "bg-brand" : "bg-surface-sunken",
            )}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-[12.5px] tabular-nums text-muted">
        {st.order}/{SEEDING_TOTAL} · {st.label}
      </span>
    </span>
  );
}

export function CrmView({
  contacts,
  members,
  taskCounts,
  isAdmin,
  initialSegment,
  setupRequired = false,
  setupMessage,
  setupTechnicalDetail,
}: Props) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState(initialSegment);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceContact | null>(null);
  const [isDeleting, startDelete] = useTransition();
  /* Silme hatası GÖRÜNÜR olmalı: `deleteCrmContact` sonucu hiç okunmuyordu,
     yetki/RLS hatasında ekran hiçbir şey söylemeden aynı kalıyordu. */
  const [error, setError] = useState<string | null>(null);
  /* Kişi eşleştirme paneli — 2026-08-29 tasarım turunda görünürlüğü sağlayan
     düğmeyle birlikte düşmüştü ve bileşen ERİŞİLEMEZ kalmıştı. Liste sakin
     kalsın diye kapalı başlar, yönetici açar. */
  const [showMatching, setShowMatching] = useState(false);

  const memberName = useMemo(
    () => new Map(members.map((m) => [m.userId, m.name])),
    [members],
  );
  const memberPhoto = useMemo(
    () => new Map(members.map((m) => [m.userId, m.photoUrl ?? null])),
    [members],
  );
  /* Kişi kartı — Pano/Takvim ile AYNI dil: fotoğraf varsa fotoğraf, yoksa
     baş harf. Sistem hesabına bağlıysa o kişinin fotoğrafı kullanılır. */
  const photoOf = (c: WorkspaceContact) => (c.user_id ? memberPhoto.get(c.user_id) ?? null : null);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return contacts.filter((c) => {
      if (segment && c.segment !== segment) return false;
      if (!q) return true;
      const hay = norm(
        [c.name, c.organization, c.email, c.phone, c.role_label, c.notes]
          .filter(Boolean)
          .join(" "),
      );
      return hay.includes(q);
    });
  }, [contacts, query, segment]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(c: WorkspaceContact) {
    setEditing(c);
    setModalOpen(true);
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

  const columns = useMemo(() => [
      columnHelper.accessor("name", {
        header: "İlişki",
        cell: (info) => {
          const c = info.row.original;
          /* Ad birincil; kurum ve rol ikincil tek satırda. */
          const sub = [c.organization, c.role_label].filter(Boolean).join(" · ");
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar name={c.name} photoUrl={photoOf(c)} size="sm" title={c.name} />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{c.name}</div>
                {sub && <div className="truncate text-[12.5px] text-subtle">{sub}</div>}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("segment", {
        header: "Segment",
        cell: (info) => {
          const seg = info.getValue();
          if (!seg) return <span className="text-subtle">—</span>;
          return (
            <Badge className={SEGMENT_TONE[seg] ?? "bg-surface-sunken text-muted"}>
              {segmentLabel(seg)}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("crm_status", {
        header: "Durum",
        cell: (info) => {
          const st = info.getValue();
          if (!st) return <span className="text-subtle">—</span>;
          return (
            <Badge className={STATUS_TONE[st] ?? "bg-surface-sunken text-muted"}>
              {statusLabel(st)}
            </Badge>
          );
        },
      }),
      /* SEEDING — Aslı Hanım'ın yedi adımı (2026-08-28). Sütun bir SAYAÇ
         değil, sürecin neresinde olunduğunun tarifi: "4/7 · Kargo". Adım
         girilmemiş kişide boş kalır, listeyi kalabalıklaştırmaz. */
      columnHelper.accessor("seeding_stage", {
        header: "Seeding",
        cell: (info) => <SeedingSteps stage={info.getValue()} />,
      }),
      columnHelper.accessor("owner_id", {
        header: "Sorumlu",
        cell: (info) => {
          const owner = info.getValue();
          return <span className="text-[13px] text-muted">{owner ? memberName.get(owner) ?? "—" : "—"}</span>;
        },
      }),
      columnHelper.accessor("next_follow_up_at", {
        header: "Sonraki takip",
        cell: (info) => {
          const d = info.getValue();
          if (!d) return <span className="text-subtle">—</span>;
          const overdue = d < new Date().toISOString().slice(0, 10);
          return (
            <span
              className={cn("whitespace-nowrap text-[13px] tabular-nums", overdue ? "font-medium text-danger" : "text-muted")}
              title={overdue ? "Takip tarihi geçti" : undefined}
            >
              {/* Renk tek başına sinyal olmasın — ekran okuyucuya da söylenir. */}
              {overdue && <span className="sr-only">Gecikti: </span>}
              {formatDateOnlyTR(d)}
            </span>
          );
        },
      }),
      /* GÖREVLER — sayı yok. "4 ilişkili görev" bir kişiyi sayıyla anlatıyordu
         (sadelik kuralı: kişi başına N görev puanlamadır). Hücre yalnız bir
         KAPI: ilişkili iş varsa listeye giden bağlantı, yoksa boş. */
      columnHelper.display({
        id: "tasks",
        header: "Görevler",
        cell: (info) => {
          const n = taskCounts[info.row.original.id] ?? 0;
          if (!n) return <span className="text-subtle">—</span>;
          return (
            <Link
              href={`/list?person=${info.row.original.id}`}
              className="tap-target inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
            >
              Görevleri aç <ExternalLink size={12} aria-hidden />
            </Link>
          );
        },
      }),
      ...(isAdmin
        ? [
            columnHelper.display({
              id: "actions",
              header: "",
              cell: (info) => (
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => openEdit(info.row.original)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label="Sil"
                    title="Sil"
                    disabled={isDeleting}
                    onClick={() => handleDelete(info.row.original)}
                    className="hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ),
            }),
          ]
        : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [isAdmin, isDeleting, memberName, memberPhoto, taskCounts]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const emptyState = (
    <EmptyState
      compact
      icon={contacts.length === 0 ? Users : Search}
      title={contacts.length === 0 ? "Henüz ilişki kaydı yok." : "Aramaya uyan kayıt yok."}
      description={
        contacts.length === 0
          ? (isAdmin ? "İlk kaydı “Yeni ilişki ekle” ile açın." : undefined)
          : "Aramayı ya da segment süzgecini değiştirin."
      }
    />
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="CRM"
        rightSlot={
          isAdmin ? (
            <Button
              onClick={openNew}
              disabled={setupRequired}
              title={setupRequired ? "Yeni ilişki ekleme için veritabanı güncellemesi bekleniyor." : undefined}
            >
              <Plus size={15} aria-hidden />
              Yeni ilişki ekle
            </Button>
          ) : (
            /* Üye için düzenleme yok; düğmenin yerinde neden olmadığını söyleyen
               sakin bir etiket durur. */
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
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" aria-hidden />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsim, kurum, e-posta ara…"
            aria-label="İlişki ara"
            className="pl-9"
          />
        </div>
        <SelectInput
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          aria-label="Segment süzgeci"
          className="w-auto min-w-[168px] text-muted"
        >
          <option value="">Tüm segmentler</option>
          {CRM_SEGMENTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </SelectInput>
        {/* Süzgeç kuralı gereği araç çubuğunda üçüncü bir SELECT yok: eşleştirme
            ayrı bir eylemdir, açılıp kapanan bir panel olarak yaşar. */}
        {isAdmin && !setupRequired && (
          <Button
            variant="secondary"
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

      {/* Silme / eşleştirme hatası — sessizce yutulmaz. */}
      {error && (
        <div
          role="alert"
          className="anim-fade-down mb-3 flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {isAdmin && showMatching && !setupRequired && (
        <div id="crm-matching-panel">
          <ContactMatchingPanel contacts={contacts} members={members} />
        </div>
      )}

      {/* Geniş ekran: tablo. Dar ekran: kart listesi (aşağıda). */}
      <div className="anim-fade-up hidden overflow-x-auto rounded-card border border-line bg-surface shadow-card lg:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="select-none border-b border-line bg-surface-muted">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        /* Ortak başlık: sıralanmamışken soluk çift ok, sıralıyken
                           yön oku. Burada yalnız çift ok vardı; hangi sütuna göre
                           sıralandığı görünmüyordu. */
                        <SortHeader
                          active={!!header.column.getIsSorted()}
                          dir={header.column.getIsSorted() === "desc" ? "desc" : "asc"}
                          onSort={() => header.column.toggleSorting()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </SortHeader>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-hairline">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{emptyState}</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="transition-colors duration-150 hover:bg-surface-hover">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Kart listesi — dar ekranda tablo 720px yatay kaydırma demekti.
          Aynı veri, satır yerine kart. Kart başına TEK rozet: yaşam döngüsü
          durumu (Aktif / Takipte…). Segment metin olarak alt satırda yazar. */}
      <div className="space-y-2 lg:hidden">
        {filtered.length === 0 ? (
          <div className="anim-fade-up rounded-card border border-line bg-surface shadow-card">{emptyState}</div>
        ) : (
          filtered.map((c) => {
            const overdue = !!c.next_follow_up_at && c.next_follow_up_at < new Date().toISOString().slice(0, 10);
            const sub = [c.organization, c.role_label, segmentLabel(c.segment)].filter(Boolean).join(" · ");
            return (
              <div key={c.id} className="anim-fade-up rounded-card border border-line bg-surface p-3.5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <PersonAvatar name={c.name} photoUrl={photoOf(c)} size="sm" title={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{c.name}</div>
                    {sub && <div className="truncate text-[12.5px] text-subtle">{sub}</div>}
                  </div>
                  {c.crm_status && (
                    <Badge className={cn("shrink-0", STATUS_TONE[c.crm_status] ?? "bg-surface-sunken text-muted")}>
                      {statusLabel(c.crm_status)}
                    </Badge>
                  )}
                </div>

                {c.seeding_stage && <SeedingSteps stage={c.seeding_stage} className="mt-2.5" />}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-subtle">
                  {c.owner_id && <span>{memberName.get(c.owner_id) ?? "—"}</span>}
                  {c.next_follow_up_at && (
                    <span className={cn("tabular-nums", overdue && "font-medium text-danger")}>
                      {overdue ? "Takip gecikti: " : "Takip: "}
                      {formatDateOnlyTR(c.next_follow_up_at)}
                    </span>
                  )}
                  {(taskCounts[c.id] ?? 0) > 0 && (
                    <Link href={`/list?person=${c.id}`} className="tap-target inline-flex items-center gap-1 font-medium text-brand">
                      Görevleri aç <ExternalLink size={11} aria-hidden />
                    </Link>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-2 flex items-center justify-end gap-0.5 border-t border-hairline pt-2">
                    <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => openEdit(c)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      aria-label="Sil"
                      title="Sil"
                      disabled={isDeleting}
                      onClick={() => handleDelete(c)}
                      className="hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Kaç kayıt görüldüğünü söyleyen satır — LİSTEYİ TARİF EDER, kimseyi
          puanlamaz. Sıfırken boş durum zaten aynı şeyi yazıyor. */}
      {filtered.length > 0 && (
        <p className="mt-2 px-1 text-[12px] tabular-nums text-subtle">{filtered.length} kayıt gösteriliyor</p>
      )}

      {modalOpen && (
        <CrmContactModal
          members={members}
          contact={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            router.refresh();
          }}
        />
      )}
      {dialog}
    </div>
  );
}
