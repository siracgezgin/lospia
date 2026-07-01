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
import { Plus, Search, Users, Pencil, Trash2, ArrowUpDown, ExternalLink, Link2 as LinkIcon, UserCheck } from "lucide-react";
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
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { CrmContactModal } from "./CrmContactModal";
import { ContactMatchingPanel } from "./ContactMatchingPanel";
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState(initialSegment);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceContact | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [showMatching, setShowMatching] = useState(false);

  const linkedCount = useMemo(() => contacts.filter((c) => c.user_id).length, [contacts]);

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
  function handleDelete(c: WorkspaceContact) {
    if (!confirm(`"${c.name}" kaydını silmek istediğinize emin misiniz?`)) return;
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
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-ink">{c.name}</span>
                {c.user_id && (
                  <span title="Sistem hesabıyla eşleşti" className="shrink-0 text-[#1f6e4d]">
                    <UserCheck size={13} />
                  </span>
                )}
              </div>
              {c.organization && <div className="truncate text-[12px] text-subtle">{c.organization}</div>}
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
            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium", SEGMENT_TONE[seg] ?? "bg-surface-sunken text-muted")}>
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
            <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[st] ?? "bg-surface-sunken text-muted")}>
              {statusLabel(st)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "contact",
        header: "İletişim",
        cell: (info) => {
          const c = info.row.original;
          return (
            <div className="text-[12.5px] leading-tight text-muted">
              {c.phone && <div className="truncate">{c.phone}</div>}
              {c.email && <div className="truncate text-subtle">{c.email}</div>}
              {!c.phone && !c.email && <span className="text-subtle">—</span>}
            </div>
          );
        },
      }),
      columnHelper.accessor("owner_id", {
        header: "Sorumlu",
        cell: (info) => {
          const owner = info.getValue();
          return <span className="text-[12.5px] text-muted">{owner ? memberName.get(owner) ?? "—" : "—"}</span>;
        },
      }),
      columnHelper.accessor("next_follow_up_at", {
        header: "Sonraki takip",
        cell: (info) => {
          const d = info.getValue();
          if (!d) return <span className="text-subtle">—</span>;
          const overdue = d < new Date().toISOString().slice(0, 10);
          return (
            <span className={cn("text-[12.5px]", overdue ? "font-medium text-danger" : "text-muted")}>
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
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-strong"
            >
              {n} ilişkili görev <ExternalLink size={11} />
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
                    className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                    title="Düzenle"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(info.row.original)}
                    disabled={isDeleting}
                    className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[#fbe6e2] hover:text-danger"
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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <ModulePageHeader
        title="İlişkiler / CRM"
        description="VIP müşteriler, PR kontakları, influencerlar, tedarikçiler ve işbirliği adayları."
        icon={Users}
        secondaryBackHref="/board"
        rightSlot={
          isAdmin ? (
            <>
              <button
                onClick={() => setShowMatching((s) => !s)}
                disabled={setupRequired}
                title={
                  setupRequired
                    ? "Kişi eşleştirme için veritabanı güncellemesi bekleniyor."
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                  setupRequired
                    ? "cursor-not-allowed border-line bg-surface-sunken text-subtle"
                    : showMatching
                      ? "border-brand-ring bg-brand-soft text-brand-strong"
                      : "border-line text-muted hover:bg-surface-muted",
                )}
              >
                <LinkIcon size={14} />
                Kişi eşleştirme
                {!setupRequired && linkedCount > 0 && (
                  <span className="rounded-full bg-surface px-1.5 text-[11px] tabular-nums text-subtle">{linkedCount}</span>
                )}
              </button>
              <button
                onClick={openNew}
                disabled={setupRequired}
                title={
                  setupRequired
                    ? "Yeni ilişki ekleme için veritabanı güncellemesi bekleniyor."
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
                  setupRequired
                    ? "cursor-not-allowed bg-brand/40 text-white"
                    : "bg-brand text-white hover:bg-brand-strong",
                )}
              >
                <Plus size={15} />
                Yeni ilişki ekle
              </button>
            </>
          ) : undefined
        }
      />

      {setupRequired && (
        <div className="mb-4">
          <SetupRequiredNotice
            message={
              setupMessage ??
              "CRM alanları için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra yeni ilişki ekleme ve kişi eşleştirme aktif olacak."
            }
            technicalDetail={isAdmin ? setupTechnicalDetail : null}
          />
        </div>
      )}

      {isAdmin && showMatching && !setupRequired && (
        <ContactMatchingPanel contacts={contacts} members={members} />
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsim, kurum, e-posta ara…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
          />
        </div>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-brand-ring"
        >
          <option value="">Tüm segmentler</option>
          {CRM_SEGMENTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line bg-surface-muted">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-muted"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown size={11} className="opacity-50" />
                        </button>
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
                <td colSpan={columns.length} className="px-3 py-12 text-center text-[13px] text-subtle">
                  {contacts.length === 0
                    ? "Henüz bir ilişki kaydı yok."
                    : "Filtreye uyan kayıt bulunamadı."}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-surface-muted">
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

      <p className="mt-2 px-1 text-[12px] text-subtle">{filtered.length} kayıt gösteriliyor</p>

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
    </div>
  );
}
