"use client";

import { useState, useTransition } from "react";
import { X, Plus, Trash2, Loader2, Save, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  createMeeting, updateMeeting, deleteMeeting, saveMeetingTopics, assignTopicAsTask,
} from "@/lib/actions/planning";
import { PLANNING_CATEGORIES } from "@/lib/planning/categories";
import { MemberMultiSelect, type Member } from "./MemberMultiSelect";
import type { PlanningCategory, PlanningMeetingWithTopics } from "@/types";

interface Props {
  meeting: PlanningMeetingWithTopics | null; // null → yeni
  day: string;       // yyyy-MM-dd
  slot: string;      // "09:00"
  dayLabel: string;  // "Pazartesi 27 Tem"
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

type TopicDraft = {
  id?: string;
  text: string;
  participant_ids: string[];
  due_date: string;      // "yyyy-MM-dd" | ""
  task_id?: string | null;
};

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

export function MeetingEditor({ meeting, day, slot, dayLabel, members, onClose, onSaved }: Props) {
  const isNew = meeting === null;
  const [category, setCategory] = useState<PlanningCategory>(meeting?.category ?? "uretim");
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [content, setContent] = useState(meeting?.content ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(meeting?.participant_ids ?? []);
  const [topics, setTopics] = useState<TopicDraft[]>(() => {
    const existing: TopicDraft[] = (meeting?.topics ?? []).map((t) => ({
      id: t.id, text: t.text ?? "", participant_ids: t.participant_ids ?? [],
      due_date: t.due_date ?? "", task_id: t.task_id,
    }));
    while (existing.length < 3) existing.push({ text: "", participant_ids: [], due_date: "" });
    return existing;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [assigningIdx, setAssigningIdx] = useState<number | null>(null);
  const [assignedMsg, setAssignedMsg] = useState<string | null>(null);

  const setTopic = (i: number, patch: Partial<TopicDraft>) =>
    setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTopic = () => setTopics((ts) => [...ts, { text: "", participant_ids: [], due_date: "" }]);
  const removeTopic = (i: number) => setTopics((ts) => ts.filter((_, idx) => idx !== i));

  // Toplantı + konuları kaydeder; konu id'lerini geri yazar (Ata & bildir için).
  async function persist(): Promise<{ meetingId: string; posToId: Record<number, string> } | { error: string }> {
    const payload = { meeting_date: day, time_slot: slot, category, title, content, participant_ids: participantIds };
    let meetingId = meeting?.id;
    if (!meetingId) {
      const res = await createMeeting(payload);
      if ("error" in res) return { error: res.error };
      meetingId = res.id;
    } else {
      const res = await updateMeeting(meetingId, payload);
      if ("error" in res) return { error: res.error };
    }
    const tRes = await saveMeetingTopics(
      meetingId,
      topics.map((t, i) => ({
        id: t.id, position: i, text: t.text, participant_ids: t.participant_ids,
        due_date: t.due_date || null,
      })),
    );
    if ("error" in tRes) return { error: tRes.error };
    const posToId: Record<number, string> = {};
    for (const { position, id } of tRes.topics) posToId[position] = id;
    // Yerel taslaklara id'leri yaz (yeni satırlar için).
    setTopics((ts) => ts.map((t, i) => (posToId[i] ? { ...t, id: posToId[i] } : t)));
    return { meetingId, posToId };
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      const res = await persist();
      if ("error" in res) { setError(res.error); return; }
      onSaved();
    });
  }

  function handleAssign(i: number) {
    setError(null);
    setAssignedMsg(null);
    if (topics[i].participant_ids.length === 0) { setError(`Konu ${i + 1} için önce kişi seçin.`); return; }
    setAssigningIdx(i);
    startSave(async () => {
      const res = await persist();
      if ("error" in res) { setAssigningIdx(null); setError(res.error); return; }
      const topicId = res.posToId[i];
      if (!topicId) { setAssigningIdx(null); setError("Konu kaydedilemedi."); return; }
      const aRes = await assignTopicAsTask(topicId, { dueDate: topics[i].due_date || null });
      setAssigningIdx(null);
      if ("error" in aRes) { setError(aRes.error); return; }
      setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, task_id: aRes.taskId } : t)));
      setAssignedMsg(`Konu ${i + 1} göreve atandı, atananlara bildirim/mail gönderildi.`);
    });
  }

  function handleDelete() {
    if (!meeting) return;
    if (!confirm("Bu toplantıyı ve konularını silmek istiyor musunuz?")) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteMeeting(meeting.id);
      if ("error" in res) { setError(res.error); return; }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{isNew ? "Yeni toplantı" : "Toplantıyı düzenle"}</h2>
            <p className="text-[12px] text-subtle">{dayLabel} · {slot}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-ink"><X size={17} /></button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>}

          {/* Kategori seçici */}
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kategori</span>
            <div className="flex flex-wrap gap-1.5">
              {PLANNING_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition",
                    category === c.key ? cn(c.chip, "ring-2 ring-offset-1 ring-ink/20") : "bg-surface-muted text-muted hover:text-ink",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Başlık (kategori sonrası)</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ready to Wear / Lookbook / AFCOM…" />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Açıklama</span>
            <textarea className={cn(inputCls, "resize-y leading-relaxed")} rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Toplantı içeriği…" />
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kim</span>
            <MemberMultiSelect members={members} selected={participantIds} onChange={setParticipantIds} placeholder="Üye seç…" />
          </div>

          {/* Konular */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Konular</span>
              <span className="text-[10.5px] text-subtle">Kişi seç · tarih ver · “Ata &amp; bildir” ile göreve dönüştür</span>
            </div>
            {assignedMsg && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-800">
                <CheckCircle2 size={14} /> {assignedMsg}
              </div>
            )}
            <div className="space-y-1.5">
              {topics.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-medium text-subtle">{i + 1}</span>
                  <input className={cn(inputCls, "min-w-0 flex-1")} value={t.text} onChange={(e) => setTopic(i, { text: e.target.value })} placeholder={`Konu ${i + 1}`} />
                  <div className="w-24 shrink-0">
                    <MemberMultiSelect members={members} selected={t.participant_ids} onChange={(ids) => setTopic(i, { participant_ids: ids })} placeholder="Kim" compact />
                  </div>
                  <input
                    type="date"
                    className={cn(inputCls, "w-[130px] shrink-0")}
                    value={t.due_date}
                    onChange={(e) => setTopic(i, { due_date: e.target.value })}
                    title="Teslim tarihi (deadline)"
                  />
                  <button
                    onClick={() => handleAssign(i)}
                    disabled={isSaving || isDeleting}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-60",
                      t.task_id
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-line bg-surface text-muted hover:border-brand hover:text-brand",
                    )}
                    title={t.task_id ? "Görev oluşturuldu — güncelle & tekrar bildir" : "Konuyu göreve ata ve atananlara bildir"}
                  >
                    {assigningIdx === i ? <Loader2 size={13} className="animate-spin" /> : t.task_id ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    <span className="hidden sm:inline">{t.task_id ? "Atandı" : "Ata & bildir"}</span>
                  </button>
                  <button onClick={() => removeTopic(i)} className="shrink-0 rounded p-1 text-subtle hover:text-red-600" title="Sil"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={addTopic} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-strong">
              <Plus size={12} /> Konu ekle
            </button>
          </div>
        </div>

        {/* Alt bar */}
        <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          {!isNew ? (
            <button
              onClick={handleDelete}
              disabled={isSaving || isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Sil
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink">İptal</button>
            <button
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
