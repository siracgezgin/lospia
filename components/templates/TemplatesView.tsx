"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, FileText, Pencil, Archive, Copy, ClipboardType, Eye, Check,
} from "lucide-react";
import { archiveDocumentTemplate } from "@/lib/actions/templates";
import {
  TEMPLATE_CATEGORIES, TEMPLATE_CHANNELS, OFFICE_STATUSES,
  templateCategoryLabel, templateChannelLabel, officeStatusLabel,
  TEMPLATE_CHANNEL_TONE, OFFICE_STATUS_TONE,
} from "@/lib/office/constants";
import { copyPlainText, copyRichText } from "@/lib/utils/clipboard";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { TemplateFormModal } from "./TemplateFormModal";
import type { DocumentTemplate, WorkspaceDepartment } from "@/types";

interface Props {
  templates: DocumentTemplate[];
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
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

export function TemplatesView({
  templates, departments, tasks, contacts, currentUserId, isAdmin,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isArchiving, startArchive] = useTransition();

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return templates.filter((t) => {
      if (!showArchived && t.status === "archived") return false;
      if (category && t.category !== category) return false;
      if (channel && t.channel !== channel) return false;
      if (status && t.status !== status) return false;
      if (deptFilter && t.department_id !== deptFilter) return false;
      if (!q) return true;
      return norm(
        [t.title, t.description, t.plain_text, ...(t.tags ?? [])].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [templates, query, category, channel, status, deptFilter, showArchived]);

  function canMutate(t: DocumentTemplate) {
    if (isAdmin) return true;
    return t.created_by === currentUserId && (t.status === "draft" || t.status === "in_review");
  }

  function openNew() { setEditing(null); setViewOnly(false); setModalOpen(true); }
  function openEdit(t: DocumentTemplate) { setEditing(t); setViewOnly(false); setModalOpen(true); }
  function openView(t: DocumentTemplate) { setEditing(t); setViewOnly(true); setModalOpen(true); }

  function showToast(message: string, templateId?: string) {
    setToast(message);
    if (templateId) setCopiedId(templateId);
    window.setTimeout(() => { setToast(null); setCopiedId(null); }, 2200);
  }

  async function handleCopyPlain(t: DocumentTemplate) {
    const ok = await copyPlainText(t.plain_text ?? "");
    showToast(ok ? "Şablon kopyalandı." : "Kopyalama başarısız oldu.", ok ? t.id : undefined);
  }

  async function handleCopyRich(t: DocumentTemplate) {
    const ok = await copyRichText(t.content_html ?? t.plain_text ?? "", t.plain_text ?? "");
    showToast(ok ? "Şablon kopyalandı." : "Kopyalama başarısız oldu.", ok ? t.id : undefined);
  }

  function handleArchive(t: DocumentTemplate) {
    if (!confirm(`"${t.title}" şablonunu arşivlemek istiyor musunuz?`)) return;
    startArchive(async () => {
      await archiveDocumentTemplate(t.id);
      router.refresh();
    });
  }

  const selectCls =
    "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Şablon Kütüphanesi"
        description="Format e-postalar, müşteri mesajları, üretici briefleri ve operasyon metinlerini tek merkezde yönetin — kopyalayıp Gmail veya WhatsApp'a yapıştırın."
        icon={FileText}
        secondaryBackHref="/board"
        rightSlot={
          <button
            onClick={openNew}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus size={15} />
            Yeni şablon ekle
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
            placeholder="Başlık veya içerik ara…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          <option value="">Tüm kategoriler</option>
          {TEMPLATE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectCls}>
          <option value="">Tüm kanallar</option>
          {TEMPLATE_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">Tüm durumlar</option>
          {OFFICE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls}>
          <option value="">Tüm departmanlar</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted transition-colors duration-150 hover:text-ink">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          Arşivi göster
        </label>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="anim-fade-up rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={templates.length === 0 ? FileText : Search}
            title={
              templates.length === 0
                ? "Henüz kayıtlı şablon yok. İlk şablonu ekleyin."
                : "Filtreye uyan şablon bulunamadı."
            }
          />
        </div>
      ) : (
        <div className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 ease-standard hover:-translate-y-px hover:shadow-card-hover">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium", TEMPLATE_CHANNEL_TONE[t.channel])}>
                    {templateChannelLabel(t.channel)}
                  </span>
                  <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[10.5px] font-medium text-muted">
                    {templateCategoryLabel(t.category)}
                  </span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[10.5px] font-medium", OFFICE_STATUS_TONE[t.status])}>
                    {officeStatusLabel(t.status)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => openView(t)} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95" title="Görüntüle">
                    <Eye size={13} />
                  </button>
                  {canMutate(t) && (
                    <button onClick={() => openEdit(t)} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95" title="Düzenle">
                      <Pencil size={13} />
                    </button>
                  )}
                  {isAdmin && t.status !== "archived" && (
                    <button onClick={() => handleArchive(t)} disabled={isArchiving} className="rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-50" title="Arşivle">
                      <Archive size={13} />
                    </button>
                  )}
                </div>
              </div>

              <h3 className="text-[14px] font-semibold leading-snug tracking-tight text-ink">{t.title}</h3>
              {t.department_id && deptName.get(t.department_id) && (
                <p className="mt-0.5 text-[11.5px] text-subtle">{deptName.get(t.department_id)}</p>
              )}
              {t.description && <p className="mt-1 line-clamp-1 text-[12px] text-muted">{t.description}</p>}
              {t.plain_text && (
                <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-[12px] leading-relaxed text-muted">
                  {t.plain_text}
                </p>
              )}
              {(t.variables ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.variables.map((v) => (
                    <span key={v} className="rounded-md border border-hairline bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      {v}
                    </span>
                  ))}
                </div>
              )}

              <div className="h-3 flex-1" />
              <div className="flex items-center gap-1.5 border-t border-hairline pt-2.5">
                <button
                  onClick={() => handleCopyPlain(t)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors duration-150 active:scale-[0.98]",
                    copiedId === t.id ? "bg-brand-soft text-brand-strong" : "text-brand hover:bg-brand-soft",
                  )}
                  title="Düz metin olarak panoya kopyala"
                >
                  {copiedId === t.id ? <Check size={12} /> : <Copy size={12} />}
                  Metni kopyala
                </button>
                <button
                  onClick={() => handleCopyRich(t)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
                  title="Biçimli metin olarak panoya kopyala (Gmail/Word)"
                >
                  <ClipboardType size={12} />
                  Zengin metin olarak kopyala
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 px-1 text-[12px] tabular-nums text-subtle">{filtered.length} şablon gösteriliyor</p>

      {modalOpen && (
        <TemplateFormModal
          departments={departments}
          tasks={tasks}
          contacts={contacts}
          template={editing}
          isAdmin={isAdmin}
          readOnly={viewOnly || (editing ? !canMutate(editing) : false)}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); router.refresh(); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
          <div className="anim-slide-up rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white shadow-pop">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
