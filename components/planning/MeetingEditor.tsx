"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Plus, Trash2, Send, CheckCircle2, AlertTriangle, Copy, XCircle, Mail, X, ListChecks, UserPlus,
  Loader2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Overlay } from "@/components/ui/Overlay";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, TextInput, TextArea } from "@/components/ui/Field";
import {
  createMeeting, updateMeeting, deleteMeeting, saveMeetingTopics, assignTopicAsTask,
  duplicateMeeting, duplicateTopic, setMeetingStatus, sendMeetingInvites, addExternalParticipant,
  type MeetingSnapshot,
} from "@/lib/actions/planning";
import { categoryMeta } from "@/lib/planning/categories";
import { WEEKDAY_LONG_TR } from "@/lib/planning/bands";
import { normalizeSlot, istanbulLabel, HOME_LABEL, AWAY_LABEL } from "@/lib/planning/timezones";
import { MemberMultiSelect, type Member } from "./MemberMultiSelect";
import type { PlanningCategory, PlanningMeetingStatus, PlanningMeetingWithTopics } from "@/types";

interface Props {
  meeting: PlanningMeetingWithTopics | null; // null → yeni
  day: string;       // yyyy-MM-dd
  slot: string;      // "09:00" — tıklanan hücrenin saati, BAŞLANGIÇ değeri
  dayLabel: string;  // "Pazartesi 27 Tem"
  /** Toplantının OTURDUĞU şeridin kategorisi — renk buradan gelir, seçilmez. */
  bandCategory?: PlanningCategory;
  bandLabel?: string;
  members: Member[];
  /** profiles.id → hex; kişi rozetleri her ekranda aynı rengi taşısın. */
  personHex?: Record<string, string>;
  /** Görüntülenen haftadaki DİĞER toplantılar — aynı gün + saate ikinci bir
   *  toplantı yazılırken uyarmak için. Yalnız bilgi: kayıt engellenmez, çünkü
   *  aynı hücrede iki başlık meşru olabiliyor (ızgara ikisini de gösterir). */
  weekMeetings?: { id: string; date: string; slot: string; title: string }[];
  /** TEK KONU MODU — ızgarada bir "Konu N" hücresine tıklanınca yalnız o konu
   *  açılır (Aslı Hanım, 2026-09-07: "Ama konuya tıklayınca hepsini açıyor.
   *  KONUYU AÇMIYOR Kİ."). null → bütün toplantı. */
  focusTopicIndex?: number | null;
  onClose: () => void;
  onSaved: () => void;
  /** Silme sonrası GERİ ALMA için: silinen toplantının tam kopyası.
   *  Verilmezse silme eskisi gibi yalnız kapatır (geri alma sunulmaz). */
  onDeleted?: (_snapshot: MeetingSnapshot) => void;
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
/** Seçilen tarihin gün adı + günü ("Pazartesi 27 Tem"). Tarih okunamazsa
 *  hücreden gelen sabit etiket kullanılır. */
/** "2026-09-07" → "2026-09-08". Çoğaltmanın varsayılan hedefi. */
function nextDayIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function weekdayLabelOf(iso: string, fallback: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;
  const day = WEEKDAY_LONG_TR[(d.getDay() + 6) % 7];
  return `${day} ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d)}`;
}

export function MeetingEditor({
  meeting, day, slot, dayLabel, bandCategory, bandLabel, members, personHex = {},
  weekMeetings = [], focusTopicIndex = null, onClose, onSaved, onDeleted,
}: Props) {
  const { ask, dialog } = useConfirm();
  // Kaydedilmiş toplantının id'si — prop DEĞİL state, çünkü "Bildir" düğmesi
  // kaydetmeyi zorlar: yeni bir toplantı oluşturulduktan sonra prop hâlâ null
  // kalıyordu ve ikinci kayıtta İKİNCİ bir toplantı yaratılıyordu (konular ilk
  // toplantıda kaldığı için de "Cannot coerce…" hatası düşüyordu).
  const [meetingId, setMeetingId] = useState<string | null>(meeting?.id ?? null);
  const isNew = meetingId === null;
  const [time, setTime] = useState(() => normalizeSlot(meeting?.time_slot ?? slot));
  /* GÜN de pencerede seçilir. Aslı Hanım (2026-08-30): "Pop-up açılsın, biz
     gün saat vs seçelim, kendisi takvime eklensin." Önceden gün tıklanan
     hücreden geliyordu ve pencerede DEĞİŞTİRİLEMİYORDU: yanlış güne açılan
     toplantıyı taşımak için pencereyi kapatıp doğru hücreyi bulmak
     gerekiyordu. */
  const [dateIso, setDateIso] = useState(() =>
    String(meeting?.meeting_date ?? day).slice(0, 10));
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
    /* Tek konu modunda tıklanan satır listede YOK olabilir (boş "Konu 5"
       hücresi): pencere boş açılmasın diye o satıra kadar doldurulur. */
    const need = Math.max(3, typeof focusTopicIndex === "number" ? focusTopicIndex + 1 : 0);
    while (existing.length < need) {
      existing.push({ text: "", participant_ids: [], collaborator_ids: [], due_date: "" });
    }
    return existing;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [assigningIdx, setAssigningIdx] = useState<number | null>(null);
  const [assignedMsg, setAssignedMsg] = useState<string | null>(null);

  /* SONUÇ — büyük yeşil tik / kırmızı çarpı (20240338). Ekranda anında döner,
     sunucu reddederse eski değere geri alınır. */
  const [status, setStatus] = useState<PlanningMeetingStatus>(
    (meeting?.status as PlanningMeetingStatus | undefined) ?? "planned",
  );
  const [statusBusy, setStatusBusy] = useState(false);

  /* DIŞ KATILIMCILAR — ekipte olmayan e-postalar (Sabri Bey, Meral Hanım). */
  const [externalEmails, setExternalEmails] = useState<string[]>(
    () => (meeting?.external_emails ?? []).filter(Boolean),
  );
  const [emailDraft, setEmailDraft] = useState("");
  /* FİHRİST ALANLARI. Aslı Hanım (2026-09-07): "Adı, soyadı, TANIMI, ne
     toplantısı olduğu bilgileri girer — böylece orada da bir database'imiz
     oluşur." "Ne toplantısı" ayrı sorulmaz: kişi zaten BU toplantıdan
     ekleniyor, sunucu o satırı kendisi yazıyor. */
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState("");
  /* KATEGORİ SORULMUYOR. Toplantıya adam çağırırken "bu kişi selebriti mi?"
     diye sormak o anın işi değil — kayıt zaten "Toplantılar" kutusuna düşer
     (sunucu varsayılanı) ve gerekirse CRM'de değiştirilir.
     `guestRow` = hangi konunun "+" düğmesi açık; null = kapalı. */
  const [guestRow, setGuestRow] = useState<number | null>(null);
  const [isAddingGuest, startAddGuest] = useTransition();

  /* ÇOĞALTMA — "toplantının devamı" başka bir güne kopyalanır. */
  /* DAVET — dış katılımcılara mail. Mail geri alınamaz: kaydetmenin yan etkisi
     değil, ayrı ve açık bir eylemdir. */
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [isInviting, startInvite] = useTransition();

  /* KONU ÇOĞALTMA — tek konu kipinde "Çoğalt" TOPLANTIYI değil KONUYU
     kopyalar (Sıraç, 2026-09-08 / 2026-09-10). Hedef gün boş bırakılırsa kopya
     aynı toplantının sonuna eklenir. */
  const [topicDupOpen, setTopicDupOpen] = useState(false);
  const [topicDupDate, setTopicDupDate] = useState("");
  const [isDupTopic, startDupTopic] = useTransition();

  const [dupDate, setDupDate] = useState("");
  const [dupOpen, setDupOpen] = useState(false);
  const [isDuplicating, startDuplicate] = useTransition();

  /* TEK KONU MODU. Izgarada "Konu 2"ye tıklandığında pencere bütün gündemi
     açıyordu — Aslı Hanım (2026-09-07): "Ama konuya tıklayınca hepsini açıyor.
     Konuyu açmıyor ki." Artık yalnız o satır çizilir; "Tüm konular" bağlantısı
     istendiğinde gündemin tamamını geri getirir. Taslak durumu HER ZAMAN tam
     listedir: kaydetmek görünmeyen konulara dokunmaz. */
  const [solo, setSolo] = useState<number | null>(
    typeof focusTopicIndex === "number" && focusTopicIndex >= 0 ? focusTopicIndex : null,
  );

  const meta = categoryMeta(category);
  const ist = istanbulLabel(dateIso, time);

  /* ÇAKIŞMA UYARISI — "aynı saate ikinci toplantı" sessizce oluyordu: gün ya da
     saat değiştirilip kaydedilince iki başlık aynı hücrede birleşiyor ve
     ızgarada tek satır gibi görünüyordu (2026-08-30). Uyarı engellemez, sadece
     söyler; hafta dışına çıkan tarihler için veri elde olmadığından susar. */
  const conflict = useMemo(() => {
    const slotNow = normalizeSlot(time) || normalizeSlot(slot);
    if (!dateIso || !slotNow) return null;
    const hits = weekMeetings.filter(
      (m) => m.id !== meetingId && m.date === dateIso && normalizeSlot(m.slot) === slotNow,
    );
    if (!hits.length) return null;
    const names = hits.map((m) => m.title.trim()).filter(Boolean);
    return names.length ? names.join(" · ") : "başlıksız bir toplantı";
  }, [weekMeetings, meetingId, dateIso, time, slot]);

  const setTopic = (i: number, patch: Partial<TopicDraft>) =>
    setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTopic = () =>
    setTopics((ts) => [...ts, { text: "", participant_ids: [], collaborator_ids: [], due_date: "" }]);
  /* KONU SİLME ARTIK SORAR. Aslı Hanım (2026-09-07) tek konuyu kaldırmak
     isterken gündemin tamamını kaybetti — Nisa: "Konuyu kaldırabilirsiniz Aslı
     Hanım, siz direkt hepsini siliyorsunuz." Çöp kutusu sessiz ve geri
     alınamazdı; artık hangi konunun gittiğini ADIYLA sorar. Metni boş bir
     satırda soru sorulmaz: orada silinecek bir şey yok. */
  const removeTopic = async (i: number) => {
    const label = topics[i]?.text?.trim();
    if (label) {
      const ok = await ask({
        title: "Bu konu silinsin mi?",
        message: `“${label}” kaldırılacak. Toplantının diğer konuları yerinde kalır.`,
        confirmLabel: "Konuyu sil",
        tone: "danger",
      });
      if (!ok) return;
    }
    setTopics((ts) => ts.filter((_, idx) => idx !== i));
    /* Tek konu modunda silinen satır ekrandaki TEK satırdı — pencere boş
       kalmasın diye gündemin tamamına dönülür. */
    setSolo(null);
  };

  // Toplantı + konuları kaydeder; konu id'lerini geri yazar ("Bildir" için).
  async function persist(): Promise<{ meetingId: string; posToId: Record<number, string> } | { error: string }> {
    const payload = {
      // Saat kullanıcıdan geliyor; boş bırakılırsa tıklanan hücrenin saati.
      meeting_date: dateIso || day, time_slot: normalizeSlot(time) || normalizeSlot(slot),
      category, title, content,
      participant_ids: participantIds, collaborator_ids: collaboratorIds,
      external_emails: externalEmails,
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
        /* Konunun teslim tarihi TOPLANTININ GÜNÜdür. Eskiden hücreden gelen
           sabit `day` yazılıyordu: pencerede gün değiştirilip kaydedilince
           toplantı taşınıyor ama konuların tarihi eski günde kalıyordu. */
        collaborator_ids: t.collaborator_ids, due_date: t.due_date || dateIso || day,
      })),
    );
    if ("error" in tRes) return { error: tRes.error };
    const posToId: Record<number, string> = {};
    for (const { position, id } of tRes.topics) posToId[position] = id;
    // Yerel taslaklara id'leri yaz (yeni satırlar için).
    setTopics((ts) => ts.map((t, i) => (posToId[i] ? { ...t, id: posToId[i] } : t)));
    return { meetingId: id, posToId };
  }

  /* SUNUCU EYLEMİ PATLARSA DÖNEN ÇARK DURMAZDI. Aslı Hanım (2026-09-07):
     "BİLDİR DÖNÜYOR HÂLÂ. Bugün ve saatte bir konu görev tanımlandı, kaydet
     dedim." `startSave` içindeki fonksiyon bir istisna fırlattığında
     `setAssigningIdx(null)` satırına hiç ulaşılmıyor, düğme sonsuza kadar
     yükleniyor görünüyordu — kullanıcı kaydın olup olmadığını bilemiyordu.
     Artık her çıkış yolu `finally` üzerinden geçer ve beklenmeyen hata da
     ekrana YAZILIR: sessiz başarısızlık yok. */
  function messageOf(e: unknown): string {
    if (e instanceof Error && e.message) return e.message;
    return "Beklenmeyen bir hata oldu. İnternet bağlantınızı kontrol edip tekrar deneyin.";
  }

  function handleSave() {
    setError(null);
    startSave(async () => {
      try {
        const res = await persist();
        if ("error" in res) { setError(res.error); return; }
        onSaved();
      } catch (e) {
        setError(messageOf(e));
      }
    });
  }

  function handleAssign(i: number) {
    setError(null);
    setAssignedMsg(null);
    if (topics[i].participant_ids.length === 0) { setError(`Konu ${i + 1} için önce kişi seçin.`); return; }
    setAssigningIdx(i);
    startSave(async () => {
      try {
        const res = await persist();
        if ("error" in res) { setError(res.error); return; }
        const topicId = res.posToId[i];
        if (!topicId) { setError("Konu kaydedilemedi."); return; }
        /* Teslim tarihi = konunun kendi tarihi yoksa TOPLANTININ GÜNÜ.
           Aslı Hanım (2026-08-29): "Bir de yanında tarih olması saçma; zaten ben
           o tarihi seçip konu ekliyorum." Tarihi hücre söylüyor. */
        const aRes = await assignTopicAsTask(topicId, { dueDate: topics[i].due_date || dateIso || day });
        if ("error" in aRes) { setError(aRes.error); return; }
        setTopics((ts) => ts.map((t, idx) => (idx === i ? { ...t, task_id: aRes.taskId } : t)));
        setAssignedMsg(`Konu ${i + 1} göreve atandı, atananlara bildirim/mail gönderildi.`);
      } catch (e) {
        setError(messageOf(e));
      } finally {
        // Çark HER durumda durur — hata, iptal, beklenmeyen istisna fark etmez.
        setAssigningIdx(null);
      }
    });
  }

  /* SONUÇ İŞARETİ — aynı işarete tekrar basmak onu kaldırır. */
  async function toggleStatus(next: PlanningMeetingStatus) {
    if (!meetingId || statusBusy) return;
    const target = status === next ? "planned" : next;
    const previous = status;
    setError(null);
    setStatus(target);               // iyimser: tik anında büyür
    setStatusBusy(true);
    try {
      const res = await setMeetingStatus(meetingId, target);
      if ("error" in res) { setStatus(previous); setError(res.error); }
    } catch (e) {
      setStatus(previous);
      setError(messageOf(e));
    } finally {
      setStatusBusy(false);
    }
  }

  /* ÇOĞALTMA — geçmiş kayıt yerinde kalır, DEVAMI yeni güne kopyalanır. */
  /* Hedef gün AÇIKÇA geçilebilir. `setDupDate(...)` sonra `handleDuplicate()`
     çağırmak işe yaramaz: React durumu asenkron günceller, fonksiyon eski
     değeri okur ve sunucu "aynı güne kopyalanamaz" der. */
  function handleDuplicate(dateOverride?: string) {
    if (!meetingId) return;
    const targetDate = dateOverride || dupDate || dateIso;
    setError(null);
    startDuplicate(async () => {
      try {
        const res = await duplicateMeeting(meetingId, { meeting_date: targetDate, time_slot: normalizeSlot(time) });
        if ("error" in res) { setError(res.error); return; }
        onSaved();
      } catch (e) {
        setError(messageOf(e));
      }
    });
  }

  /* DAVET GÖNDER — önce kaydeder (yeni eklenen adres de gitsin), sonra yollar. */
  function handleInvite() {
    setError(null);
    setInviteMsg(null);
    startInvite(async () => {
      try {
        const saved = await persist();
        if ("error" in saved) { setError(saved.error); return; }
        const res = await sendMeetingInvites(saved.meetingId);
        if ("error" in res) { setError(res.error); return; }
        const parts: string[] = [];
        if (res.sent.length) parts.push(`${res.sent.join(", ")} adresine davet gönderildi.`);
        if (res.failed.length) parts.push(`Gönderilemedi: ${res.failed.map((f) => f.to).join(", ")}.`);
        setInviteMsg(parts.join(" ") || "Gönderilecek adres bulunamadı.");
      } catch (e) {
        setError(messageOf(e));
      }
    });
  }

  /* Konuyu çoğalt: önce kaydedilir (yeni yazılmış konunun id'si oluşsun),
     sonra kopyalanır. */
  function handleDuplicateTopic() {
    if (solo === null) return;
    setError(null);
    setInviteMsg(null);
    startDupTopic(async () => {
      try {
        const saved = await persist();
        if ("error" in saved) { setError(saved.error); return; }
        const id = saved.posToId[solo];
        if (!id) { setError("Önce konuya bir metin yazın."); return; }
        const res = await duplicateTopic(id, topicDupDate ? { meeting_date: topicDupDate } : undefined);
        if ("error" in res) { setError(res.error); return; }
        onSaved();
      } catch (e) {
        setError(messageOf(e));
      }
    });
  }

  /* DIŞ KATILIMCI — toplantıya davetli olur VE fihriste (CRM) kaydedilir.
     Aslı Hanım: "Şurada bir artı olursa Berna'yı hemen kaydederiz."
     Toplantı henüz kaydedilmemişse önce o kaydedilir: kişi kaydı bir
     toplantıya bağlıdır, havada duramaz. */
  function addEmail() {
    const value = emailDraft.trim().toLowerCase();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setError("Geçerli bir e-posta yazın."); return; }
    if (externalEmails.includes(value)) { setEmailDraft(""); return; }
    setError(null);
    setInviteMsg(null);
    startAddGuest(async () => {
      try {
        const saved = await persist();
        if ("error" in saved) { setError(saved.error); return; }
        const res = await addExternalParticipant(saved.meetingId, {
          email: value,
          name: guestName,
          roleLabel: guestRole,
        });
        if ("error" in res) { setError(res.error); return; }
        setExternalEmails((xs) => (xs.includes(value) ? xs : [...xs, value]));
        setEmailDraft("");
        setGuestName("");
        setGuestRole("");
        setGuestRow(null);
        setInviteMsg(
          res.contactId
            ? `${guestName.trim() || value} toplantıya eklendi ve CRM'e kaydedildi.`
            : `${value} toplantıya eklendi.`,
        );
      } catch (e) {
        setError(messageOf(e));
      }
    });
  }

  async function handleDelete() {
    if (!meetingId) return;
    /* Aslı Hanım tek konuyu silmek isterken TOPLANTININ TAMAMINI sildi.
       Uyarı artık kaç konunun gideceğini SAYIYLA söylüyor ve düğme "Sil"
       değil "Toplantıyı sil" — hangi kapıda olduğunuz yazıyor. */
    const filled = topics.filter((t) => t.text.trim()).length;
    if (!(await ask({
      title: "TOPLANTININ TAMAMI silinsin mi?",
      message: filled
        ? `Bu toplantı ve altındaki ${filled} konunun hepsi silinir. Tek bir konuyu kaldırmak için o konunun yanındaki çöp kutusunu kullanın.`
        : "Bu toplantı silinir.",
      confirmLabel: "Toplantıyı sil",
      tone: "danger",
    }))) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteMeeting(meetingId);
      if ("error" in res) { setError(res.error); return; }
      /* Geri alma: silinen satırın kopyası çağırana verilir (bkz.
         MeetingUndoBar). Kopya okunamadıysa akış eskisi gibi sürer. */
      if (onDeleted && res.snapshot) onDeleted(res.snapshot);
      else onSaved();
    });
  }

  const busy = isSaving || isDeleting || isDuplicating;

  /* ── OTOMATİK KAYIT ────────────────────────────────────────────────────
     Sıraç (2026-09-10): "Calendar'a toplantı konuları girilirken otomatik
     kaydedilsin, bazen kaydedilme unutuluyor."

     Yalnız KAYDEDİLMİŞ toplantıda çalışır (meetingId var). Yeni toplantıda
     çalışsaydı pencereyi açıp bir harf yazan herkes takvime boş bir toplantı
     bırakırdı ve "Vazgeç" o kaydı geri almazdı; ilk kayıt bilerek elle.

     Anlık görüntü ID'LERİ İÇERMEZ: persist() konu id'lerini state'e geri
     yazıyor, id'ler de anlık görüntüye girseydi her kayıt kendi kendini
     tetikleyip sonsuz döngü kurardı.

     AF Teamwork'teki desenle aynı: yazma durunca 1.2 sn sonra kaydeder,
     durumu tek cümleyle söyler. */
  const snapshot = useMemo(
    () =>
      JSON.stringify({
        dateIso, time, title, content, externalEmails,
        topics: topics.map((t) => ({
          text: t.text, p: t.participant_ids, c: t.collaborator_ids, d: t.due_date,
        })),
      }),
    [dateIso, time, title, content, externalEmails, topics],
  );
  const savedSnapshot = useRef(snapshot);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoBusyRef = useRef(false);

  const runAutoSave = useCallback(async () => {
    if (autoBusyRef.current) return;
    autoBusyRef.current = true;
    const attempted = snapshot;
    setAutoState("saving");
    try {
      const res = await persist();
      if ("error" in res) { setAutoState("error"); setError(res.error); return; }
      savedSnapshot.current = attempted;
      setAutoState("saved");
    } catch {
      setAutoState("error");
    } finally {
      autoBusyRef.current = false;
    }
    // persist referansı her çizimde değişiyor; bağımlılığa alınırsa etki
    // her tuşta yeniden kurulur. Anlık görüntü yeterli tetikleyici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useEffect(() => {
    if (isNew) return;                       // ilk kayıt elle
    if (busy) return;                        // elle kayıt/silme/çoğaltma sürüyor
    if (snapshot === savedSnapshot.current) return;
    const id = window.setTimeout(() => { void runAutoSave(); }, 1200);
    return () => window.clearTimeout(id);
  }, [snapshot, isNew, busy, runAutoSave]);

  return (
    <Overlay
      open
      onClose={onClose}
      size="lg"
      dismissOnBackdrop={false}
      titleNode={
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* GÜN — hücreden gelen tarih artık burada değiştirilebilir. Yanındaki
              gün adı seçilen tarihten türer, sabit `dayLabel`den değil. */}
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">Gün</span>
            <TextInput
              type="date"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
              className="h-8 w-auto px-2 text-[13px] font-semibold tabular-nums"
              aria-label="Toplantı günü"
            />
          </label>
          <span className="text-[13px] font-medium tracking-tight text-muted">{weekdayLabelOf(dateIso, dayLabel)}</span>
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
              {!isDeleting && <Trash2 size={15} aria-hidden />} Toplantıyı sil
            </Button>
          )}
          {/* ÇOĞALT — "toplantının devamı". Aslı Hanım (2026-09-07): "Bunu
              duplicate edebiliyor muyum?… Aynı ekiple bunun çarşamba günü
              üretimini konuştuk." Taşımak geçmişi siliyordu; kopyalamak
              arşivi yerinde bırakır. */}
          {/* ÇOĞALT NEYİ ÇOĞALTIR: açık olan şeyi. Tek konu kipinde KONUYU,
              tüm gündemdeyken TOPLANTIYI. Sıraç (2026-09-08): "Çoğalt deyince
              o konuyu değil konu başlığı altındakini çoğaltıyor." */}
          {!isNew && solo !== null && (
            <Button
              variant="ghost"
              onClick={() => setTopicDupOpen((v) => !v)}
              disabled={busy || isDupTopic}
            >
              <Copy size={15} aria-hidden /> Konuyu çoğalt
            </Button>
          )}
          {!isNew && solo === null && (
            <Button
              variant="ghost"
              /* Varsayılan ERTESİ GÜN: çoğaltmanın anlamı "devamını başka güne
                 koymak". Aynı günü önerince kopya aynı hücreye düşüyor ve
                 başlık ikili görünüyordu. */
              onClick={() => { setDupOpen((v) => !v); setDupDate((d) => d || nextDayIso(dateIso)); }}
              disabled={busy}
            >
              <Copy size={15} aria-hidden /> Çoğalt
            </Button>
          )}
          {/* OTOMATİK KAYIT SESSİZ OLMAZ. AF Teamwork'te sessiz kayıt "Nereye
              kaydetti?" sorusunu doğurmuştu; burada da durum yazıyor.
              Yeni toplantıda ilk kayıt elle olduğu için ipucu farklı. */}
          <span className="mr-1 hidden items-center gap-1.5 text-[12.5px] text-subtle sm:inline-flex" aria-live="polite">
            {isNew ? (
              "Kaydedince otomatik kayıt başlar"
            ) : autoState === "saving" ? (
              <><Loader2 size={12} className="animate-spin" aria-hidden /> kaydediliyor</>
            ) : autoState === "saved" ? (
              <><Check size={12} className="text-success" aria-hidden /> kaydedildi</>
            ) : autoState === "error" ? (
              <span className="text-danger">kaydedilemedi</span>
            ) : (
              "otomatik kaydediliyor"
            )}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button onClick={handleSave} loading={isSaving && assigningIdx === null} disabled={busy}>
            {isNew ? "Kaydet" : "Kapat ve kaydet"}
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

        {/* SONUÇ — "başardık" yeşili ve "aksadı" kırmızısı.
            Aslı Hanım (2026-09-07): "Tamamlandığında şu yanındaki yeşil şey
            çıksın… Hani böyle BAŞARDIK gibi bir yeşil olsun." / "Bir aksama
            oldu — toplantı kırmızı çarpı olsun, ki BİR SONRAKİ TOPLANTIYA
            EKLENMESİ GEREKTİĞİNİ anlayalım."
            Renk tek başına anlam taşımaz: her iki düğmede de yazı var. */}
        {!isNew && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Sonuç</span>
            <button
              type="button"
              onClick={() => toggleStatus("done")}
              disabled={statusBusy}
              aria-pressed={status === "done"}
              title="Toplantı yapıldı ve bitti"
              className={cn(
                "tap-target inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-semibold transition-colors duration-150 disabled:opacity-60",
                status === "done"
                  ? "border-success/40 bg-success/15 text-success"
                  : "border-line bg-surface text-muted hover:border-success/40 hover:text-success",
              )}
            >
              <CheckCircle2 size={status === "done" ? 20 : 16} aria-hidden /> Tamamlandı
            </button>
            <button
              type="button"
              onClick={() => toggleStatus("missed")}
              disabled={statusBusy}
              aria-pressed={status === "missed"}
              title="Aksadı — bir sonraki toplantıya eklenmeli"
              className={cn(
                "tap-target inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-semibold transition-colors duration-150 disabled:opacity-60",
                status === "missed"
                  ? "border-danger/40 bg-danger/12 text-danger"
                  : "border-line bg-surface text-muted hover:border-danger/40 hover:text-danger",
              )}
            >
              <XCircle size={status === "missed" ? 20 : 16} aria-hidden /> Aksadı
            </button>
            {/* AKSAYAN TOPLANTI TEK TIKLA SONRAKİ GÜNE. Aslı Hanım (07.09):
                "Toplantı kırmızı çarpı olsun, Kİ BİR SONRAKİ TOPLANTIYA
                EKLENMESİ GEREKTİĞİNİ ANLAYALIM." İşaret vardı ama devamını
                kullanıcı elle kurmak zorundaydı; cümlenin ikinci yarısı buydu.
                TAŞIMAZ, KOPYALAR: aksayan gün de takvimde kalmalı (arşiv). */}
            {status === "missed" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDuplicate(nextDayIso(dateIso))}
                loading={isDuplicating}
                disabled={busy}
                title="Bu toplantının bir kopyasını ertesi güne koy — aksayan gün yerinde kalır"
              >
                {!isDuplicating && <Copy size={13} aria-hidden />} Sonraki güne ekle
              </Button>
            )}
          </div>
        )}

        {/* KONU ÇOĞALTMA — hedef gün İSTEĞE BAĞLI. Boş bırakılırsa kopya aynı
            toplantının sonuna eklenir ("bu konuyu bir daha konuşacağız"); gün
            verilirse o güne taşınır ("bunu çarşambaya da koy"). */}
        {topicDupOpen && solo !== null && (
          <div className="anim-fade-down flex flex-wrap items-end gap-2 rounded-control border border-line bg-surface-muted p-2.5">
            <Field label="Hangi güne? (boş = aynı toplantı)" className="min-w-[190px]">
              <TextInput
                type="date"
                value={topicDupDate}
                onChange={(e) => setTopicDupDate(e.target.value)}
                aria-label="Konu kopyasının günü"
              />
            </Field>
            <Button onClick={handleDuplicateTopic} loading={isDupTopic} disabled={busy}>
              <Copy size={14} aria-hidden /> Kopyala
            </Button>
            <Button variant="ghost" onClick={() => setTopicDupOpen(false)} disabled={busy}>Vazgeç</Button>
            <p className="basis-full text-[12.5px] text-muted">
              Metin ve kişiler kopyalanır. Görev bağı ve “tamamlandı” işareti kopyaya geçmez.
            </p>
          </div>
        )}

        {/* TOPLANTI ÇOĞALTMA — hedef gün sorulur; kaynak toplantı YERİNDE KALIR. */}
        {dupOpen && !isNew && (
          <div className="anim-fade-down flex flex-wrap items-end gap-2 rounded-control border border-line bg-surface-muted p-2.5">
            <Field label="Devamı hangi güne?" className="min-w-[170px]">
              <TextInput
                type="date"
                value={dupDate}
                onChange={(e) => setDupDate(e.target.value)}
                aria-label="Kopyanın günü"
              />
            </Field>
            <Button onClick={() => handleDuplicate()} loading={isDuplicating} disabled={busy || !dupDate}>
              <Copy size={14} aria-hidden /> Kopyala
            </Button>
            <Button variant="ghost" onClick={() => setDupOpen(false)} disabled={busy}>Vazgeç</Button>
            <p className="basis-full text-[12.5px] text-muted">
              Başlık, konular ve kişiler kopyalanır. Bu toplantı kendi gününde kalır.
            </p>
          </div>
        )}

        {conflict && (
          <p className="anim-fade-down flex items-start gap-2 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] font-medium text-ink">
            <AlertTriangle size={14} className="mt-px shrink-0 text-warning" aria-hidden />
            <span>Bu gün ve saatte zaten bir toplantı var: {conflict}. Kaydederseniz ikisi aynı hücrede birlikte görünür.</span>
          </p>
        )}

        {/* 1 · BAŞLIK — YALNIZ tüm gündem açıkken.
            Sıraç (2026-09-08): "Kart pop-up tasarımında başlık kısmını
            kaldıralım, sadece hangi konu seçildiyse o konu olsun."
            Tek konu kipinde pencere zaten "Konu 2"yi açıyor; başlığı da
            göstermek hem yer yiyor hem "hangisini düzenliyorum?" sorusunu
            doğuruyordu. Başlık artık ızgarada yerinde düzenleniyor. */}
        {solo === null && (
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
        )}

        {/* 2 · Konular — satır: sıra · metin · kim · Bildir · sil */}
        <section aria-labelledby="meeting-topics-h">
          {/* TEK KONU MODU — tıklanan satır ne ise başlık onu söyler ve
              gündemin geri kalanı çizilmez. "Tüm konular" tek tıkla geri
              getirir; kaydetmek görünmeyen konulara dokunmaz. */}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 id="meeting-topics-h" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
              {solo === null ? "Konular" : `Konu ${solo + 1}`}
            </h3>
            {solo !== null && (
              <Button variant="ghost" size="sm" onClick={() => setSolo(null)}>
                <ListChecks size={13} aria-hidden /> Tüm konular
              </Button>
            )}
          </div>
          {assignedMsg && (
            <p role="status" className="anim-fade-down mb-2 flex items-center gap-1.5 rounded-control border border-success/30 bg-success/10 px-3 py-1.5 text-[12.5px] font-medium text-success">
              <CheckCircle2 size={14} className="shrink-0" aria-hidden /> {assignedMsg}
            </p>
          )}
          <ol className="space-y-2">
            {topics.map((t, i) => (solo !== null && i !== solo ? null : (
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
                  <MemberMultiSelect members={members} selected={t.participant_ids} onChange={(ids) => setTopic(i, { participant_ids: ids })} placeholder="Kim" compact personHex={personHex} />
                </div>
                {/* KİMİN YANINDAKİ ARTI. Aslı Hanım (2026-09-07): "Kim, yani
                    KİŞİNİN YANINDA bir de artı butonu olsun mail girilmesi
                    için, dışardaki kişilere de bildirim gitsin."
                    "Kim" ekip içini seçtiriyor; ekip dışı kişi buradan girer —
                    ikisi yan yana çünkü ikisi de aynı soruyu cevaplıyor:
                    bu konuda kim var? */}
                <IconButton
                  size="sm"
                  aria-label={`Konu ${i + 1} için dışarıdan katılımcı ekle`}
                  title="Dışarıdan katılımcı ekle — ekip dışı bir kişiyi e-postasıyla çağır"
                  onClick={() => setGuestRow(guestRow === i ? null : i)}
                  className={cn(guestRow === i && "bg-brand-soft text-brand-strong")}
                >
                  <UserPlus size={14} />
                </IconButton>
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
                <IconButton
                  size="sm"
                  aria-label={`Konu ${i + 1} satırını sil`}
                  title="Yalnız bu konuyu sil"
                  onClick={() => { void removeTopic(i); }}
                  className="hover:text-danger"
                >
                  <Trash2 size={14} />
                </IconButton>

                {/* Mini form satırın ALTINDA açılır — açılır pencere değil.
                    İki alan: kim ve e-posta. Kategori sorulmaz. */}
                {guestRow === i && (
                  <div className="anim-fade-down flex basis-full flex-wrap items-center gap-1.5 rounded-control border border-brand-ring bg-brand-soft/30 p-2">
                    <TextInput
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Ad soyad"
                      aria-label="Dış katılımcının adı"
                      className="min-w-0 flex-1 basis-[150px]"
                      autoFocus
                    />
                    <TextInput
                      value={guestRole}
                      onChange={(e) => setGuestRole(e.target.value)}
                      placeholder="Tanım — üretici, kalıpçı…"
                      aria-label="Dış katılımcının tanımı"
                      className="min-w-0 flex-1 basis-[130px]"
                    />
                    <TextInput
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                      placeholder="eposta@sirket.com"
                      aria-label="Dış katılımcının e-postası"
                      className="min-w-0 flex-1 basis-[170px]"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addEmail}
                      loading={isAddingGuest}
                      disabled={!emailDraft.trim() || busy || isAddingGuest}
                    >
                      {!isAddingGuest && <Plus size={13} aria-hidden />} Ekle
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setGuestRow(null)}>Vazgeç</Button>
                    <p className="basis-full text-[12px] text-subtle">
                      Kişi toplantıya davetli olur ve CRM’e kaydedilir.
                    </p>
                  </div>
                )}
              </li>
            )))}
          </ol>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {solo === null && (
              <Button variant="ghost" size="sm" onClick={addTopic} className="text-brand hover:text-brand-strong">
                <Plus size={13} aria-hidden /> Konu ekle
              </Button>
            )}
            {!noteOpen && (
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
                <Plus size={13} aria-hidden /> Not ekle
              </Button>
            )}
          </div>
        </section>

        {/* DAVETLİLER — yalnız EKLENMİŞ dış kişiler ve davet düğmesi.
            Ekleme buradan değil, konu satırındaki "Kim"in yanındaki + ile
            yapılır. Aslı Hanım (2026-09-07): "KİM, YANİ KİŞİNİN YANINDA bir
            de artı butonu olsun mail girilmesi için."
            Burada büyük bir form vardı ve içinde CRM kategorisi soruluyordu;
            toplantıya adam çağırırken "bu kişi selebriti mi?" diye sormak o
            anın işi değil — kayıt "Toplantılar" kutusuna düşer, gerekirse
            CRM'de değiştirilir. */}
        {externalEmails.length > 0 && (
          <Field label="Dışarıdan katılanlar" className="anim-fade-down">
            <div className="space-y-2">
              <ul className="flex flex-wrap gap-1.5">
                {externalEmails.map((mail) => (
                  <li
                    key={mail}
                    className="inline-flex items-center gap-1 rounded-control border border-line bg-surface-muted py-1 pl-2 pr-1 text-[12.5px] text-ink"
                  >
                    <Mail size={12} className="shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0 break-all">{mail}</span>
                    <button
                      type="button"
                      onClick={() => setExternalEmails((xs) => xs.filter((x) => x !== mail))}
                      aria-label={`${mail} adresini kaldır`}
                      title="Listeden kaldır"
                      className="tap-target grid size-6 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface hover:text-danger"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>

              {/* DAVET. "Çarşamba günkü Sabri Bey ile toplantının e-maili
                  buradan giderse Nisa'nın işini kolaylaştıracaksın — bir daha
                  adama 'mail' diye dürtmeyecek." Mail "görev atandı" demez;
                  "Toplantıya davet edildiniz" der ve içinde son tarih değil
                  TOPLANTI SAATİ vardır (Türkiye saati, parantezde NY). */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleInvite}
                  loading={isInviting}
                  disabled={busy || isInviting}
                  title="Toplantı davetini bu adreslere e-posta ile gönder"
                >
                  {!isInviting && <Send size={13} aria-hidden />} Davet gönder
                </Button>
                <span className="text-[12px] text-subtle">
                  Davette toplantının tarihi ve saati yazar; görev maili değildir.
                </span>
              </div>

              {inviteMsg && (
                <p role="status" className="anim-fade-down rounded-control border border-success/30 bg-success/10 px-3 py-2 text-[12.5px] font-medium text-ink">
                  {inviteMsg}
                </p>
              )}
            </div>
          </Field>
        )}

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
