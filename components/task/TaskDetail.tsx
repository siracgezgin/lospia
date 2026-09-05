"use client";

import { createContext, useState, useMemo, useTransition, useRef, useEffect, useContext } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeTR, formatDateOnlyTR } from "@/lib/utils/format-date";
import { ArrowLeft, History, Check, AlertCircle, Lock, Users, CalendarDays } from "lucide-react";
import type {
  Task,
  TaskActivity,
  TaskActivityLogWithActor,
  TimeEntry,
  CustomFieldDefinition,
  Profile,
  WorkspaceContact,
  WorkspaceDepartment,
  TaskStatus,
  TaskPriority,
} from "@/types";
import {
  USER_STATUS_OPTIONS, TASK_PRIORITIES, PRIORITY_LABELS, STATUS_LABELS,
} from "@/lib/utils/task-constants";
import { updateTask } from "@/lib/actions/tasks";
import { activityMessage } from "@/components/task/activity-messages";
import {
  STATUS_CHIP_TONE, PRIORITY_SHOW_ON_BOARD, getTaskStateMarkers,
} from "@/lib/design/semantics";
import { PersonAvatar, type PersonAvatarSize } from "@/components/ui/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, TextInput, TextArea, SelectInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { assignPersonTones, personTone, type PersonChoice } from "@/lib/design/person-colors";
import { getPersonDisplayName, personNameKey } from "@/lib/utils/person-display";
import { cn } from "@/lib/utils/cn";
import { BackLink } from "@/components/modules/BackLink";
import { TaskDrawerContext } from "@/components/task/TaskDetailDrawer";
import {
  TASK_VISIBILITIES, VISIBILITY_LABELS, VISIBILITY_DESCRIPTIONS,
  ADMIN_ONLY_CHIP_LABEL, asVisibility, type TaskVisibility,
} from "@/lib/utils/visibility";

/* ── Kişi kimliği: FOTOĞRAF + KENDİ RENGİ ────────────────────────────────────
   Sıraç (2026-08-30): "İsimler her yerde kart olmalı, harf olarak değil."

   Görev ekranları son baş-harf çipleriydi: `components/ui/Avatar` yalnız harf
   çizer ve `photoUrl` girdisi bile yoktur, bu yüzden fotoğrafı olan kişi
   burada ASLA görünmüyordu. Artık Pano (ParticipantChips) ve Takvim
   (KimBadges) ile aynı dil: `PersonAvatar` — fotoğrafı olanın fotoğrafı,
   olmayanın kendi renginde yuvarlak baş harfi.

   Fotoğraf ve renk YENİ SORGU İSTEMEZ: bu ekran zaten `profiles`
   (avatar_url) ve `contacts` alıyor. Sorumlu paneli ile not paneli bu veriyi
   prop olarak almıyor ama TaskDetail'in ALTINDA (slot olarak) çiziliyor, o
   yüzden kimlik bir bağlamla paylaşılır — üst sunucu bileşenine dokunulmadı.

   Tohum kümesi Pano'nunkiyle aynıdır (üye profilleri ∪ üyeyle eşleşmeyen CRM
   kişileri), böylece aynı insan panoda ve görev ekranında aynı rengi taşır. */
export type TaskPersonIdentity = { photoUrl: string | null; colorHex: string };
type TaskPeopleIndex = {
  /** profiles.id | contacts.id → kimlik. */
  byId: Record<string, TaskPersonIdentity>;
  /** Yalnız adı bilinen yerler için (başlıktaki sorumlu listesi id taşımaz). */
  byName: Record<string, TaskPersonIdentity>;
};
const TaskPeopleContext = createContext<TaskPeopleIndex>({ byId: {}, byName: {} });

/**
 * Kişi bulunamazsa nötr griye DÜŞMEZ: adından türeyen kalıcı palet rengi
 * verilir (person-colors) — kimse renksiz kalmasın, aynı ad hep aynı renk.
 */
export function useTaskPersonIdentity(
  id: string | null | undefined,
  name: string,
): TaskPersonIdentity {
  const index = useContext(TaskPeopleContext);
  const byId = id ? index.byId[id] : undefined;
  const found = byId ?? index.byName[personNameKey(name)];
  return found ?? { photoUrl: null, colorHex: personTone(name).hex };
}

/**
 * Görev ekranlarının TEK kişi rozeti. Pano'daki kart diliyle birebir aynı:
 * xs = 24px yuvarlak kart, ad `title`/`aria-label` ile okunur.
 */
export function TaskPersonAvatar({
  id, name, size = "xs", title, className,
}: {
  /** profiles.id ya da workspace_contacts.id — fotoğrafı/rengi buradan bulur. */
  id?: string | null;
  name: string;
  size?: PersonAvatarSize;
  title?: string;
  className?: string;
}) {
  const who = useTaskPersonIdentity(id, name);
  return (
    <PersonAvatar
      name={name}
      photoUrl={who.photoUrl}
      colorHex={who.colorHex}
      size={size}
      title={title ?? name}
      className={className}
    />
  );
}

interface Props {
  task: Task;
  activity: TaskActivity[];
  activityLogs: TaskActivityLogWithActor[];
  activeTimer: TimeEntry | null;
  customFields: CustomFieldDefinition[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
  departments: WorkspaceDepartment[];
  userId: string;
  canComplete?: boolean;
  // Visibility is an admin-only lever; members never see or edit it.
  isAdmin?: boolean;
  // Back link target — follows the board the task was opened from.
  backHref?: string;
  backLabel?: string;
  // Display names of the current responsible people (participants ∪ assignee
  // fallback) — shown under the title in the header card.
  responsiblePeople?: string[];
  /** Yöneticinin Ayarlar'dan seçtiği renk (kişi id → seçim). Boşsa renk id'den
   *  deterministik türetilir — Pano ile aynı tohum kümesi kullanıldığı için
   *  seçim yapılmamış kişilerde iki ekran zaten aynı rengi verir. */
  personChoices?: Record<string, PersonChoice>;
  // Page-composed panels, positioned by this layout in a single column:
  // Görev bilgileri → Sorumlu kişiler → Notlar → Puan & Motivasyon → Aktivite.
  participantsSlot?: React.ReactNode;
  notesSlot?: React.ReactNode;
  effortSlot?: React.ReactNode;
}

// ---- Draft model: explicit edit/save, NO auto-save ----

interface Draft {
  title: string;
  description: string;
  department_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string;
  due_date: string;
  /** Virgülle ayrılmış etiketler — kaydederken diziye çevrilir. */
  tags: string;
  visibility: TaskVisibility;
}

function draftFromTask(task: Task): Draft {
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    department_id: (task as unknown as Record<string, string | null>).department_id ?? "",
    status: task.status,
    priority: task.priority,
    start_date: task.start_date ?? "",
    due_date: task.due_date ?? "",
    tags: (task.tags ?? []).join(", "),
    visibility: asVisibility((task as unknown as Record<string, unknown>).visibility),
  };
}

/* Sunucudan gelen hata bazen ham Postgres/İngilizce metindir. Kullanıcıya
   Türkçe, ne yapacağını söyleyen cümle gösterilir; teknik metin konsola düşer. */
const TECHNICAL_ERROR = /duplicate key|violates|permission denied|jwt|pgrst|relation|column|null value|syntax|invalid input|not authenticated|not found|fetch failed|network|unexpected/i;
function friendlyError(msg: string | undefined): string {
  if (!msg || TECHNICAL_ERROR.test(msg)) {
    if (msg) console.error("[updateTask]", msg);
    return "Değişiklikler kaydedilemedi. Lütfen tekrar deneyin.";
  }
  return msg;
}

/* Sayfa ile çekmece aynı iç boşluğu kullanır; üst çubuk bu boşluğu negatif
   kenarla geri alıp kenardan kenara oturur. */
const PAGE_PAD = "px-4 py-4 sm:px-6 lg:px-8";
const BAR_BLEED = "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8";

// ---- Editor (remounts via key when the server task changes) ----

function TaskEditor({
  task, departments, canEdit, canComplete, isAdmin, backHref,
  responsiblePeople, participantsSlot, notesSlot, effortSlot, activitySlot,
  justSaved, onSaved,
}: {
  task: Task; departments: WorkspaceDepartment[]; canEdit: boolean; canComplete: boolean;
  isAdmin: boolean; backHref: string; backLabel: string;
  responsiblePeople: string[];
  participantsSlot?: React.ReactNode;
  notesSlot?: React.ReactNode;
  effortSlot?: React.ReactNode;
  activitySlot: React.ReactNode;
  /** Kaydetme onayı editörün DIŞINDA tutulur: kayıttan sonra bileşen
   *  yeniden monte edildiği için içeride tutulan "Kaydedildi." anında
   *  kayboluyordu. */
  justSaved: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  // Inside the drawer the detail is an overlay, not a page: "geri" must close
  // the sheet (a Link would only change the URL behind it and leave the panel
  // hanging over the board). On the full page it stays a real navigation.
  const drawer = useContext(TaskDrawerContext);
  const taskDraft = useMemo(() => draftFromTask(task), [task]);
  const [draft, setDraft] = useState<Draft>(taskDraft);
  /* KAYDEDİLEN DEĞERLER yeni karşılaştırma zeminidir. Sunucu yanıtı gelip
     bileşen yeniden monte olana kadar (task.id:updated_at anahtarı) "kaydedildi
     ama hâlâ kaydedilmemiş" bir aralık vardı: o aralıkta Esc'e basan kullanıcı
     "Kaydetmeden kapat" uyarısı alıyor, "Kaydet" düğmesi de etkin kalıyordu. */
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const initial = savedDraft ?? taskDraft;
  const [saving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // The title is a textarea so long operasyon başlıkları wrap and stay fully
  // visible (in both view + edit modes). Auto-grow to fit the content height.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title]);

  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]),
    [draft, initial],
  );

  /* KAYDEDİLMEMİŞ DEĞİŞİKLİK KORUMASI.
     Başlığı ya da açıklamayı düzenleyip Esc'e basmak (veya çekmecenin arka
     planına dokunmak) yazılanı uyarısız siliyordu. Çekmecede ortak onay
     penceresi sorar; tam sayfada tarayıcının kendi "sayfadan ayrıl" uyarısı
     devreye girer. */
  const drawerSetDirty = drawer?.setDirty;
  useEffect(() => {
    if (!drawerSetDirty) return;
    drawerSetDirty(dirty);
    return () => drawerSetDirty(false);
  }, [dirty, drawerSetDirty]);
  useEffect(() => {
    if (!dirty || drawerSetDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, drawerSetDirty]);

  // A done task is locked for non-admins: they can neither edit fields nor reopen.
  const doneLocked = task.status === "done" && !canComplete;
  const fieldsDisabled = !canEdit || doneLocked;
  const canSave = dirty && !fieldsDisabled;

  // Non-admins can't set final "done"; a done task keeps "done" selectable so an
  // admin can see/keep it. Others never see "done" in the dropdown.
  const statusOptions = canComplete || task.status === "done"
    ? USER_STATUS_OPTIONS
    : USER_STATUS_OPTIONS.filter((o) => o.value !== "done");

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setFeedback(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function cancel() {
    setDraft(initial);
    setFeedback(null);
  }

  function save() {
    if (!canSave) return;
    const updates: Parameters<typeof updateTask>[0] = { id: task.id };
    if (draft.title.trim() !== initial.title) updates.title = draft.title.trim() || initial.title;
    if (draft.description !== initial.description) updates.description = draft.description || null;
    if (draft.status !== initial.status) updates.status = draft.status;
    if (draft.priority !== initial.priority) updates.priority = draft.priority;
    if (draft.start_date !== initial.start_date) updates.start_date = draft.start_date || null;
    if (draft.due_date !== initial.due_date) updates.due_date = draft.due_date || null;
    if (draft.tags !== initial.tags) {
      updates.tags = draft.tags
        .split(",")
        .map((t) => t.trim().slice(0, 50))
        .filter(Boolean)
        .slice(0, 20);
    }
    if (draft.department_id !== initial.department_id) {
      (updates as Record<string, unknown>).department_id = draft.department_id || null;
    }
    if (draft.visibility !== initial.visibility) {
      (updates as Record<string, unknown>).visibility = draft.visibility;
    }

    startSaving(async () => {
      const res = await updateTask(updates);
      if (res && "error" in res) {
        setFeedback({ kind: "err", msg: friendlyError(res.error) });
        return;
      }
      setFeedback(null);
      /* Gönderilen değerler artık "kaydedilmiş" sayılır (başlık nasıl
         gönderildiyse öyle). Böylece `dirty` kendiliğinden söner: çekmece
         uyarısı da, "Kaydet" düğmesi de aynı gerçeği okur. */
      setSavedDraft({ ...draft, title: draft.title.trim() || initial.title });
      onSaved();
      router.refresh();
    });
  }

  const topLevel = departments.filter((d) => d.parent_id === null);
  const children = (pid: string) => departments.filter((d) => d.parent_id === pid);
  const markers = getTaskStateMarkers(task);
  const departmentName = draft.department_id
    ? departments.find((d) => d.id === draft.department_id)?.name ?? null
    : null;
  const saveHint = !canEdit
    ? "Düzenleme yetkiniz yok"
    : doneLocked
      ? "Tamamlanmış görevi yalnızca yönetici değiştirebilir"
      : !dirty ? "Kaydedilecek bir değişiklik yok" : "Değişiklikleri kaydet";

  const shown: { kind: "ok" | "err"; msg: string } | null =
    feedback ?? (justSaved ? { kind: "ok", msg: "Kaydedildi." } : null);

  const feedbackNode = shown && (
    <span
      role={shown.kind === "err" ? "alert" : "status"}
      className={cn(
        "anim-fade inline-flex items-center gap-1 text-[12.5px]",
        shown.kind === "ok" ? "text-success" : "text-danger",
      )}
    >
      {shown.kind === "ok" ? <Check size={13} aria-hidden /> : <AlertCircle size={13} aria-hidden />}
      {shown.msg}
    </span>
  );

  return (
    <>
      {/* ── Top action bar: back + explicit Save / Cancel ───────────────────
          Düz zemin (bulanık katman yok). Ekranın TEK primary'si "Kaydet";
          değişiklik yokken nötr, değişiklik olunca marka rengi. */}
      <div className={cn(
        "sticky top-0 z-20 -mt-4 py-2 bg-app border-b border-line/60 flex items-center justify-between gap-3 flex-wrap",
        BAR_BLEED,
        // Keep the drawer's pinned close button clear of the action buttons.
        drawer && "pr-14 sm:pr-14 lg:pr-14",
      )}>
        {drawer ? (
          <Button variant="ghost" size="sm" onClick={drawer.close} className="-ml-2">
            <ArrowLeft size={15} aria-hidden /> Kapat
          </Button>
        ) : (
          /* GERÇEK geri — Aslı Hanım (2026-08-28): "normal geldiği yerden geri
             dönün." Görev Takvim'den ya da Ana Sayfa'dan açıldığında da
             "Board'a dön" yazıyordu. Geçmiş yoksa hesaplanan panoya düşer
             (yönetici panosunun görünürlük/yönetici parametreleri korunur). */
          <BackLink href={backHref} />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="hidden sm:inline-flex">{feedbackNode}</span>
          {canSave && (
            <Button variant="secondary" size="sm" onClick={cancel} disabled={saving} className="anim-fade">
              Vazgeç
            </Button>
          )}
          <Button
            size="sm"
            onClick={save}
            loading={saving}
            disabled={!canSave}
            title={saveHint}
          >
            Kaydet
          </Button>
        </div>
      </div>

      {/* ── Header card: title + compact meta row ──────────────────────────
          Hiyerarşi: başlık → durum · sorumlu · teslim (tek satır). Tek rozet
          (durum); gerisi düz metin. Öncelik yalnız yüksek/acil ise yazılır,
          form zaten alanı gösteriyor. */}
      <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3 mt-4">
        <textarea
          ref={titleRef}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          disabled={fieldsDisabled}
          rows={1}
          placeholder="Görev başlığı"
          aria-label="Görev başlığı"
          className={cn(
            "w-full resize-none overflow-hidden -mx-1 px-1 text-xl sm:text-2xl font-semibold tracking-tight bg-transparent rounded-control outline-none pb-1 leading-tight break-words transition-colors",
            "focus-visible:ring-2 focus-visible:ring-brand-ring/40",
            fieldsDisabled
              ? "text-muted border-b border-transparent"
              : "text-ink border-b border-dashed border-line hover:border-line-strong focus:border-solid focus:border-brand-ring",
          )}
        />

        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap text-[12.5px] text-muted">
          <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-medium", STATUS_CHIP_TONE[draft.status])}>
            {STATUS_LABELS[draft.status]}
          </span>

          {/* Responsible people — the primary "whose work is this" signal. */}
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Users size={13} className="shrink-0 text-subtle" aria-hidden />
            {responsiblePeople.length === 0 ? (
              <span className="text-subtle">Sorumlu atanmadı</span>
            ) : (
              <span className="flex items-center gap-1.5 flex-wrap">
                {/* Kişi = YUVARLAK KART (fotoğraf ya da kendi rengi), harf
                    çipi değil. Ad yanında tam yazdığı için kesme/"+N" yok. */}
                {responsiblePeople.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1.5 text-ink font-medium">
                    <TaskPersonAvatar name={name} size="xs" />
                    {getPersonDisplayName(name)}
                  </span>
                ))}
              </span>
            )}
          </span>

          {draft.due_date && (
            <span className={cn("inline-flex items-center gap-1 tabular-nums whitespace-nowrap", markers.dueDateClass)}>
              <CalendarDays size={13} className="shrink-0" aria-hidden /> {formatDateOnlyTR(draft.due_date)}
            </span>
          )}

          {departmentName && (
            <span className="truncate">{departmentName}</span>
          )}

          {PRIORITY_SHOW_ON_BOARD[draft.priority] && (
            <span className={cn("font-medium", draft.priority === "urgent" ? "text-urgent" : "text-overdue")}>
              {PRIORITY_LABELS[draft.priority]}
            </span>
          )}

          {doneLocked && (
            <span className="inline-flex items-center gap-1 text-subtle">
              <Lock size={12} aria-hidden /> Yalnızca yönetici değiştirebilir
            </span>
          )}
          {isAdmin && draft.visibility === "admin_only" && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Lock size={12} aria-hidden /> {ADMIN_ONLY_CHIP_LABEL}
            </span>
          )}
        </div>
      </div>

      {/* ── Single-column body ──────────────────────────────────────────────
          One flow on every breakpoint, in the fixed hierarchy: Görev bilgileri
          → Sorumlu kişiler → Notlar → Puan & Motivasyon → Aktivite. The audit
          trail is ALWAYS last (never a right sidebar) and notes always sit
          above it. */}
      <div className="mt-4 flex flex-col gap-4">

        {/* Görev bilgileri — ortak Field primitifleri; yan yana yalnız
            anlamlı çiftler (durum·öncelik, başlangıç·teslim). */}
        <div className="bg-surface rounded-card border border-line shadow-card p-5">
          <h3 className="text-sm font-semibold tracking-tight text-ink mb-4">Görev bilgileri</h3>
          <div className="space-y-4">
            <Field label="Açıklama">
              <TextArea
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={fieldsDisabled}
                rows={4}
                placeholder="Açıklama ekle…"
              />
            </Field>

            <FieldGrid>
              <Field label="Durum">
                <SelectInput
                  value={USER_STATUS_OPTIONS.find((o) => o.value === draft.status)?.value ?? "ready"}
                  onChange={(e) => set("status", e.target.value as TaskStatus)}
                  disabled={fieldsDisabled}
                >
                  {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectInput>
              </Field>

              <Field label="Öncelik">
                <SelectInput
                  value={draft.priority}
                  onChange={(e) => set("priority", e.target.value as TaskPriority)}
                  disabled={fieldsDisabled}
                >
                  {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </SelectInput>
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Başlangıç tarihi">
                <TextInput
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  disabled={fieldsDisabled}
                  className="tabular-nums"
                />
              </Field>
              <Field label="Teslim tarihi">
                <TextInput
                  type="date"
                  value={draft.due_date}
                  min={draft.start_date || undefined}
                  onChange={(e) => set("due_date", e.target.value)}
                  disabled={fieldsDisabled}
                  className="tabular-nums"
                />
              </Field>
            </FieldGrid>

            <FieldGrid>
              <Field label="Departman">
                <SelectInput
                  value={draft.department_id}
                  onChange={(e) => set("department_id", e.target.value)}
                  disabled={fieldsDisabled}
                >
                  <option value="">— Departman yok —</option>
                  {topLevel.map((dept) => (
                    <optgroup key={dept.id} label={dept.name}>
                      {children(dept.id).map((child) => (
                        <option key={child.id} value={child.id}>{child.name}</option>
                      ))}
                      <option value={dept.id}>{dept.name} (genel)</option>
                    </optgroup>
                  ))}
                </SelectInput>
              </Field>

              {/* "Oluşturan" satırı geri bildirimle kaldırıldı — sorumlu kişiler
                  aşağıdaki panelde gösterilir. Giriş tarihi salt-okunur alan. */}
              <Field label="Giriş tarihi">
                <TextInput
                  readOnly
                  tabIndex={-1}
                  value={formatDateTimeTR(task.created_at)}
                  className="bg-surface-muted text-muted tabular-nums hover:border-line"
                />
              </Field>
            </FieldGrid>

            {/* ETİKETLER. Liste ve pano etiketleri gösteriyordu ama hiçbir
                ekranda DÜZENLENEMİYORDU — bir kez yazılan etiket sonsuza kadar
                öyle kalıyordu. Tek satır, virgülle: ayrı bir çip düzenleyicisi
                icat etmeye gerek yok. */}
            <Field label="Etiketler" hint="Virgülle ayırın — en fazla 10 etiket kaydedilir">
              <TextInput
                value={draft.tags}
                onChange={(e) => set("tags", e.target.value)}
                disabled={fieldsDisabled}
                placeholder="ör. lookbook, acil"
              />
            </Field>

            {/* Görünürlük — admin-only. Members never see or edit this. */}
            {isAdmin && (
              <div>
                <p className="mb-1 block text-[12.5px] font-medium text-muted">Görünürlük</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Görünürlük">
                  {TASK_VISIBILITIES.map((v) => {
                    const on = draft.visibility === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set("visibility", v)}
                        disabled={!canEdit}
                        aria-pressed={on}
                        className={cn(
                          "text-left rounded-control border px-3 py-2 transition-colors duration-150 disabled:pointer-events-none disabled:text-subtle",
                          on
                            ? "bg-brand-soft border-brand-ring"
                            : "bg-surface border-line hover:bg-surface-hover hover:border-line-strong",
                        )}
                      >
                        <span className={cn("flex items-center gap-1.5 text-[13.5px] font-medium", on ? "text-brand-strong" : "text-ink")}>
                          {v === "admin_only" && <Lock size={12} aria-hidden />}
                          {VISIBILITY_LABELS[v]}
                          {on && <Check size={13} className="ml-auto shrink-0" aria-hidden />}
                        </span>
                        <span className="block text-[12px] text-muted mt-0.5 leading-snug">
                          {VISIBILITY_DESCRIPTIONS[v]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[12px] text-subtle mt-1.5 leading-relaxed">
                  Değişiklik &quot;Kaydet&quot; ile uygulanır. Yöneticiye özel görevlerde
                  yalnızca yönetici kişiler sorumlu olabilir.
                </p>
              </div>
            )}
          </div>

          {/* Inline feedback (also visible on mobile, where the top bar hides it). */}
          {shown && <div className="mt-4 sm:hidden">{feedbackNode}</div>}
          {!canEdit && !doneLocked && (
            <p className="mt-4 text-[12px] text-subtle">Bu görevi düzenleme yetkiniz yok.</p>
          )}
        </div>

        {/* Sorumlu kişiler — active assignment management, right under the
            task details (never a passive side card). */}
        {participantsSlot}

        {/* Notlar — the main working area. */}
        {notesSlot}

        {/* Puan & Motivasyon — compact, above the audit trail. */}
        {effortSlot}

        {/* Aktivite — audit trail, intentionally the very last block. */}
        {activitySlot}
      </div>
    </>
  );
}

// ---- Audit trail ----

function ActivityLogSection({
  logs, profiles, contacts,
}: {
  logs: TaskActivityLogWithActor[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
}) {
  const resolveName = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    if (p) return p.full_name ?? p.email ?? null;
    const c = contacts.find((x) => x.id === id);
    return c?.name ?? null;
  };

  return (
    <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
      <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
        <History size={14} className="text-muted" aria-hidden /> Aktivite
      </h3>

      {logs.length === 0 ? (
        <EmptyState compact title="Henüz aktivite yok." description="Bundan sonraki değişiklikler burada görünecek." />
      ) : (
        <ol className="-mx-2">
          {logs.map((log) => {
            const actorName = log.actor?.full_name ?? log.actor?.email
              ?? (log.actor_id ? "Bilinmeyen kullanıcı" : "Sistem");
            return (
              <li key={log.id} className="flex gap-3 text-[13.5px] rounded-control px-2 py-1.5 hover:bg-surface-hover transition-colors duration-150">
                {/* Kişi kartı; "Sistem" satırı bir insan DEĞİL, o yüzden
                    kimlik rengi almaz (nötr daire). */}
                {log.actor_id ? (
                  <TaskPersonAvatar id={log.actor_id} name={actorName} size="xs" className="mt-0.5" />
                ) : (
                  <PersonAvatar name={actorName} colorHex={null} size="xs" className="mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-muted leading-snug">
                    <span className="font-medium text-ink">{actorName}</span>{" "}
                    {activityMessage(log, resolveName)}
                  </p>
                  <p className="text-[12px] text-subtle mt-0.5 tabular-nums">
                    {formatDateTimeTR(log.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function TaskDetail({
  task,
  activityLogs,
  profiles,
  contacts,
  departments,
  userId,
  canComplete = false,
  isAdmin = false,
  backHref = "/board",
  backLabel = "Board’a dön",
  responsiblePeople = [],
  personChoices,
  participantsSlot,
  notesSlot,
  effortSlot,
}: Props) {
  // Mirrors server canEditTask: admins always; members only own/created tasks.
  const canEdit = canComplete
    || task.assignee_id === userId
    || (task.created_by ?? null) === userId;

  // Remount the editor whenever the server task changes (e.g. after a save +
  // refresh) so the draft resets cleanly — no setState-in-effect needed.
  const version = `${task.id}:${task.updated_at}`;

  /* "Kaydedildi." onayı bu seviyede tutulur: kayıttan sonra editör yeniden
     monte edildiği için içeride tutulduğunda anında kayboluyor, kullanıcı
     kaydın gerçekleştiğini göremiyordu. Üç saniye sonra kendiliğinden siliner. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (savedAt === null) return;
    const t = window.setTimeout(() => setSavedAt(null), 3000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  /* Kişi kartlarının kaynağı — sayfanın ZATEN çektiği veri. Tohum kümesi ve
     sıralaması Pano'yla aynı olduğu için renk ataması da aynı çıkar. */
  const people = useMemo<TaskPeopleIndex>(() => {
    // Üyeyle eşleşen CRM kişisi ayrı bir renk almaz — o insan zaten profil
    // olarak sayıldı (buildAssignablePeople'ın çakışma kuralı).
    const contactSeeds = contacts.filter(
      (c) => !c.user_id || !profiles.some((p) => p.id === c.user_id),
    );
    const tones = assignPersonTones(
      [...profiles.map((p) => p.id), ...contactSeeds.map((c) => c.id)],
      personChoices ?? {},
    );
    const byId: Record<string, TaskPersonIdentity> = {};
    const byName: Record<string, TaskPersonIdentity> = {};
    const add = (id: string, name: string, photoUrl: string | null) => {
      const rec: TaskPersonIdentity = {
        photoUrl,
        colorHex: tones[id]?.hex ?? personTone(id).hex,
      };
      byId[id] = rec;
      const key = personNameKey(name);
      // İlk kayıt kazanır: üyeler önce eklendiği için aynı adlı CRM kişisi
      // üyenin fotoğrafını/rengini bastıramaz.
      if (key && !byName[key]) byName[key] = rec;
    };
    for (const p of profiles) add(p.id, p.full_name ?? p.email ?? "—", p.avatar_url ?? null);
    for (const c of contactSeeds) add(c.id, c.name, null);
    return { byId, byName };
  }, [profiles, contacts, personChoices]);

  return (
    /* Sağlayıcı sorumlu/not panellerini de kapsar: slot olarak gelseler de
       ÇİZİM ağacı burasıdır, kişi kartları aynı kimliği okur. */
    <TaskPeopleContext.Provider value={people}>
    {/* Tam genişlik (max-w kapağı yok) — çekmecede zaten 720–760px'e sığar. */}
    <div className={cn("w-full", PAGE_PAD)}>
      <TaskEditor
        key={version}
        task={task}
        departments={departments}
        canEdit={canEdit}
        canComplete={canComplete}
        isAdmin={isAdmin}
        backHref={backHref}
        backLabel={backLabel}
        responsiblePeople={responsiblePeople}
        participantsSlot={participantsSlot}
        notesSlot={notesSlot}
        effortSlot={effortSlot}
        activitySlot={<ActivityLogSection logs={activityLogs} profiles={profiles} contacts={contacts} />}
        justSaved={savedAt !== null}
        onSaved={() => setSavedAt(Date.now())}
      />
    </div>
    </TaskPeopleContext.Provider>
  );
}
