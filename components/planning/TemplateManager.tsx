"use client";

// KULLANILMIYOR — 2026-09-05 itibarıyla hiçbir rota bu dosyayı import etmiyor.
// Toplantı şablonları yerine haftalık takvim iskeleti: lib/planning/scaffold.ts.
// Silinmesi kullanıcı onayı bekliyor; o güne kadar burada düzeltme yapmayın.
import { useState, useTransition } from "react";
import { Plus, Trash2, Pencil, Power, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldGrid, TextInput, SelectInput } from "@/components/ui/Field";
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

const EMPTY: Draft = {
  weekday: 0, time_slot: "09:00", category: "uretim",
  title: "", content: "", participant_ids: [], active: true,
};

/**
 * Haftanın iskeletini yönetir: "her gün aynı saatte üretim" gibi tekrar eden
 * blokları tanımla; "Haftayı şablondan kur" bu satırlardan toplantı üretir.
 * Yalnız yöneticiler açabilir (sayfa tarafında gizlenir, action da korur).
 *
 * Form ortak primitiflerle (Field / TextInput / SelectInput): etiket her
 * zaman görünür, tek boy, tek odak halkası. Pencerede TEK birincil düğme
 * (taslağın Kaydet'i); alt şerit "Şablon ekle" + "Kapat" ikincildir.
 */
export function TemplateManager({ templates, members, memberNames, onClose, onChanged }: Props) {
  const { ask, dialog } = useConfirm();
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

  async function handleDelete(t: PlanningTemplate) {
    if (!(await ask({
      title: "Şablon silinsin mi?",
      message: "Şablon kalkar; bu şablondan KURULMUŞ toplantılar silinmez.",
      confirmLabel: "Sil",
      tone: "danger",
    }))) return;
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
    <Overlay
      open
      onClose={onClose}
      title="Hafta Şablonları"
      hint="Tekrar eden ritim: gün + saat + kategori. “Haftayı şablondan kur” bu listeden toplantı üretir."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={openNew} className="mr-auto text-brand hover:text-brand-strong" disabled={!!draft}>
            <Plus size={14} aria-hidden /> Şablon ekle
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Kapat</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
            {error}
          </p>
        )}

        {/* Düzenleyici — bölümler: zaman · kategori · içerik · durum */}
        {draft && (
          <div className="anim-fade-down space-y-3.5 rounded-card border border-line-strong bg-surface-muted/40 p-3.5">
            <FieldGrid className="sm:grid-cols-3">
              <Field label="Gün">
                <SelectInput value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                  {DAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </SelectInput>
              </Field>
              <Field label="Saat">
                <TextInput type="time" value={draft.time_slot} onChange={(e) => setDraft({ ...draft, time_slot: e.target.value })} />
              </Field>
              <Field label="Varsayılan katılımcılar" htmlFor="tpl-members">
                <MemberMultiSelect members={members} selected={draft.participant_ids} onChange={(ids) => setDraft({ ...draft, participant_ids: ids })} placeholder="Üye seç…" />
              </Field>
            </FieldGrid>

            <div role="radiogroup" aria-label="Kategori">
              <span className="mb-1 block text-[12.5px] font-medium text-muted">Kategori</span>
              <div className="flex flex-wrap gap-1.5">
                {PLANNING_CATEGORIES.map((c) => {
                  const on = draft.category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setDraft({ ...draft, category: c.key })}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150 ease-standard active:scale-[0.97]",
                        on ? cn(c.chip, "font-semibold ring-1 ring-black/10") : "bg-surface-muted text-muted hover:bg-surface-hover hover:text-ink",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full ring-1 ring-inset ring-black/10", c.dot)} aria-hidden />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <FieldGrid>
              <Field label="Başlık">
                <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ready to Wear / One of a Kind…" />
              </Field>
              <Field label="Açıklama">
                <TextInput value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Kısa not" />
              </Field>
            </FieldGrid>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex min-h-[36px] cursor-pointer select-none items-center gap-2 text-[13px] text-muted transition-colors duration-150 hover:text-ink">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4 accent-brand" />
                Aktif — haftaya kurulur
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={isSaving}>Vazgeç</Button>
                <Button size="sm" onClick={handleSave} loading={isSaving && busyId === null}>Kaydet</Button>
              </div>
            </div>
          </div>
        )}

        {/* Liste — güne göre */}
        {templates.length === 0 && !draft && (
          <EmptyState
            compact
            icon={CalendarRange}
            title="Henüz şablon yok."
            description="Tekrar eden ritmi tanımlayın: gün, saat, kategori."
          />
        )}
        {byDay.map((list, day) =>
          list.length === 0 ? null : (
            <div key={day}>
              <h3 className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                <span className="shrink-0">{DAY_LABELS[day]}</span>
                {/* Listeyi tarif eden sayı — kişiyi puanlamaz. */}
                <span className="rounded-full bg-surface-sunken px-1.5 py-px text-[12px] font-medium tabular-nums text-subtle">{list.length}</span>
                <span className="h-px min-w-4 flex-1 bg-hairline" aria-hidden="true" />
              </h3>
              <ul className="space-y-1.5">
                {list.map((t) => {
                  const meta = categoryMeta(t.category);
                  const rowBusy = busyId === t.id && isSaving;
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-center gap-2 rounded-control border px-2.5 py-1.5 transition-colors duration-150",
                        meta.cell,
                        !t.active && "opacity-60",
                      )}
                    >
                      <span className="w-12 shrink-0 text-[12.5px] font-semibold tabular-nums text-ink/70">{t.time_slot}</span>
                      <span className={cn("min-w-0 flex-1 truncate text-[13px] font-semibold", meta.title)}>
                        {meta.label}{t.title ? ` / ${t.title}` : ""}
                      </span>
                      {!t.active && <Badge size="xs" className="shrink-0 bg-surface text-subtle">Pasif</Badge>}
                      {t.participant_ids?.length > 0 && (
                        <MemberInitials ids={t.participant_ids} memberNames={memberNames} className="shrink-0" />
                      )}
                      <div className="flex shrink-0 items-center gap-0.5">
                        <IconButton
                          size="sm"
                          aria-label={t.active ? "Pasifleştir" : "Aktifleştir"}
                          title={t.active ? "Pasifleştir" : "Aktifleştir"}
                          onClick={() => handleToggleActive(t)}
                          disabled={rowBusy}
                          className="text-ink/60 hover:bg-black/5 hover:text-ink"
                        >
                          <Power size={14} />
                        </IconButton>
                        <IconButton size="sm" aria-label="Düzenle" title="Düzenle" onClick={() => openEdit(t)} className="text-ink/60 hover:bg-black/5 hover:text-ink">
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton size="sm" aria-label="Sil" title="Sil" onClick={() => handleDelete(t)} disabled={rowBusy} className="text-ink/60 hover:bg-danger/10 hover:text-danger">
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
        )}
      </div>
      {dialog}
    </Overlay>
  );
}
