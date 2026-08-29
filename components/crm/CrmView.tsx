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
import { Plus, Search, Users, Pencil, Trash2, ExternalLink, Eye } from "lucide-react";
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
import { seedingStep, nextSeedingStep, SEEDING_TOTAL } from "@/lib/crm/seeding";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { CrmContactModal } from "./CrmContactModal";
import type { WorkspaceContact } from "@/types";

export interface CrmMember {
  userId: string;
  name: string;
  email?: string | null;
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

  const memberName = useMemo(
    () => new Map(members.map((m) => [m.userId, m.name])),
    [members],
  );

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
      message: `"${c.name}" CRM\u2019den kalıcı olarak silinir.`,
    }))) return;
    startDelete(async () => {
      await deleteCrmContact(c.id);
      router.refresh();
    });
  }

  const columns = useMemo(() => [
      columnHelper.accessor("name", {
        header: "İlişki",
        cell: (info) => {
          const c = info.row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{c.name}</div>
              {c.organization && <div className="truncate text-[12.5px] text-subtle">{c.organization}</div>}
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
            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium", SEGMENT_TONE[seg] ?? "bg-surface-sunken text-muted")}>
              {segmentLabel(seg)}
            </span>
          );
        },
      }),
      columnHelper.accessor("crm_status", {
        header: "Durum",
        cell: (info) => {
          const st = info.getValue();
          if (!st) return <span className="text-subtle">—</span>;
          return (
            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium", STATUS_TONE[st] ?? "bg-surface-sunken text-muted")}>
              {statusLabel(st)}
            </span>
          );
        },
      }),
      /* SEEDING — Aslı Hanım'ın yedi adımı (2026-08-28). Sütun bir SAYAÇ
         değil, sürecin neresinde olunduğunun tarifi: "4/7 · Kargo". Adım
         girilmemiş kişide boş kalır, listeyi kalabalıklaştırmaz. */
      columnHelper.accessor("seeding_stage", {
        header: "Seeding",
        cell: (info) => {
          const st = seedingStep(info.getValue());
          if (!st) return <span className="text-subtle">—</span>;
          const next = nextSeedingStep(st.key);
          return (
            <span
              className="inline-flex items-center gap-1.5"
              title={next ? `${st.note}\nSıradaki: ${next.label}` : st.note}
            >
              <span className="inline-flex h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${(st.order / SEEDING_TOTAL) * 100}%` }}
                />
              </span>
              <span className="whitespace-nowrap text-[12.5px] text-muted">
                {st.order}/{SEEDING_TOTAL} · {st.label}
              </span>
            </span>
          );
        },
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
            <span className={cn("text-[13px] tabular-nums whitespace-nowrap", overdue ? "font-medium text-danger" : "text-muted")}>
              {formatDateOnlyTR(d)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "tasks",
        header: "Görevler",
        cell: (info) => {
          const n = taskCounts[info.row.original.id] ?? 0;
          if (!n) return <span className="text-subtle">—</span>;
          return (
            <Link
              href={`/list?person=${info.row.original.id}`}
              className="inline-flex items-center gap-1 text-[13px] font-medium tabular-nums text-brand transition-colors duration-150 hover:text-brand-strong"
            >
              {n} ilişkili görev <ExternalLink size={12} />
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
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => openEdit(info.row.original)}
                    className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95"
                    title="Düzenle"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(info.row.original)}
                    disabled={isDeleting}
                    className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            }),
          ]
        : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [isAdmin, isDeleting, memberName, taskCounts]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Header */}
      <ModulePageHeader
        title="CRM"
        rightSlot={
          isAdmin ? (
            <>
              <button
                onClick={openNew}
                disabled={setupRequired}
                title={
                  setupRequired
                    ? "Yeni ilişki ekleme için veritabanı güncellemesi bekleniyor."
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]",
                  setupRequired
                    ? "cursor-not-allowed bg-brand/40 text-white"
                    : "bg-brand text-white hover:bg-brand-strong",
                )}
              >
                <Plus size={15} />
                Yeni ilişki ekle
              </button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-[12px] font-medium text-muted">
              <Eye size={13} />
              Salt görüntüleme
            </span>
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
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-subtle" />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsim, kurum, e-posta ara…"
            className="pl-9"
          />
        </div>
        <SelectInput
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="w-auto min-w-[168px] text-muted"
        >
          <option value="">Tüm segmentler</option>
          {CRM_SEGMENTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </SelectInput>
      </div>

      {/* Geniş ekran: tablo. Dar ekran: kart listesi (aşağıda). */}
      <div className="anim-fade-up hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-card lg:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="select-none border-b border-line bg-surface-muted">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle whitespace-nowrap"
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
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <span className="anim-fade-up inline-flex flex-col items-center">
                    <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand ring-8 ring-brand-soft/35">
                      {contacts.length === 0 ? <Users size={20} strokeWidth={1.75} /> : <Search size={20} strokeWidth={1.75} />}
                    </span>
                    <span className="text-sm font-semibold tracking-tight text-ink">
                      {contacts.length === 0
                        ? "Henüz bir ilişki kaydı yok."
                        : "Filtreye uyan kayıt bulunamadı."}
                    </span>
                  </span>
                </td>
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
          Aynı veri, satır yerine kart. */}
      <div className="space-y-2 lg:hidden">
        {filtered.length === 0 ? (
          <div className="anim-fade-up flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-card">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand ring-8 ring-brand-soft/35">
              {contacts.length === 0 ? <Users size={20} strokeWidth={1.75} /> : <Search size={20} strokeWidth={1.75} />}
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              {contacts.length === 0 ? "Henüz bir ilişki kaydı yok." : "Filtreye uyan kayıt bulunamadı."}
            </span>
          </div>
        ) : (
          filtered.map((c) => {
            const st = seedingStep(c.seeding_stage);
            const overdue = !!c.next_follow_up_at && c.next_follow_up_at < new Date().toISOString().slice(0, 10);
            return (
              <div key={c.id} className="anim-fade-up rounded-xl border border-line bg-surface p-3.5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                    {c.organization && <div className="truncate text-[12.5px] text-subtle">{c.organization}</div>}
                  </div>
                  {isAdmin && (
                    <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
                      <button onClick={() => openEdit(c)} title="Düzenle" className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(c)} disabled={isDeleting} title="Sil" className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {(c.segment || c.crm_status) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {c.segment && (
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium", SEGMENT_TONE[c.segment] ?? "bg-surface-sunken text-muted")}>
                        {segmentLabel(c.segment)}
                      </span>
                    )}
                    {c.crm_status && (
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[12px] font-medium", STATUS_TONE[c.crm_status] ?? "bg-surface-sunken text-muted")}>
                        {statusLabel(c.crm_status)}
                      </span>
                    )}
                  </div>
                )}

                {st && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="inline-flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
                      <span className="h-full rounded-full bg-brand" style={{ width: `${(st.order / SEEDING_TOTAL) * 100}%` }} />
                    </span>
                    <span className="text-[12.5px] text-muted">{st.order}/{SEEDING_TOTAL} · {st.label}</span>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-subtle">
                  {c.owner_id && <span>{memberName.get(c.owner_id) ?? "—"}</span>}
                  {c.next_follow_up_at && (
                    <span className={cn("tabular-nums", overdue && "font-medium text-danger")}>
                      Takip: {formatDateOnlyTR(c.next_follow_up_at)}
                    </span>
                  )}
                  {(taskCounts[c.id] ?? 0) > 0 && (
                    <Link href={`/list?person=${c.id}`} className="inline-flex items-center gap-1 font-medium text-brand">
                      {taskCounts[c.id]} ilişkili görev <ExternalLink size={11} />
                    </Link>
                  )}
                </div>
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
