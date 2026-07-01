"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle } from "lucide-react";
import { createCrmContact, updateCrmContact } from "@/lib/actions/crm";
import { CRM_SEGMENTS, CRM_STATUSES, CRM_SOURCE_CHANNELS } from "@/lib/crm/constants";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceContact } from "@/types";

interface Member {
  userId: string;
  name: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  members: Member[];
  contact?: WorkspaceContact | null;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";
const labelCls = "block text-[12px] font-medium text-muted mb-1";

export function CrmContactModal({ onClose, onSaved, members, contact }: Props) {
  const isEdit = !!contact;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: contact?.name ?? "",
    organization: contact?.organization ?? "",
    segment: contact?.segment ?? "",
    crm_status: contact?.crm_status ?? "",
    source_channel: contact?.source_channel ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    role_label: contact?.role_label ?? "",
    owner_id: contact?.owner_id ?? "",
    last_contact_at: contact?.last_contact_at ?? "",
    next_follow_up_at: contact?.next_follow_up_at ?? "",
    notes: contact?.notes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function handleSave() {
    setError(null);
    if (!form.name.trim()) {
      setError("İsim gerekli.");
      return;
    }
    startTransition(async () => {
      const payload = { ...form };
      const result = isEdit
        ? await updateCrmContact(contact!.id, payload)
        : await createCrmContact(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-surface shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">
            {isEdit ? "İlişkiyi düzenle" : "Yeni ilişki ekle"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-subtle transition-colors hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className={labelCls}>İsim *</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Kurum / Marka</label>
              <input className={inputCls} value={form.organization} onChange={(e) => set("organization", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Rol / Ünvan</label>
              <input className={inputCls} value={form.role_label} onChange={(e) => set("role_label", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Segment</label>
              <select className={inputCls} value={form.segment} onChange={(e) => set("segment", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_SEGMENTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Durum</label>
              <select className={inputCls} value={form.crm_status} onChange={(e) => set("crm_status", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>E-posta</label>
              <input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Kaynak</label>
              <select className={inputCls} value={form.source_channel} onChange={(e) => set("source_channel", e.target.value)}>
                <option value="">Seçiniz</option>
                {CRM_SOURCE_CHANNELS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Sorumlu kişi</label>
              <select className={inputCls} value={form.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
                <option value="">Seçiniz</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Son temas</label>
              <input type="date" className={inputCls} value={form.last_contact_at} onChange={(e) => set("last_contact_at", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Sonraki takip</label>
              <input type="date" className={inputCls} value={form.next_follow_up_at} onChange={(e) => set("next_follow_up_at", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Not</label>
            <textarea
              className={cn(inputCls, "resize-y")}
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Müşteri özel notu, tercihler, geçmiş…"
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
            İptal
          </button>
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
        </div>
      </div>
    </div>
  );
}
