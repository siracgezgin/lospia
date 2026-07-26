"use client";

import { useState, useTransition } from "react";
import { X, Plus, Trash2, Loader2, Save, Pencil, Power } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveTemplate, deleteTemplate, type TemplateInput } from "@/lib/actions/planning";
import { PLANNING_CATEGORIES, categoryMeta } from "@/lib/planning/categories";
import { MemberMultiSelect, MemberInitials, type Member } from "./MemberMultiSelect";
import type { PlanningCategory, PlanningTemplate } from "@/types";

interface Props {
  templates: PlanningTemplate[];
  members: Member[];
  memberNames: Record<string, string>;
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası (router.refresh)
}

type Draft = {
  id?: string | null;
  weekday: number;
  time_slot: string;
  category: PlanningCategory;
  title: string;
  content: string;
  participant_ids: string[];
  active: boolean;
};

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

const EMPTY: Draft = {
  weekday: 0, time_slot: "09:00", category: "uretim",
  title: "", content: "", participant_ids: [], active: true,
};

/**
 * Haftanın iskeletini yönetir: "her gün aynı saatte üretim" gibi tekrar eden
 * blokları tanımla; "Haftayı şablondan kur" bu satırlardan toplantı üretir.
 * Yalnız yöneticiler açabilir (sayfa tarafında gizlenir, action da korur).
 */
export function TemplateManager({ templates, members, memberNames, onClose, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const openNew = () => { setError(null); setDraft({ ...EMPTY }); };
  const openEdit = (t: PlanningTemplate) => {
    setError(null);
    setDraft({
      id: t.id, weekday: t.weekday, time_slot: t.time_slot, category: t.category,
      title: t.title ?? "", content: t.content ?? "",
      participant_ids: t.participant_ids ?? [], active: t.active,
    });
  };

  function handleSave() {
    if (!draft) return;
    setError(null);
    const payload: TemplateInput = {
      id: draft.id ?? undefined,
      weekday: draft.weekday,
      time_slot: draft.time_slot,
      category: draft.category,
      title: draft.title || null,
      content: draft.content || null,
      participant_ids: draft.participant_ids,
      active: draft.active,
    };
    startSave(async () => {
      const res = await saveTemplate(payload);
      if ("error" in res) { setError(res.error); return; }
      setDraft(null);
      onChanged();
    });
  }

  function handleToggleActive(t: PlanningTemplate) {
    setBusyId(t.id);
    startSave(async () => {
      const res = await saveTemplate({
        id: t.id, weekday: t.weekday, time_slot: t.time_slot, category: t.category,
        title: t.title, content: t.content, participant_ids: t.participant_ids ?? [],
        active: !t.active,
      });
      setBusyId(null);
      if ("error" in res) { setError(res.error); return; }
      onChanged();
    });
  }

  function handleDelete(t: PlanningTemplate) {
    if (!confirm("Bu şablonu silmek istiyor musunuz? (Kurulmuş toplantılar silinmez.)")) return;
    setBusyId(t.id);
    startSave(async () => {
      const res = await deleteTemplate(t.id);
      setBusyId(null);
      if ("error" in res) { setError(res.error); return; }
      onChanged();
    });
  }

  // Gün → şablonlar (görsel gruplama)
  const byDay: PlanningTemplate[][] = Array.from({ length: 7 }, () => []);
  for (const t of templates) byDay[t.weekday]?.push(t);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Hafta Şablonları</h2>
            <p className="text-[12px] text-subtle">
              Tekrar eden ritim: gün + saat + kategori. “Haftayı şablondan kur” bu listeden toplantı üretir.
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-ink"><X size={17} /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}

          {/* Düzenleyici */}
          {draft && (
            <div className="rounded-xl border border-line-strong bg-surface-muted/40 p-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Gün</span>
                  <select className={inputCls} value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                    {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Saat</span>
                  <input type="time" className={inputCls} value={draft.time_slot} onChange={(e) => setDraft({ ...draft, time_slot: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Varsayılan katılımcılar</span>
                  <MemberMultiSelect members={members} selected={draft.participant_ids} onChange={(ids) => setDraft({ ...draft, participant_ids: ids })} placeholder="Üye seç…" />
                </label>
              </div>
              <div className="mt-2.5">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kategori</span>
                <div className="flex flex-wrap gap-1.5">
                  {PLANNING_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setDraft({ ...draft, category: c.key })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition",
                        draft.category === c.key ? cn(c.chip, "ring-2 ring-offset-1 ring-ink/20") : "bg-surface-muted text-muted hover:text-ink",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Başlık</span>
                  <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ready to Wear / One of a Kind…" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Açıklama</span>
                  <input className={inputCls} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Opsiyonel içerik notu…" />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-3.5 w-3.5 accent-current" />
                  Aktif (haftaya kurulur)
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDraft(null)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink">Vazgeç</button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Liste — güne göre */}
          {templates.length === 0 && !draft && (
            <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-subtle">
              Henüz şablon yok. Aslı Hanım&apos;ın ritmini kurun: örn. her gün 09:00 <b>Üretim</b>,
              Pzt/Çar/Cum 10:00 <b>AI</b>, her gün 11:00 <b>Sales</b>, 12:00 <b>Sistem</b>.
            </p>
          )}
          {byDay.map((list, day) =>
            list.length === 0 ? null : (
              <div key={day}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">{DAY_LABELS[day]}</h3>
                <div className="space-y-1.5">
                  {list.map((t) => {
                    const meta = categoryMeta(t.category);
                    return (
                      <div key={t.id} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", meta.cell, !t.active && "opacity-50")}>
                        <span className="w-12 shrink-0 text-[12px] font-semibold tabular-nums text-ink/70">{t.time_slot}</span>
                        <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-semibold", meta.title)}>
                          {meta.label}{t.title ? ` / ${t.title}` : ""}
                          {!t.active && <span className="ml-1.5 text-[10.5px] font-normal text-ink/50">(pasif)</span>}
                        </span>
                        {t.participant_ids?.length > 0 && (
                          <MemberInitials ids={t.participant_ids} memberNames={memberNames} className="shrink-0" />
                        )}
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button onClick={() => handleToggleActive(t)} className="rounded p-1 text-ink/50 hover:text-ink" title={t.active ? "Pasifleştir" : "Aktifleştir"}>
                            {busyId === t.id && isSaving ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                          </button>
                          <button onClick={() => openEdit(t)} className="rounded p-1 text-ink/50 hover:text-ink" title="Düzenle"><Pencil size={13} /></button>
                          <button onClick={() => handleDelete(t)} className="rounded p-1 text-ink/50 hover:text-red-600" title="Sil"><Trash2 size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Alt bar */}
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <button onClick={openNew} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:text-brand-strong">
            <Plus size={14} /> Şablon ekle
          </button>
          <button onClick={onClose} className="rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted hover:text-ink">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
