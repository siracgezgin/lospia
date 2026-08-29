"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextInput, TextArea } from "@/components/ui/Field";
import {
  createMeeting, updateMeeting, deleteMeeting, saveMeetingTopics, assignTopicAsTask,
} from "@/lib/actions/planning";
import { categoryMeta } from "@/lib/planning/categories";
import { normalizeSlot, istanbulLabel, HOME_LABEL, AWAY_LABEL } from "@/lib/planning/timezones";
import { MemberMultiSelect, type Member } from "./MemberMultiSelect";
import type { PlanningCategory, PlanningMeetingWithTopics } from "@/types";

interface Props {
  meeting: PlanningMeetingWithTopics | null; // null → yeni
  day: string;       // yyyy-MM-dd
  slot: string;      // "09:00" — tıklanan hücrenin saati, BAŞLANGIÇ değeri
  dayLabel: string;  // "Pazartesi 27 Tem"
  /** Toplantının OTURDUĞU şeridin kategorisi — renk buradan gelir, seçilmez. */
  bandCategory?: PlanningCategory;
  bandLabel?: string;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}

type TopicDraft = {
  id?: string;
  text: string;
  participant_ids: string[];   // SORUMLU
  collaborator_ids: string[];  // İŞ BİRLİĞİ (Aslı Hanım, 2026-08-19)
  due_date: string;      // "yyyy-MM-dd" | ""
  task_id?: string | null;
};

/**
 * Toplantı düzenleyici — SADE.
 *
 * Ekranda İKİ şey var: BAŞLIK ve KONULAR. Sırayla kaldırılanlar:
 *   • kategori seçici — ızgarada hiçbir şeyi değiştirmiyordu (renk şeritten),
 *   • "Yanında" (iş birliği) — "bir kişi zaten yeterli oluyor",
 *   • toplantı düzeyinde "Kim" — "iki defa kişi seçmek çok saçma; altta konuya
 *     göre seçiliyor ve orada mail de gidiyor",
 *   • konu satırındaki tarih — "zaten ben o tarihi seçip konu ekliyorum".
 * Kalan her kontrol ya ızgarada görünen bir şeyi değiştirir ya da bir mail
 * gönderir.
 *
 * Aslı Hanım (2026-08-28): "Minimum yazı, maksimum kullanılabilir." Eskiden
 * pencere dokuz kategori düğmesi, iki başlıklı metin alanı, iki kişi seçici ve
 * her konu satırında dört kontrolle açılıyordu. Şimdi ekranda yalnız BAŞLIK,
 * KİM ve KONU duruyor; kategori tek renk noktasının, not ve iş birliği ise
 * birer "ekle" bağlantısının arkasında — dolu olduklarında kendiliğinden
 * görünürler.
 *
 * SAAT ARTIK DÜZENLENEBİLİR. Saatler `lib/planning/bands.ts` iskeletinde sabit
 * olduğu için 17:00'a toplantı koymak mümkün değildi (2026-08-28: cumartesi
 * 17:00 Ebu Bekir toplantısı takvime girilemedi). Başlıktaki saat alanı
 * `time_slot`u yazar; şerit dışına düşen saat ızgarada kendi satırını açar.
 *
 * Kontroller ortak primitiflerden (Field/TextInput/Button); eylem çubuğu
 * Overlay'in SABİT alt şeridinde: uzun konu listesinde "Kaydet" kaybolmaz.
 * Tek birincil düğme Kaydet; "Bildir" satır eylemidir, ikincil durur.
 */
export function MeetingEditor({
  meeting, day, slot, dayLabel, bandCategory, bandLabel, members, onClose, onSaved,
}: Props) {
  const { ask, dialog } = useConfirm();
  // Kaydedilmiş toplantının id'si — prop DEĞİL state, çünkü "Bildir" düğmesi
  // kaydetmeyi zorlar: yeni bir toplantı oluşturulduktan sonra prop hâlâ null
  // kalıyordu ve ikinci kayıtta İKİNCİ bir toplantı yaratılıyordu (konular ilk
  // toplantıda kaldığı için de "Cannot coerce…" hatası düşüyordu).
  const [meetingId, setMeetingId] = useState<string | null>(meeting?.id ?? null);
  const isNew = meetingId === null;
  const [time, setTime] = useState(() => normalizeSlot(meeting?.time_slot ?? slot));
  /* KATEGORİ SEÇİLMEZ — şeritten gelir. Aslı Hanım (2026-08-29): "Üretim
     yerine AI seçiyorum ama değişmiyor… aslında format belli zaten, olduğu
     gibi neye ekliyorsam ona eklensin." Pencerede dokuz kategori düğmesi
     vardı ama ızgara hücreyi ŞERİDİN rengiyle boyuyordu; seçim hiçbir yere
     yansımıyor, sadece yanıltıyordu. Rengi değiştirmenin tek yeri artık
     şeridin kendisi (sol sütundaki kalem). */
  const category: PlanningCategory = bandCategory ?? meeting?.category ?? "other";
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [content, setContent] = useState(meeting?.content ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(meeting?.content));
  /* TOPLANTI DÜZEYİNDE KİŞİ SEÇİLMEZ. Aslı Hanım (2026-08-29): "İki defa kişi
     seçmek de çok saçma; altta konuya göre seçiliyor zaten ve orada mail de
     gidiyor sonuçta." Kişi KONUNUN sorumlusudur — görevi ve bildirimi o
     doğurur. Toplantının ayrı bir katılımcı listesi aynı ismi iki kez
     sordurup hangisinin mail attığını belirsizleştiriyordu.
     Mevcut kayıtların listeleri KORUNUR (silinmiş gibi davranmayalım). */
  const participantIds = meeting?.participant_ids ?? [];
  const collaboratorIds = meeting?.collaborator_ids ?? [];
  const [topics, setTopics] = useState<TopicDraft[]>(() => {
    const existing: TopicDraft[] = (meeting?.topics ?? []).map((t) => ({
      id: t.id, text: t.text ?? "", participant_ids: t.participant_ids ?? [],
      collaborator_ids: t.collaborator_ids ?? [],
      due_date: t.due_date ?? "", task_id: t.task_id,
    }));
    /* Varsayılan ÜÇ satır — ızgaradaki "Konu 1..3" ile birebir (Aslı Hanım,
       2026-08-29: "default olarak her başlığa 3 konu olsun"). Metni boş kalan
       satır kaydedilmez, ızgarada hayalet satır oluşturmaz. */
    while (existing.length < 3) {
      existing.push({ text: "", participant_ids: [], collaborator_ids: [], due_date: "" });
    }
    return existing;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [assigningIdx, setAssigningIdx] = useState<number | null>(null);
  const [assignedMsg, setAssignedMsg] = useState<string | null>(null);

  const meta = categoryMeta(category);
  const ist = istanbulLabel(day, time);

  const setTopic = (i: number, patch: Partial<TopicDraft>) =>
    setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTopic = () =>
    setTopics((ts) => [...ts, { text: "", participant_ids: [], collaborator_ids: [], due_date: "" }]);
  const removeTopic = (i: number) => setTopics((ts) => ts.filter((_, idx) => idx !== i));

  // Toplantı + konuları kaydeder; konu id'lerini geri yazar ("Bildir" için).
  async function persist(): Promise<{ meetingId: string; posToId: Record<number, string> } | { error: string }> {
    const payload = {
      // Saat kullanıcıdan geliyor; boş bırakılırsa tıklanan hücrenin saati.
      meeting_date: day, time_slot: normalizeSlot(time) || normalizeSlot(slot),
      category, title, content,
      participant_ids: participantIds, collaborator_ids: collaboratorIds,
    };
    let id = meetingId;
    if (!id) {
      const res = await createMeeting(payload);
      if ("error" in res) return { error: res.error };
      id = res.id;
      // Aynı oturumda ikinci kez kaydedilirse artık GÜNCELLEnir, yenisi açılmaz.
      setMeetingId(id);
    } else {
      const res = await updateMeeting(id, payload);
      if ("error" in res) return { error: res.error };
    }
    const tRes = await saveMeetingTopics(
      id,
      topics.map((t, i) => ({
        id: t.id, position: i, text: t.text, participant_ids: t.participant_ids,
        collaborator_ids: t.collaborator_ids, due_date: t.due_date || day,
      })),
    );
    if ("error" in tRes) return { error: tRes.error };
    const posToId: Record<number, string> = {};
    for (const { position, id } of tRes.topics) posToId[position] = id;
    // Yerel taslaklara id'leri yaz (yeni satırlar için).
    setTopics((ts) => ts.map((t, i) => (posToId[i] ? { ...t, id: posToId[i] } : t)));
    return { meetingId: id, posToId };
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
      /* Teslim tarihi = konunun kendi tarihi yoksa TOPLANTININ GÜNÜ.
         Aslı Hanım (2026-08-29): "Bir de yanında tarih olması saçma; zaten ben
         o tarihi seçip konu ekliyorum." Tarihi hücre söylüyor. */
      const aRes = await assignTopicAsTask(topicId, { dueDate: topics[i].due_date || day });
      setAssigningIdx(null);
      if ("error" in aRes) { setError(aRes.error); return; }
      setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, task_id: aRes.taskId } : t)));
      setAssignedMsg(`Konu ${i + 1} göreve atandı, atananlara bildirim/mail gönderildi.`);
    });
  }

  async function handleDelete() {
    if (!meetingId) return;
    if (!(await ask({
      title: "Toplantı silinsin mi?",
      message: "Toplantı ve altındaki bütün konular kalıcı olarak silinir.",
      confirmLabel: "Sil",
      tone: "danger",
    }))) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteMeeting(meetingId);
      if ("error" in res) { setError(res.error); return; }
      onSaved();
    });
  }

  const busy = isSaving || isDeleting;

  return (
    <Overlay
      open
      onClose={onClose}
      size="lg"
      dismissOnBackdrop={false}
      titleNode={
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14px] font-semibold tracking-tight text-ink">{dayLabel}</span>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">{HOME_LABEL}</span>
            <TextInput
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-8 w-auto px-2 text-[13px] font-semibold tabular-nums"
              aria-label="Toplantı saati (New York)"
            />
          </label>
          {ist && (
            <span className="text-[12px] tabular-nums text-subtle" title="İstanbul saati — New York saatinden hesaplanır">
              {AWAY_LABEL} {ist}
            </span>
          )}
        </div>
      }
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              onClick={handleDelete}
              loading={isDeleting}
              disabled={busy}
              className="mr-auto hover:bg-danger/10 hover:text-danger"
            >
              {!isDeleting && <Trash2 size={15} aria-hidden />} Sil
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button onClick={handleSave} loading={isSaving && assigningIdx === null} disabled={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
            {error}
          </p>
        )}

        {/* 1 · Başlık. Solundaki nokta ŞERİDİ gösterir — bilgi, seçim değil. */}
        <Field label="Başlık" htmlFor="meeting-title">
          <div className="flex items-center gap-2">
            <span
              title={`Şerit: ${bandLabel || meta.label}`}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-surface-muted px-2 text-[12.5px] font-medium text-muted"
            >
              <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10", meta.dot)} aria-hidden />
              <span className="hidden sm:inline">{bandLabel || meta.label}</span>
            </span>
            <TextInput
              id="meeting-title"
              className="flex-1 text-[14px] font-medium"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ready to Wear, Lookbook, AFCOM…"
              autoFocus
            />
          </div>
        </Field>

        {/* 2 · Konular — satır: sıra · metin · kim · Bildir · sil */}
        <section aria-labelledby="meeting-topics-h">
          <h3 id="meeting-topics-h" className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Konular</h3>
          {assignedMsg && (
            <p role="status" className="anim-fade-down mb-2 flex items-center gap-1.5 rounded-control border border-success/30 bg-success/10 px-3 py-1.5 text-[12.5px] font-medium text-success">
              <CheckCircle2 size={14} className="shrink-0" aria-hidden /> {assignedMsg}
            </p>
          )}
          <ol className="space-y-2">
            {topics.map((t, i) => (
              /* Satır dar ekranda kırılır (metin üstte, seçimler altta),
                 geniş ekranda tek satır kalır. */
              <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-control border border-hairline p-1.5 sm:border-0 sm:p-0">
                <span className="w-4 shrink-0 text-center text-[12px] font-medium tabular-nums text-subtle" aria-hidden>{i + 1}</span>
                <TextInput
                  className="min-w-0 flex-1 basis-full sm:basis-0"
                  value={t.text}
                  onChange={(e) => setTopic(i, { text: e.target.value })}
                  placeholder={`Konu ${i + 1}`}
                  aria-label={`Konu ${i + 1}`}
                />
                <div className="w-[88px] shrink-0">
                  <MemberMultiSelect members={members} selected={t.participant_ids} onChange={(ids) => setTopic(i, { participant_ids: ids })} placeholder="Kim" compact />
                </div>
                {/* Sabit genişlik: etiket her durumda "Bildir" ve düğme ölçüsü
                    değişmez — atama sonrası satır kaymaz. Atanmış durum
                    ikon + renkle anlatılır, başlıkta da yazar. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAssign(i)}
                  loading={assigningIdx === i}
                  disabled={busy}
                  className={cn("w-[92px]", t.task_id && "border-success/30 bg-success/10 text-success hover:bg-success/15")}
                  title={
                    t.task_id
                      ? "Görev oluşturuldu — güncelleyip tekrar bildirmek için tıklayın"
                      : "Konuyu göreve dönüştür ve seçilen kişilere bildir"
                  }
                >
                  {assigningIdx !== i && (t.task_id ? <CheckCircle2 size={13} aria-hidden /> : <Send size={13} aria-hidden />)}
                  Bildir
                </Button>
                <IconButton size="sm" aria-label={`Konu ${i + 1} satırını sil`} title="Sil" onClick={() => removeTopic(i)} className="hover:text-danger">
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={addTopic} className="text-brand hover:text-brand-strong">
              <Plus size={13} aria-hidden /> Konu ekle
            </Button>
            {!noteOpen && (
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
                <Plus size={13} aria-hidden /> Not ekle
              </Button>
            )}
          </div>
        </section>

        {/* 3 · Not — çoğu toplantıda boş kalıyordu; artık istenince açılır. */}
        {noteOpen && (
          <Field label="Not" className="anim-fade-down">
            <TextArea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Not…"
            />
          </Field>
        )}
      </div>
      {dialog}
    </Overlay>
  );
}
