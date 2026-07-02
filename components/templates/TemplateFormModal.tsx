"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { X, AlertCircle } from "lucide-react";
import { createDocumentTemplate, updateDocumentTemplate } from "@/lib/actions/templates";
import {
  TEMPLATE_CATEGORIES, TEMPLATE_CHANNELS, OFFICE_STATUSES, TEMPLATE_VARIABLE_SUGGESTIONS,
} from "@/lib/office/constants";
import { cn } from "@/lib/utils/cn";
import type { TemplateEditorValue } from "./LexicalTemplateEditor";
import type { DocumentTemplate, TemplateCategory, TemplateChannel, WorkspaceDepartment } from "@/types";

// Lexical must never render on the server — client-only chunk with a quiet
// placeholder while it loads.
const LexicalTemplateEditor = dynamic(
  () => import("./LexicalTemplateEditor").then((m) => m.LexicalTemplateEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[220px] animate-pulse rounded-lg border border-line bg-surface-muted/40" />
    ),
  },
);

interface Props {
  onClose: () => void;
  onSaved: () => void;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  template?: DocumentTemplate | null;
  isAdmin: boolean;
  readOnly?: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring disabled:opacity-60";
const labelCls = "block text-[12px] font-medium text-muted mb-1";

/** Pull {{token}} occurrences out of the template text. */
function extractVariables(text: string): string[] {
  const found = text.match(/\{\{\s*[\w.çğıöşüÇĞİÖŞÜ-]+\s*\}\}/g) ?? [];
  return [...new Set(found.map((v) => v.replace(/\s+/g, "")))];
}

export function TemplateFormModal({
  onClose, onSaved, departments, tasks, contacts, template, isAdmin, readOnly = false,
}: Props) {
  const isEdit = !!template;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: template?.title ?? "",
    description: template?.description ?? "",
    category: (template?.category ?? "customer_email") as TemplateCategory,
    channel: (template?.channel ?? "email") as TemplateChannel,
    status: template?.status ?? "draft",
    department_id: template?.department_id ?? "",
    related_task_id: template?.related_task_id ?? "",
    related_contact_id: template?.related_contact_id ?? "",
    tags: (template?.tags ?? []).join(", "),
  });

  // Editor output lives in a ref — it changes on every keystroke and must not
  // re-render the whole modal.
  const contentRef = useRef<TemplateEditorValue>({
    // Seed with the stored content so saving without touching the editor
    // never wipes the existing template body.
    json: template?.content_json ? JSON.stringify(template.content_json) : "",
    html: template?.content_html ?? "",
    text: template?.plain_text ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const statusOptions = isAdmin
    ? OFFICE_STATUSES
    : OFFICE_STATUSES.filter((s) => s.key === "draft" || s.key === "in_review");

  function handleSave() {
    if (readOnly) return onClose();
    setError(null);
    if (!form.title.trim()) return setError("Başlık gerekli.");
    const content = contentRef.current;
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      channel: form.channel,
      content_json: content.json,
      content_html: content.html,
      plain_text: content.text,
      variables: extractVariables(content.text),
      status: form.status as "draft" | "in_review" | "approved" | "archived",
      department_id: form.department_id,
      related_task_id: form.related_task_id,
      related_contact_id: form.related_contact_id,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateDocumentTemplate(template!.id, payload)
        : await createDocumentTemplate(payload);
      if ("error" in result) return setError(result.error);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-surface shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">
            {readOnly ? "Şablon detayı" : isEdit ? "Şablonu düzenle" : "Yeni şablon ekle"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-subtle transition-colors hover:text-ink">
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
            <input
              className={inputCls}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Bu şablon ne zaman kullanılır?"
              disabled={readOnly}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Kategori</label>
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)} disabled={readOnly}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Kanal</label>
              <select className={inputCls} value={form.channel} onChange={(e) => set("channel", e.target.value)} disabled={readOnly}>
                {TEMPLATE_CHANNELS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
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
            <label className={labelCls}>İçerik</label>
            <LexicalTemplateEditor
              initialJson={
                template?.content_json ? JSON.stringify(template.content_json) : null
              }
              initialPlainText={template?.plain_text}
              readOnly={readOnly}
              variableSuggestions={TEMPLATE_VARIABLE_SUGGESTIONS}
              onChange={(value) => { contentRef.current = value; }}
            />
            {!readOnly && (
              <p className="mt-1 text-[11.5px] text-subtle">
                Değişkenler kaydederken içerikten otomatik algılanır — ör. {"{{customer_name}}"}.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Departman</label>
              <select className={inputCls} value={form.department_id} onChange={(e) => set("department_id", e.target.value)} disabled={readOnly}>
                <option value="">Seçiniz</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
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
              placeholder="Virgülle ayırın: sipariş, toptan"
              disabled={readOnly}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-[#f1c3bb] bg-[#fdeae7] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#971f12]">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] text-muted transition-colors hover:bg-surface-muted">
            {readOnly ? "Kapat" : "İptal"}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={isPending}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-colors",
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
