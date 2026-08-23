"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle } from "lucide-react";
import { createOperationDocument, updateOperationDocument } from "@/lib/actions/documents";
import { DOCUMENT_TYPES, OFFICE_STATUSES } from "@/lib/office/constants";
import { cn } from "@/lib/utils/cn";
import type { OperationDocument, LinkDocumentType, WorkspaceDepartment } from "@/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  document?: OperationDocument | null;
  isAdmin: boolean;
  /** True when the caller may only view this record (approved, not owner). */
  readOnly?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle transition-colors duration-150 focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 disabled:opacity-60 disabled:bg-surface-sunken";
const labelCls = "block text-[12px] font-medium text-muted mb-1";

// Best-effort type guess from the pasted URL host.
function guessType(url: string): LinkDocumentType {
  const u = url.toLowerCase();
  if (u.includes("docs.google.com/spreadsheets")) return "google_sheet";
  if (u.includes("docs.google.com/document")) return "google_doc";
  if (u.includes("drive.google")) return "drive_link";
  if (u.includes("canva.")) return "canva";
  if (u.includes("figma.")) return "figma";
  if (u.endsWith(".pdf") || u.includes(".pdf?")) return "pdf_link";
  if (u.endsWith(".docx") || u.endsWith(".doc")) return "word_link";
  if (u.endsWith(".xlsx") || u.endsWith(".xls")) return "excel_link";
  if (u.startsWith("http")) return "website";
  return "other";
}

export function DocumentFormModal({
  onClose, onSaved, departments, tasks, contacts, document: doc, isAdmin, readOnly = false,
}: Props) {
  const isEdit = !!doc;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typeTouched, setTypeTouched] = useState(isEdit);

  const [form, setForm] = useState({
    title: doc?.title ?? "",
    description: doc?.description ?? "",
    document_type: (doc?.document_type ?? "other") as LinkDocumentType,
    url: doc?.url ?? "",
    status: doc?.status ?? "draft",
    department_id: doc?.department_id ?? "",
    related_task_id: doc?.related_task_id ?? "",
    related_contact_id: doc?.related_contact_id ?? "",
    tags: (doc?.tags ?? []).join(", "),
    notes: doc?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleUrlChange(v: string) {
    setForm((f) => ({
      ...f,
      url: v,
      document_type: typeTouched ? f.document_type : guessType(v),
    }));
  }

  // Members create drafts; only admins may set other statuses. The server
  // enforces the same rule — this just keeps the form honest.
  const statusOptions = isAdmin
    ? OFFICE_STATUSES
    : OFFICE_STATUSES.filter((s) => s.key === "draft" || s.key === "in_review");

  function handleSave() {
    if (readOnly) return onClose();
    setError(null);
    if (!form.title.trim()) return setError("Başlık gerekli.");
    const payload = {
      title: form.title,
      description: form.description,
      document_type: form.document_type,
      url: form.url,
      status: form.status as "draft" | "in_review" | "approved" | "archived",
      department_id: form.department_id,
      related_task_id: form.related_task_id,
      related_contact_id: form.related_contact_id,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: form.notes,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateOperationDocument(doc!.id, payload)
        : await createOperationDocument(payload);
      if ("error" in result) return setError(result.error);
      onSaved();
    });
  }

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="anim-scale-in w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-surface shadow-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            {readOnly ? "Doküman detayı" : isEdit ? "Dokümanı düzenle" : "Yeni doküman ekle"}
          </h2>
          <button onClick={onClose} aria-label="Kapat" className="rounded-lg p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className={labelCls}>Başlık *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus={!readOnly} disabled={readOnly} />
          </div>
          <div>
            <label className={labelCls}>Açıklama</label>
            <textarea
              className={cn(inputCls, "resize-y")}
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className={labelCls}>Bağlantı (URL)</label>
            <input
              className={cn(inputCls, "truncate")}
              value={form.url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://… (dahili not için boş bırakılabilir)"
              inputMode="url"
              disabled={readOnly}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tür</label>
              <select
                className={inputCls}
                value={form.document_type}
                onChange={(e) => { setTypeTouched(true); set("document_type", e.target.value); }}
                disabled={readOnly}
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Durum</label>
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)} disabled={readOnly}>
                {statusOptions.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Departman</label>
            <select className={inputCls} value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={readOnly}>
              <option value="">Seçiniz</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>İlgili görev</label>
              <select className={inputCls} value={form.related_task_id} onChange={(e) => set("related_task_id", e.target.value)} disabled={readOnly}>
                <option value="">Seçiniz</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>İlgili kişi</label>
              <select className={inputCls} value={form.related_contact_id} onChange={(e) => set("related_contact_id", e.target.value)} disabled={readOnly}>
                <option value="">Seçiniz</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Etiketler</label>
            <input
              className={inputCls}
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="Virgülle ayırın: fiyat listesi, 2026 koleksiyon"
              disabled={readOnly}
            />
          </div>

          <div>
            <label className={labelCls}>Notlar</label>
            <textarea
              className={cn(inputCls, "resize-y")}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={readOnly}
            />
          </div>

          {error && (
            <div className="anim-fade-down flex items-start gap-2 rounded-lg border border-[#f1c3bb] bg-[#fdeae7] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#971f12]">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.98]">
            {readOnly ? "Kapat" : "İptal"}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={isPending}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-colors duration-150 active:scale-[0.98]",
                isPending ? "bg-brand/60 cursor-not-allowed" : "bg-brand hover:bg-brand-strong",
              )}
            >
              {isPending ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Ekle"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
