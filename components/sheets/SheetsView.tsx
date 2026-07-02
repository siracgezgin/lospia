"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Table2, Pencil, Archive, ArrowUpRight, Lock,
} from "lucide-react";
import { archiveOperationSpreadsheet } from "@/lib/actions/sheets";
import {
  SHEET_TYPES, SHEET_STATUSES, sheetTypeLabel, sheetStatusLabel, SHEET_STATUS_TONE,
} from "@/lib/office/constants";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SheetFormModal } from "./SheetFormModal";
import type { OperationSpreadsheet, WorkspaceDepartment } from "@/types";

/** List rows carry meta only — the (potentially large) snapshot never leaves
 *  the detail page. */
export type SheetListItem = Omit<OperationSpreadsheet, "snapshot" | "schema_json">;

interface Props {
  sheets: SheetListItem[];
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  memberNames: Record<string, string>;
  currentUserId: string;
  isAdmin: boolean;
}

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/İ/g, "i");
}

export function SheetsView({
  sheets, departments, tasks, contacts, memberNames, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SheetListItem | null>(null);
  const [isArchiving, startArchive] = useTransition();

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return sheets.filter((s) => {
      if (!showArchived && s.status === "archived") return false;
      if (typeFilter && s.sheet_type !== typeFilter) return false;
      if (status && s.status !== status) return false;
      if (deptFilter && s.department_id !== deptFilter) return false;
      if (!q) return true;
      return norm(
        [s.title, s.description, ...(s.tags ?? [])].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [sheets, query, typeFilter, status, deptFilter, showArchived]);

  function canMutate(s: SheetListItem) {
    if (isAdmin) return true;
    return s.created_by === currentUserId && (s.status === "draft" || s.status === "active");
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(s: SheetListItem) { setEditing(s); setModalOpen(true); }

  function handleArchive(s: SheetListItem) {
    if (!confirm(`"${s.title}" tablosunu arşivlemek istiyor musunuz?`)) return;
    startArchive(async () => {
      await archiveOperationSpreadsheet(s.id);
      router.refresh();
    });
  }

  const selectCls =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-brand-ring";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Tablo Merkezi"
        description="Excel/CSV düzenlerinizi Lospia içinde tablo olarak tutun — hücreleri doğrudan düzenleyin, Excel'den kopyalayıp yapıştırın."
        icon={Table2}
        secondaryBackHref="/board"
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
          >
            <Plus size={15} />
            Yeni tablo
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tablo adı veya etiket ara…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="">Tüm türler</option>
          {SHEET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">Tüm durumlar</option>
          {SHEET_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls}>
          <option value="">Tüm departmanlar</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <p className="text-[13.5px] text-subtle">
            {sheets.length === 0
              ? "Henüz tablo eklenmedi. Stok, koleksiyon ve operasyon tablolarınızı buradan takip edebilirsiniz."
              : "Filtreye uyan tablo bulunamadı."}
          </p>
          {sheets.length === 0 && (
            <button
              onClick={openNew}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={15} />
              İlk tabloyu oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="group flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-muted">
                    {sheetTypeLabel(s.sheet_type)}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium", SHEET_STATUS_TONE[s.status])}>
                    {s.status === "locked" && <Lock size={9} />}
                    {sheetStatusLabel(s.status)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {canMutate(s) && (
                    <button onClick={() => openEdit(s)} className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink" title="Bilgileri düzenle">
                      <Pencil size={13} />
                    </button>
                  )}
                  {isAdmin && s.status !== "archived" && (
                    <button onClick={() => handleArchive(s)} disabled={isArchiving} className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-muted hover:text-ink" title="Arşivle">
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              </div>

              <Link href={`/sheets/${s.id}`} className="min-w-0">
                <h3 className="flex items-start justify-between gap-2 text-[14px] font-medium leading-snug text-ink transition-colors group-hover:text-brand-strong">
                  <span className="min-w-0">{s.title}</span>
                  <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </h3>
              </Link>
              {s.department_id && deptName.get(s.department_id) && (
                <p className="mt-0.5 text-[11.5px] text-subtle">{deptName.get(s.department_id)}</p>
              )}
              {s.description && <p className="mt-1 line-clamp-2 text-[12px] text-muted">{s.description}</p>}
              {(s.tags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px] text-subtle">
                <span>
                  {s.created_by && memberNames[s.created_by] ? memberNames[s.created_by] : "—"}
                </span>
                <span>
                  {new Date(s.updated_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] text-subtle">{filtered.length} tablo gösteriliyor</p>

      {modalOpen && (
        <SheetFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          sheet={editing}
          isAdmin={isAdmin}
          readOnly={editing ? !canMutate(editing) : false}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
