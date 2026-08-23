"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, FolderOpen, ExternalLink, Pencil, Archive, StickyNote,
} from "lucide-react";
import { archiveOperationDocument } from "@/lib/actions/documents";
import {
  DOCUMENT_TYPES, OFFICE_STATUSES, documentTypeLabel, officeStatusLabel,
  DOCUMENT_TYPE_TONE, OFFICE_STATUS_TONE,
} from "@/lib/office/constants";
import { formatDateOnlyTR } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { DocumentFormModal } from "./DocumentFormModal";
import { DocumentFiles, type DocFolder, type DocFile } from "./DocumentFiles";
import type { OperationDocument, WorkspaceDepartment } from "@/types";

interface Props {
  documents: OperationDocument[];
  /** Klasör ağacı + yüklenmiş dosyalar (20240312). */
  folders?: DocFolder[];
  files?: DocFile[];
  /** Tablo migrate edilmemişse dosya bölümü hiç çizilmez. */
  filesAvailable?: boolean;
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

export function DocumentsView({
  documents, departments, tasks, contacts, memberNames, currentUserId, isAdmin,
  folders = [], files = [], filesAvailable = false,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState("");
  const [status, setStatus] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OperationDocument | null>(null);
  const [isArchiving, startArchive] = useTransition();

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );
  const taskTitle = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const contactName = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);

  // Yüklenen DOSYALAR yukarıdaki klasör tarayıcısında yaşar; "Bağlantılar"
  // listesi yalnız dış kaynakları (Drive, Canva, Figma…) gösterir. Aksi hâlde
  // aynı dosya iki yerde birden görünüyordu (390px denetiminde fark edildi).
  const links = useMemo(
    () => (filesAvailable ? documents.filter((d) => d.document_type !== "file") : documents),
    [documents, filesAvailable],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const d of links) for (const t of d.tags ?? []) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [links]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return links.filter((d) => {
      if (!showArchived && d.status === "archived") return false;
      if (docType && d.document_type !== docType) return false;
      if (status && d.status !== status) return false;
      if (deptFilter && d.department_id !== deptFilter) return false;
      if (tagFilter && !(d.tags ?? []).includes(tagFilter)) return false;
      if (!q) return true;
      return norm(
        [d.title, d.description, d.notes, d.url, ...(d.tags ?? [])].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [links, query, docType, status, deptFilter, tagFilter, showArchived]);

  function canMutate(d: OperationDocument) {
    if (isAdmin) return true;
    return d.created_by === currentUserId && (d.status === "draft" || d.status === "in_review");
  }
  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(d: OperationDocument) { setEditing(d); setModalOpen(true); }
  function handleArchive(d: OperationDocument) {
    if (!confirm(`"${d.title}" dokümanını arşivlemek istiyor musunuz?`)) return;
    startArchive(async () => {
      await archiveOperationDocument(d.id);
      router.refresh();
    });
  }

  const selectCls =
    "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Documents"
        description="Dosyalarınızı klasörlerde saklayın; Drive, Canva ve dış bağlantıları da aynı yerde künyeleyin."
        icon={FolderOpen}
        secondaryBackHref="/board"
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus size={15} />
            Yeni doküman ekle
          </button>
        }
      />

      {/* DOSYALAR — Aslı Hanım (2026-08-19): "Drive, Word, Excel hepsinin
          burada olduğu böyle klasör şeklinde ayırmayı düşündüm." Maliyet
          araştırıldı (Pro planda 100 GB dahil → ek maliyet ₺0), modül gerçek
          dosya saklamaya açıldı. Bağlantı kayıtları altta duruyor. */}
      {filesAvailable && (
        <div className="mb-6">
          <DocumentFiles folders={folders} files={files} memberNames={memberNames} isAdmin={isAdmin} />
        </div>
      )}

      {/* Bağlantılar — Drive/Canva/Figma künyeleri. Dosya değil, dış kaynak. */}
      {filesAvailable && (
        <h2 className="mb-2 mt-8 border-t border-line-strong pt-6 text-[16px] font-semibold tracking-tight text-ink">
          Bağlantılar
        </h2>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık, açıklama veya etiket ara…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
          />
        </div>
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className={selectCls}>
          <option value="">Tüm türler</option>
          {DOCUMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">Tüm durumlar</option>
          {OFFICE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls}>
          <option value="">Tüm departmanlar</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={selectCls}>
            <option value="">Tüm etiketler</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="anim-fade-up rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={documents.length === 0 ? FolderOpen : Search}
            title={
              documents.length === 0
                ? "Henüz kayıtlı doküman yok. İlk dokümanı ekleyin."
                : "Filtreye uyan doküman bulunamadı."
            }
          />
        </div>
      ) : (
        <div className="anim-fade-up overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="select-none border-b border-line text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-4 py-3 font-semibold">Başlık</th>
                <th className="px-3 py-3 font-semibold">Tür</th>
                <th className="px-3 py-3 font-semibold">Departman</th>
                <th className="px-3 py-3 font-semibold">İlgili görev</th>
                <th className="px-3 py-3 font-semibold">İlgili kişi</th>
                <th className="px-3 py-3 font-semibold">Durum</th>
                <th className="px-3 py-3 font-semibold">Sahip</th>
                <th className="px-3 py-3 font-semibold">Güncellenme</th>
                <th className="px-3 py-3 text-right font-semibold">Aç</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-line/60 last:border-b-0 transition-colors duration-150 hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="font-medium leading-snug text-ink">{d.title}</div>
                    {d.description && (
                      <div className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{d.description}</div>
                    )}
                    {(d.tags ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d.tags.map((t) => (
                          <span key={t} className="rounded-md border border-hairline bg-surface-muted px-1.5 py-0.5 text-[12px] font-medium text-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium", DOCUMENT_TYPE_TONE[d.document_type])}>
                      {documentTypeLabel(d.document_type)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {d.department_id ? deptName.get(d.department_id) ?? "—" : "—"}
                  </td>
                  <td className="max-w-[180px] px-3 py-3">
                    <span className="line-clamp-1 text-muted">
                      {d.related_task_id ? taskTitle.get(d.related_task_id) ?? "—" : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {d.related_contact_id ? contactName.get(d.related_contact_id) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium", OFFICE_STATUS_TONE[d.status])}>
                      {officeStatusLabel(d.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {d.owner_id ? memberNames[d.owner_id] ?? "—" : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">
                    {formatDateOnlyTR(d.updated_at)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {d.url ? (
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tap-target inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium text-brand transition-colors duration-150 hover:bg-brand-soft active:scale-[0.98]"
                          title="Bağlantıyı yeni sekmede aç"
                        >
                          Bağlantıyı aç <ExternalLink size={12} />
                        </a>
                      ) : (
                        <button
                          onClick={() => openEdit(d)}
                          className="tap-target inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
                          title="Detayı görüntüle"
                        >
                          <StickyNote size={12} /> Detay
                        </button>
                      )}
                      {canMutate(d) && (
                        <button onClick={() => openEdit(d)} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95" title="Düzenle">
                          <Pencil size={13} />
                        </button>
                      )}
                      {isAdmin && d.status !== "archived" && (
                        <button onClick={() => handleArchive(d)} disabled={isArchiving} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-50" title="Arşivle">
                          <Archive size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] tabular-nums text-subtle">{filtered.length} doküman gösteriliyor</p>

      {modalOpen && (
        <DocumentFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          document={editing}
          isAdmin={isAdmin}
          readOnly={editing ? !canMutate(editing) : false}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
