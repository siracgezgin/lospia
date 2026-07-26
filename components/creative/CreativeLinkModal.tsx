"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle } from "lucide-react";
import { createCreativeAsset, updateCreativeAsset } from "@/lib/actions/creative";
import { CREATIVE_PROVIDERS, CREATIVE_STATUSES } from "@/lib/creative/constants";
import { cn } from "@/lib/utils/cn";
import type { CreativeAsset, CreativeProvider, WorkspaceDepartment } from "@/types";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  departments: Pick<WorkspaceDepartment, "id" | "name">[];
  tasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
  asset?: CreativeAsset | null;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 disabled:opacity-60 disabled:bg-surface-sunken";
const labelCls = "block text-[12px] font-medium text-muted mb-1";

// Best-effort provider guess from the pasted URL host.
function guessProvider(url: string): CreativeProvider {
  const u = url.toLowerCase();
  if (u.includes("canva.")) return "canva";
  if (u.includes("drive.google") || u.includes("docs.google")) return "google_drive";
  if (u.includes("dropbox.")) return "dropbox";
  if (u.includes("figma.")) return "figma";
  if (u.startsWith("http")) return "website";
  return "other";
}

export function CreativeLinkModal({ onClose, onSaved, departments, tasks, contacts, asset }: Props) {
  const isEdit = !!asset;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [providerTouched, setProviderTouched] = useState(isEdit);

  const [form, setForm] = useState({
    title: asset?.title ?? "",
    url: asset?.url ?? "",
    provider: (asset?.provider ?? "other") as CreativeProvider,
    status: asset?.status ?? "draft",
    department_id: asset?.department_id ?? "",
    related_task_id: asset?.related_task_id ?? "",
    related_contact_id: asset?.related_contact_id ?? "",
    notes: asset?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleUrlChange(v: string) {
    setForm((f) => ({
      ...f,
      url: v,
      provider: providerTouched ? f.provider : guessProvider(v),
    }));
  }

  function handleSave() {
    setError(null);
    if (!form.title.trim()) return setError("Başlık gerekli.");
    if (!form.url.trim()) return setError("Bağlantı gerekli.");
    startTransition(async () => {
      const result = isEdit
        ? await updateCreativeAsset(asset!.id, form)
        : await createCreativeAsset(form);
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
            {isEdit ? "Bağlantıyı düzenle" : "Yeni bağlantı ekle"}
          </h2>
          <button onClick={onClose} aria-label="Kapat" className="rounded-lg p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className={labelCls}>Başlık *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Bağlantı (URL) *</label>
            <input
              className={cn(inputCls, "truncate")}
              value={form.url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Kaynak</label>
              <select
                className={inputCls}
                value={form.provider}
                onChange={(e) => { setProviderTouched(true); set("provider", e.target.value); }}
              >
                {CREATIVE_PROVIDERS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Durum</label>
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {CREATIVE_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Departman</label>
            <select className={inputCls} value={form.department_id} onChange={(e) => set("department_id", e.target.value)}>
              <option value="">Seçiniz</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>İlgili görev</label>
              <select className={inputCls} value={form.related_task_id} onChange={(e) => set("related_task_id", e.target.value)}>
                <option value="">Seçiniz</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>İlgili ilişki</label>
              <select className={inputCls} value={form.related_contact_id} onChange={(e) => set("related_contact_id", e.target.value)}>
                <option value="">Seçiniz</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Not</label>
            <textarea
              className={cn(inputCls, "resize-y")}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
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
            İptal
          </button>
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
        </div>
      </div>
    </div>
  );
}
