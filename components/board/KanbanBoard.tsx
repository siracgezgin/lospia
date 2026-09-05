"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useState,
  useOptimistic,
  useTransition,
  useCallback,
  useSyncExternalStore,
  useMemo,
  useRef,
  useEffect,
  createContext,
  useContext,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GripVertical, Plus, FileSpreadsheet, FileText, Search, X, Check, CalendarDays,
  ChevronLeft, ChevronRight, ChevronDown, MoreVertical, Pencil, Copy, Archive, Trash2, AlertTriangle, Lock, ShieldCheck,
} from "lucide-react";
import { ADMIN_ONLY_CHIP_LABEL, asVisibility, VISIBILITY_LABELS, type TaskVisibility } from "@/lib/utils/visibility";
import { Avatar } from "@/components/ui/Avatar";
import {
  BOARD_COLUMNS,
  getTaskColId,
  SAVED_VIEW_SLUG_MAP,
  type BoardColId,
} from "@/lib/utils/task-constants";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/utils/task-constants";
import {
  getTaskCardStyleByPerson,
  getTaskStateMarkers,
  PRIORITY_CHIP,
  STATUS_CHIP_TONE,
  BOARD_COL_HEADER_TONE,
} from "@/lib/design/semantics";
import { Badge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";
import { reorderTask, updateTask, softDeleteTask, archiveTask, duplicateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { useAnchoredMenu } from "@/lib/utils/use-anchored-menu";
import { formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { buildAssignablePeople } from "@/lib/people/assignable";
import { buildDeptMeta, type DeptMeta } from "@/lib/utils/departments";
import { PeopleGrid, type GridPerson } from "./PeopleGrid";
import { assignPersonTones } from "@/lib/design/person-colors";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { CsvImportModal } from "@/components/task/CsvImportModal";
import { NotesColumn } from "@/components/board/NotesColumn";
import { ViewTabs, VIEW_META, type ViewTabItem } from "@/components/shared/ViewTabs";
import { WeeklyNoteFeed } from "@/components/board/WeeklyNoteFeed";
import { BoardRulesPanel } from "@/components/board/BoardRulesPanel";
import { WorkspaceLiveRefresh } from "@/components/realtime/WorkspaceLiveRefresh";
import { canCreateTask, canDeleteTask, canArchiveTask, canCompleteTask } from "@/lib/auth/permissions";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole, WorkspaceDepartment, BoardNoteFeedItem } from "@/types";
import type { BoardRule, BoardMember } from "@/app/(app)/board/page";
import type { TaskParticipant } from "@/types";

// Department metadata (id → {name, color}) shared with all card renderers.
const DeptMetaContext = createContext<Record<string, DeptMeta>>({});
/* Kişi rengi — kart kimliğinin kaynağı.
   Aslı Hanım (2026-08-23): "Görevlerde de renk kişinin renginde olsun. Sadece
   tamamlananlar yeşil olacak." Kart artık departmanın değil SORUMLUNUN rengini
   taşır; departman rozetle görünmeye devam eder.
   Eşleme profiles.id → ton anahtarı (görevin assignee_id'si o alandır). */
const PersonColorContext = createContext<Record<string, string>>({});
function useTaskPersonColor(task: Task): string | null {
  const map = useContext(PersonColorContext);
  const participants = useContext(ParticipantsContext)[task.id];
  // Sorumluluk kuralı panonun geri kalanıyla AYNI olmalı (applyPersonFilter):
  // atanan → KATILIMCI → iş birliği → dış kişi. Katılımcı adımı yorumu vardı
  // ama kodu yoktu; sorumlusu yalnız katılımcı satırında yazan görevler
  // renksiz (nötr gri) çiziliyordu.
  if (task.assignee_id && map[task.assignee_id]) return map[task.assignee_id]!;
  if (participants) {
    for (const p of participants) {
      if (map[p.userId]) return map[p.userId]!;
    }
  }
  const collabs = (task.custom_fields as Record<string, unknown> | undefined)?.collaborators;
  if (Array.isArray(collabs)) {
    for (const id of collabs) {
      if (typeof id === "string" && map[id]) return map[id]!;
    }
  }
  if (task.responsible_contact_id && map[task.responsible_contact_id]) {
    return map[task.responsible_contact_id]!;
  }
  return null;
}

// Participant completions (taskId → [{name, completed}]) for card chips.
const ParticipantsContext = createContext<Record<string, TaskParticipant[]>>({});
function useTaskParticipants(taskId: string): TaskParticipant[] {
  return useContext(ParticipantsContext)[taskId] ?? [];
}

// Note-workflow signal per task (at most ONE small chip on the card — cards
// must stay uncluttered and never compete with the Acil frame emphasis).
type NoteSignal = { label: string; className: string };
const NoteSignalsContext = createContext<Record<string, NoteSignal>>({});

// Board-wide permission + toast surface, so deep card components can enforce the
// same rules used by drag/drop and report blocks with a clear toast.
type BoardCtxValue = {
  canComplete: boolean;                       // owner/admin may finalize Tamamlandı
  isResponsible: (task: Task) => boolean;     // admin → always; member → own/participant
  canDeleteTask: (task: Task) => boolean;     // admin → any; member → only own-created
  showToast: (msg: string) => void;
  taskHrefSuffix: string;                     // appended to /tasks/{id} (e.g. ?from=admin-board)
  /* Başarılı bir yazma işleminden SONRA çağrılır.
     Görev eylemleri (lib/actions/tasks) yalnız revalidatePath("/board") çağırır;
     Yönetici Pano AYRI bir rotadır (/admin-board) ve o yolda tazelenmez. Sonuç:
     yönetici kartı taşıyor, iyimser güncelleme bitince sunucudan ESKİ veri
     geliyor ve kart kendiliğinden eski sütununa geri dönüyordu — "kaydetmeyen
     düzenleme" tam olarak buydu. Yönetici panosunda rotayı elle tazeliyoruz.
     (Kalıcı çözüm eylemlere revalidatePath("/admin-board") eklemek; lib/actions
     bu düzeltmenin kapsamı dışında.) */
  afterMutation: () => void;
};
const BoardContext = createContext<BoardCtxValue | null>(null);

// ── Yönetici Pano (manager board) configuration ──────────────────────────────
// When present, the board runs in manager mode: visibility tabs + a manager-only
// person filter replace the saved-view / week / person chrome. All card, DnD,
// status and create behaviour is identical to the normal board.
export type ManagerOption = { userId: string; name: string };
export type AdminBoardConfig = {
  visibility: TaskVisibility;       // initial active tab
  manager: string;                  // "all" | manager userId
  managers: ManagerOption[];        // owner/admin people only
  managerUserIds: string[];         // for the "all" workspace-tab filter
  responsibleByTask: Record<string, string[]>; // canonical responsible user_ids
};

// Mobile board segments — a single full-width column at a time. "notes" is the
// special first segment; the rest mirror the desktop kanban columns.
type MobileSegId = "notes" | BoardColId;
const MOBILE_SEGMENTS: { id: MobileSegId; label: string }[] = [
  { id: "notes",         label: "Notlar" },
  { id: "yapilacak",     label: "Yapılacak" },
  { id: "devam_ediyor",  label: "Devam" },
  { id: "kontrol_onay",  label: "Kontrol" },
  { id: "tamamlandi",    label: "Tamamlandı" },
];

// The 4 user-facing statuses offered by the card status chip dropdown.
const CARD_STATUS_CHOICES: { value: TaskStatus; label: string }[] = [
  { value: "ready",       label: "Yapılacak" },
  { value: "in_progress", label: "Devam ediyor" },
  { value: "review",      label: "Kontrol / Onay" },
  { value: "done",        label: "Tamamlandı" },
];

/* Taşıma bildirimi TEK CÜMLEDİR. Aynı işlem iki ayrı yüzeyde iki ayrı
   cümleyle ("…sekmesine taşındı" / "…aşamasına taşındı") anlatılıyordu; üstelik
   "sekme" yalnız telefonda var, masaüstünde sütun. Metin yüzeyden bağımsızdır. */
function movedToast(status: TaskStatus): string {
  return `Görev "${STATUS_LABELS[status]}" durumuna taşındı.`;
}

/* Durum değiştirme İZNİ tek yerde tanımlıdır. Satır içi çip ve kart menüsündeki
   "Taşı" bölümü aynı kuralı okur — iki yüzeyde iki farklı kural olsaydı biri
   sunucunun reddedeceği bir seçeneği sunardı. Kural sunucuyla aynı: sorumlu
   (atanan, oluşturan ya da katılımcı) veya yönetici taşır — reorderTask
   (sürükleme) ve updateTask'ın yalnız-durum dalı bu kuralı paylaşır;
   tamamlanmış işi yalnız yönetici açar. */
function statusMovePermission(ctx: BoardCtxValue | null, task: Task, status: TaskStatus) {
  const canDone = ctx?.canComplete ?? false;
  const doneLocked = status === "done" && !canDone;
  return { canDone, canChange: (ctx?.isResponsible(task) ?? false) && !doneLocked };
}

/** Clickable status chip with a small dropdown — an alternative to drag/drop.
 *  Enforces the same permissions: non-responsible members get a static chip;
 *  members can't pick Tamamlandı. */
function CardStatusChip({ task }: { task: Task }) {
  const ctx = useContext(BoardContext);
  const [open, setOpen] = useState(false);
  const [optStatus, setOptStatus] = useOptimistic<TaskStatus>(task.status);
  const [pending, startT] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const tone = STATUS_CHIP_TONE[optStatus] ?? "bg-surface-sunken text-muted";
  // Meta metin 12px'in altına inmez (tipografi tabanı); çip Badge ölçüsünde.
  /* Çip bir DÜĞME olarak da kullanılıyor (satır içi durum değiştirme) ve
     telefonda 16px yüksekliğinde ölçülüyordu — parmakla isabet ettirilemez.
     `tap-target` görünümü büyütmeden hedefi 40×40'a çıkarır (yalnız kaba
     işaretçide); çipin ölçüsü ve satırın hizası aynen kalır. */
  const chipCls = cn("tap-target text-[12px] rounded-md px-1.5 py-0.5 leading-none font-medium", tone);
  // A done task is locked for non-admins — they can neither change nor reopen it.
  const { canDone, canChange } = statusMovePermission(ctx, task, optStatus);

  // No permission to change → plain, non-interactive chip.
  if (!ctx || !canChange) {
    return <span className={chipCls}>{STATUS_LABELS[optStatus]}</span>;
  }

  function choose(s: TaskStatus) {
    setOpen(false);
    if (s === optStatus) return;
    if (s === "done" && !canDone) {
      ctx!.showToast("Tamamlandı aşamasına yalnızca yöneticiler taşıyabilir.");
      return;
    }
    startT(async () => {
      setOptStatus(s);
      const res = await updateTask({ id: task.id, status: s });
      if (res && "error" in res) {
        ctx!.showToast(res.error || "Durum değiştirilemedi.");
        return;
      }
      ctx!.afterMutation();
      /* Kart, telefonda bulunduğu sekmeden KAYBOLUR (her sekme bir durum).
         Nereye gittiğini söylemezsek kullanıcı görevi sildiğini sanıyor. */
      ctx!.showToast(movedToast(s));
    });
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={cn(
          chipCls,
          "tap-target inline-flex items-center gap-0.5 hover:brightness-95 active:brightness-90 transition duration-150",
          // Kaydedilirken çip söner ve tıklanamaz: aynı görevi iki kez göndermek yok.
          pending && "cursor-wait opacity-60",
        )}
        title={pending ? "Kaydediliyor…" : "Durumu değiştir"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {STATUS_LABELS[optStatus]}
        <ChevronDown size={11} className="opacity-60" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-1 w-36 bg-surface border border-line rounded-control shadow-pop z-50 py-1 origin-top-left anim-fade-down">
          {CARD_STATUS_CHOICES.map((o) => {
            const disabled = o.value === "done" && !canDone;
            const active = o.value === optStatus;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => choose(o.value)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 text-[13px] flex items-center gap-1.5 hover:bg-surface-muted transition-colors duration-150",
                  active && "font-semibold text-brand",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
                )}
                title={disabled ? "Yalnızca yöneticiler tamamlayabilir" : undefined}
              >
                {o.label}
                {active && <Check size={12} className="ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bottom-right initials chips for member participants, with completion ring. */
function ParticipantChips({ participants }: { participants: TaskParticipant[] }) {
  if (participants.length === 0) return null;
  const shown = participants.slice(0, 4);
  const overflow = participants.length - shown.length;
  return (
    <span className="ml-auto flex items-center -space-x-1 shrink-0">
      {shown.map((p) => (
        <span key={p.memberId} className="relative" title={`${p.name} — ${p.completed ? "Tamamladı" : "Tamamlanmadı"}`}>
          {/* Neutral until this person completes; green (with check) once done. */}
          <Avatar
            name={p.name}
            size="xs"
            tone={p.completed ? "done" : "neutral"}
            title={`${p.name} — ${p.completed ? "Tamamladı" : "Tamamlanmadı"}`}
            className="ring-1 ring-surface"
          />
          {p.completed && (
            <Check size={8} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface text-success" strokeWidth={3} />
          )}
        </span>
      ))}
      {/* Avatar boyu (16px) — rozet içi tek işaret, tipografi tabanı burada uygulanmaz. */}
      {overflow > 0 && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-surface-sunken text-muted text-[8px] font-semibold ring-1 ring-surface">
          +{overflow}
        </span>
      )}
    </span>
  );
}

// ── Week helpers ──────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

// Local YYYY-MM-DD (NOT toISOString, which shifts to UTC and breaks week
// boundaries for UTC+3 — a Monday-local midnight became the previous day).
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const startMonth = MONTHS[monday.getMonth()];
  const endMonth   = MONTHS[sunday.getMonth()];
  if (startMonth === endMonth) return `${monday.getDate()}–${sunday.getDate()} ${endMonth}`;
  return `${monday.getDate()} ${startMonth} – ${sunday.getDate()} ${endMonth}`;
}

// ── Filter helpers ─────────────────────────────────────────────────────────────

function applyViewFilter(tasks: Task[], slug: string, userId: string, monday: Date): Task[] {
  const today = localISO(new Date());

  // Weekly membership is DUE-DATE-ONLY and strictly date-only, and it applies to
  // EXACTLY ONE view: "Bu hafta". A task belongs to a week if and only if its
  // delivery date (due_date, "YYYY-MM-DD") falls inside that Monday–Sunday range —
  // NOTHING else is consulted (not start_date, not completed_at, not created_at).
  // Undated tasks have no natural week, so they are excluded from "Bu hafta"
  // entirely. due_date is sliced to its date part so any timestamp leak is dropped
  // (no 03:00-style timezone artefacts), and plain string comparison is TZ-safe.
  //
  // Every OTHER view is week-independent by design: "Bana atananlar" is ALL my
  // tasks, "Gecikenler" is ALL overdue open tasks, "Tamamlananlar" is ALL done
  // tasks, "Onay bekleyenler" is ALL waiting tasks — never just the selected
  // week's slice. The week selector is only rendered on "Bu hafta" to match.
  const dueDay = (t: Task) => (t.due_date ? t.due_date.slice(0, 10) : null);
  const inWeek = (t: Task) => isDueInWeek(t, monday);

  const notArchived = (t: Task) =>
    !t.archived_at && !t.deleted_at && t.status !== "archived";

  switch (slug) {
    case "mine": // Bana atananlar — üzerimdeki TÜM görevler, haftadan bağımsız.
      return tasks.filter((t) => notArchived(t) && t.assignee_id === userId);

    case "overdue": // Gecikenler — bugüne göre teslimi geçmiş TÜM açık işler,
                    // haftadan bağımsız. Tamamlanmış işler gecikmiş sayılmaz.
      return tasks.filter((t) => {
        if (!notArchived(t) || t.status === "done") return false;
        const d = dueDay(t);
        return d !== null && d < today;
      });

    case "done": // Tamamlananlar — tamamlanmış TÜM işler, haftadan bağımsız.
      return tasks.filter((t) => t.status === "done" && !t.deleted_at && !t.archived_at);

    case "waiting-approval": // Onay bekleyenler — bekleyen TÜM işler, haftadan bağımsız.
      return tasks.filter((t) => {
        if (!notArchived(t) || t.status === "done") return false;
        return (
          t.status === "review" ||
          t.approval_required === true ||
          t.waiting_on_member_id != null ||
          t.waiting_on_contact_id != null
        );
      });

    case "all": // Tüm işler — tüm aktif (arşivlenmemiş/silinmemiş) işler.
      return tasks.filter((t) => notArchived(t));

    case "this-week": // Bu hafta — yalnızca seçili haftada teslimli aktif işler.
    default:          // varsayılan görünüm = Bu hafta
      return tasks.filter((t) => notArchived(t) && inWeek(t));
  }
}

// The ONLY week-scoped view. Drives whether the week navigator is rendered, so
// a user on "Gecikenler" can never believe the week header filters their list.
function isWeekScopedSlug(slug: string): boolean {
  return slug === "this-week";
}

// Haftalık üyelik SADECE due_date üzerinden ve tarih-bazlıdır (Pzt–Paz aralığı,
// string karşılaştırma → TZ güvenli). Tarihsiz görev haftaya girmez. Hem eski
// "this-week" görünümü hem yeni "Bu hafta" toggle'ı bu tek tanımı kullanır.
function isDueInWeek(t: Task, monday: Date): boolean {
  const d = t.due_date ? t.due_date.slice(0, 10) : null;
  if (d === null) return false;
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return d >= localISO(monday) && d <= localISO(sunday);
}

// One-line semantics of each view, shown under the tab strip so the general vs.
// weekly distinction is explicit instead of implied.
const VIEW_DESCRIPTIONS: Record<string, string> = {
  "all":              "Tüm erişilebilir görevler",
  "mine":             "Üzerinizdeki tüm görevler — haftadan bağımsız",
  "this-week":        "Seçili haftanın son tarihli görevleri",
  "overdue":          "Son tarihi geçmiş açık görevler — haftadan bağımsız",
  "done":             "Tamamlanmış tüm görevler — haftadan bağımsız",
  "waiting-approval": "Kontrol/onay bekleyen tüm görevler — haftadan bağımsız",
};

/**
 * Kişi süzgeci — panonun "bu kimin işi?" kuralı.
 *
 * SORUMLULUK ÜÇ YERDE YAZILI OLABİLİR, üçüne de bakmak zorundayız:
 *   1. tasks.assignee_id              — tek kişilik eski alan
 *   2. custom_fields.collaborators    — iş birliği yapanlar
 *   3. task_member_completions        — KANONİK kayıt (katılımcılar)
 *
 * Üçüncüsü buradan eksikti ve şu hataya yol açıyordu: "Görev oluştur"
 * penceresi sorumluları YALNIZCA katılımcı satırı olarak yazıyor
 * (createTask → setTaskParticipants; assignee_id null kalıyor). Dolayısıyla
 * panelden oluşturulan HER görev "Tüm işler"de görünüyor ama hiçbir kişinin
 * kartında çıkmıyordu.
 * (Aslı Hanım, 2026-08-24: "Tüm işler kısmına giriyorum her kişinin görevi
 *  var, ama board'da kişi adına basıp girince görev yok.")
 *
 * DÖRDÜNCÜSÜ — birleştirilmiş CRM kişisi: aynı insan hem üye hem CRM kişisi
 * olarak kayıtlıysa (Aslı Filinta = Aslı Hanım) ızgarada TEK kart çıkar
 * (buildAssignablePeople birleştirir). O tek kart üyeyi temsil eder; ama iş
 * eski CRM kaydına atanmış olabilir. mergedContactOf o bağı taşır, yoksa
 * birleştirilen kişinin işleri hiçbir kartta görünmezdi.
 */
function applyPersonFilter(
  tasks: Task[],
  personFilter: string,
  participantUserIds: Record<string, string[]> = {},
  mergedContactOf: Record<string, string> = {},
): Task[] {
  if (!personFilter) return tasks;

  const hasCollab = (t: Task, id: string) => {
    const collabs = (t.custom_fields as Record<string, unknown>)?.collaborators;
    return Array.isArray(collabs) && collabs.includes(id);
  };
  const isParticipant = (t: Task, userId: string) =>
    (participantUserIds[t.id] ?? []).includes(userId);

  if (personFilter.startsWith("member:")) {
    const id = personFilter.slice(7);
    const contactId = mergedContactOf[id];
    return tasks.filter(
      (t) =>
        t.assignee_id === id ||
        isParticipant(t, id) ||
        hasCollab(t, id) ||
        (contactId != null && t.responsible_contact_id === contactId),
    );
  }
  if (personFilter.startsWith("contact:")) {
    const id = personFilter.slice(8);
    return tasks.filter((t) => t.responsible_contact_id === id || hasCollab(t, id));
  }
  return tasks;
}

function matchesSearch(
  task: Task,
  search: string,
  responsibleNames: Record<string, string>,
): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  const cf = task.custom_fields as Record<string, unknown>;
  const category = String(cf?.category ?? "").toLowerCase();
  const konu = String(cf?.konu ?? "").toLowerCase();
  const collabs = Array.isArray(cf?.collaborators) ? (cf.collaborators as string[]) : [];
  const collabNames = collabs.map((id) => (responsibleNames[id] ?? "").toLowerCase());
  const responsibleName = (
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[task.responsible_contact_id ?? ""] ??
    ""
  ).toLowerCase();

  return (
    task.title.toLowerCase().includes(q) ||
    (task.description ?? "").toLowerCase().includes(q) ||
    category.includes(q) ||
    konu.includes(q) ||
    (task.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
    responsibleName.includes(q) ||
    collabNames.some((n) => n.includes(q))
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  viewSlug: string | null;
  weekIso?: string | null;
  workspaceId: string;
  userId: string;
  // avatar_url optional: kişi ızgarasındaki ekip fotoğrafı. Yoksa kişiye özel
  // ikon + baş harf çizilir (lib/design/person-colors.ts).
  profiles: (Pick<Profile, "id" | "full_name" | "email"> & { avatar_url?: string | null })[];
  contacts: WorkspaceContact[];
  notes: WorkspaceNote[];
  rules?: BoardRule[];
  newRulesCount?: number;
  departments?: WorkspaceDepartment[];
  participantsByTask?: Record<string, TaskParticipant[]>;
  members?: BoardMember[];
  deptMembers?: { department_id: string; member_id: string }[];
  userRole?: WorkspaceRole;
  // When set, the board runs as the Yönetici Pano (manager mode).
  adminBoard?: AdminBoardConfig;
  // Weekly note feed (Haftanın Not Akışı) + the current user's receipts.
  noteFeed?: BoardNoteFeedItem[];
  noteAcks?: { note_id: string; user_id: string; action: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeResponsible(task: Task) {
  if (task.assignee_id) return `member:${task.assignee_id}`;
  if (task.responsible_contact_id) return `contact:${task.responsible_contact_id}`;
  return "";
}

function formatDate(iso: string) {
  return formatDateTR(iso, { day: "numeric", month: "short" });
}

// Default board ordering weight: Acil → Geciken → Yakın teslim → normal. Within
// the same tier we sort by due date then the manual fractional index, so drag &
// drop ordering is still honoured but urgent/late work always floats to the top.
function taskUrgencyRank(t: Task, today: string): number {
  if (t.priority === "urgent" && t.status !== "done") return 0;
  if (t.status !== "done" && t.due_date && t.due_date < today) return 1; // overdue
  if (t.status !== "done" && t.due_date) {
    const soon = new Date(today + "T00:00:00");
    soon.setDate(soon.getDate() + 3);
    if (t.due_date <= soon.toISOString().slice(0, 10)) return 2; // due soon (≤3d)
  }
  return 3;
}

// Acil (urgent) görev ilk bakışta okunmalı: kalın kırmızı sol şerit + ince
// kırmızı halka + karttaki "Acil" rozeti. Vurgu kartın ÇERÇEVESİNDE yaşar,
// kimlik renginde değil; tamamlanan kartta düşer (bitmiş işin aciliyeti
// tarihtir). Düz sınıf dizgisi (cn() yok): tailwind-merge border-l-* yutuyor.
function urgentCardStyle(
  task: Task,
  base: { surface: string; border: string; accent: string; style?: React.CSSProperties },
): { surface: string; border: string; accent: string; style?: React.CSSProperties; widthCls: string; ring: string; shadow: string; urgent: boolean } {
  const urgent = task.priority === "urgent" && task.status !== "done";
  if (!urgent) {
    return { surface: base.surface, border: base.border, accent: base.accent, style: base.style, widthCls: "border-l-[3px]", ring: "", shadow: "shadow-card", urgent };
  }
  // ACİL: zemin KİŞİNİN rengi olarak kalır — Aslı Hanım (2026-08-23) "renk
  // kişinin renginde olsun" dedi, aciliyet kimliği silmemeli. Aciliyet artık
  // kalın kırmızı çerçeve + halka + gölge ile anlatılır; "Acil" rozeti zaten
  // kartın üstünde duruyor.
  /* Kenarlık ve zemin kişinin renginde KALIR; yalnız sol şerit kalınlaşıp
     kırmızıya döner, çevresine ince bir halka gelir. Kırmızı gölge yok (büyük
     görsel efekt yasak; "Acil" rozeti zaten kartın üstünde). Renk token'dan
     (--urgent): tek doygun kırmızı, her yüzeyde aynı. */
  return {
    surface: base.surface,
    style: base.style ? { ...base.style, borderLeftColor: "var(--urgent)" } : undefined,
    border: base.border,
    accent: "border-l-urgent",
    widthCls: "border-l-[6px]",
    ring: "ring-1 ring-urgent/30",
    shadow: "shadow-card",
    urgent,
  };
}

// ── Card 3-dot menu ───────────────────────────────────────────────────────────

const MENU_WIDTH = 160;      // 13px satırlar rahat sığsın
const MENU_EST_HEIGHT = 140; // first-paint guess; refined after measuring
// Menü satırı — 13px birincil metin, tek dil (durum menüsüyle aynı).
const MENU_ITEM =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink";

function CardMenu({
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  canArchive = true,
  canDelete = true,
  canDuplicate = true,
  moveTargets = [],
  onMove,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  canArchive?: boolean;
  canDelete?: boolean;
  canDuplicate?: boolean;
  /* "Taşı" bölümü — sürükle-bırakın KLAVYE ve DOKUNMATİK karşılığı. Sürükleme
     yalnız fareyle (ya da basılı tutmayla) yapılabiliyordu; klavyeyle çalışan
     birinin kartı taşımasının hiçbir yolu yoktu. Boş dizi → bölüm çizilmez. */
  moveTargets?: { value: TaskStatus; label: string; active: boolean; disabled: boolean }[];
  onMove?: (_status: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /* Silme onayı ORTAK diyalogdan (useConfirm). Eskiden menünün içine sıkışan
     iki adımlı "Evet / İptal" 10px'lik metinle okunmuyordu ve uygulamanın
     geri kalanındaki onay penceresine benzemiyordu. Diyalog bu sarmalayıcının
     React ağacında kalır: tıklamaları kartın aç/sürükle dinleyicilerine
     ulaşmadan durur. */
  const { ask, dialog } = useConfirm();
  // Fixed viewport coords: the menu is PORTALLED to <body> so neither the
  // column's overflow-auto nor a following card's paint order can clip it.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure the trigger and place the menu, flipping above when the space below
  // the card runs out (bottom-of-column cards used to lose the "Sil" row).
  const place = useCallback(() => {
    const trigger = ref.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    /* İlk karede menü henüz ölçülmemiştir; tahmin "Taşı" bölümünü de saymalı,
       yoksa alttaki kart menüsü ilk karede aşağı taşıp sonra zıplıyordu.
       Satır ≈33px, bölüm başlığı + ayraç ≈32px. */
    const estimated = MENU_EST_HEIGHT + (moveTargets.length > 0 ? 32 + moveTargets.length * 33 : 0);
    const height = menuRef.current?.offsetHeight ?? estimated;
    const left = Math.min(
      Math.max(8, r.right - MENU_WIDTH),
      Math.max(8, window.innerWidth - MENU_WIDTH - 8),
    );
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8
      ? Math.max(8, r.top - height - 4)
      : below;
    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [moveTargets.length]);

  // Re-place once the real height is known, so a flipped menu never hangs off
  // the viewport.
  useEffect(() => {
    if (open) place();
  }, [open, place]);

  /* Kapanma/konum davranışı ORTAK kuralda (lib/utils/use-anchored-menu):
     menünün kendi kaydırması yok sayılır, dışarıdaki kaydırmada menü kartı
     TAKİP eder (eskiden kapanıyordu — kolonu kaydıran kullanıcı menüyü
     kaybediyordu), kart ekrandan çıkarsa kapanır. */
  useAnchoredMenu({
    open,
    onClose: useCallback(() => setOpen(false), []),
    triggerRef: ref,
    menuRef,
    reposition: place,
  });

  async function requestDelete() {
    setOpen(false);
    const ok = await ask({
      title: "Görev çöp kutusuna taşınsın mı?",
      message: "Çöp kutusundan geri alabilirsiniz.",
      confirmLabel: "Çöp kutusuna taşı",
    });
    if (ok) onDelete();
  }

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Düğme HER ZAMAN görünür (soluk): hover'a saklanan işlev telefonda
          erişilemezdi. Kart hover'ında ve açıkken koyulaşır. Klavyeyle de
          ulaşılır (tabIndex -1 kaldırıldı). */}
      <button
        type="button"
        onClick={() => {
          // Place BEFORE opening so the first frame paints in position.
          if (!open) place();
          setOpen((o) => !o);
        }}
        className={`tap-target grid size-6 shrink-0 place-items-center rounded-md transition-[background-color,color] duration-150 hover:bg-surface-muted hover:text-ink ${open ? "bg-surface-muted text-ink" : "text-subtle/80 group-hover:text-muted"}`}
        aria-label="Görev seçenekleri"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={14} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
          /* Menü uzarsa (Taşı bölümü) ekranın dışına taşmaz, kendi içinde kayar. */
          className="fixed z-[100] max-h-[70vh] overflow-y-auto overscroll-contain bg-surface border border-line rounded-control shadow-pop py-1 origin-top-right anim-fade-down"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {moveTargets.length > 0 && onMove && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                Taşı
              </p>
              {moveTargets.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="menuitem"
                  disabled={t.disabled || t.active}
                  onClick={() => { setOpen(false); onMove(t.value); }}
                  className={cn(
                    MENU_ITEM,
                    t.active && "font-semibold text-brand",
                    (t.disabled || t.active) && "cursor-not-allowed opacity-50 hover:bg-transparent",
                  )}
                  title={t.disabled ? "Yalnızca yöneticiler tamamlayabilir" : undefined}
                >
                  {t.label}
                  {t.active && <Check size={12} className="ml-auto" />}
                </button>
              ))}
              <div className="my-1 border-t border-hairline" />
            </>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className={MENU_ITEM}>
            <Pencil size={13} /> Düzenle
          </button>
          {canDuplicate && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onDuplicate(); }} className={MENU_ITEM}>
              <Copy size={13} /> Çoğalt
            </button>
          )}
          {canArchive && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onArchive(); }} className={MENU_ITEM}>
              <Archive size={13} /> Arşivle
            </button>
          )}
          {canDelete && (
            <>
              <div className="my-1 border-t border-hairline" />
              {/* Yıkıcı eylem: kırmızı metin, ortak onay penceresi. */}
              <button
                type="button"
                role="menuitem"
                onClick={requestDelete}
                className={cn(MENU_ITEM, "text-danger hover:bg-danger/10 hover:text-danger")}
              >
                <Trash2 size={13} /> Sil
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
      {dialog}
    </div>
  );
}

// ── Quick-edit: Priority ──────────────────────────────────────────────────────

// ── Quick-edit: Responsible ───────────────────────────────────────────────────

function QuickAssigneeSelect({
  task,
  profiles,
  contacts,
  responsibleNames,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
}) {
  const ctx = useContext(BoardContext);
  const [_p, startTransition] = useTransition();
  const [encoded, setEncoded] = useOptimistic<string>(encodeResponsible(task));

  const currentName = encoded.startsWith("member:")
    ? responsibleNames[encoded.slice(7)] ?? "—"
    : encoded.startsWith("contact:")
    ? responsibleNames[encoded.slice(8)] ?? "—"
    : null;

  // Assignment mirrors the server rule (canManageTaskAssignment): admins any
  // task; a member only tasks they created / own / are responsible for. Others
  // get a read-only avatar — no select at all. The server enforces this too;
  // this just keeps the UI honest instead of pretending the change stuck.
  const canAssign = ctx?.isResponsible(task) ?? false;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    startTransition(async () => {
      setEncoded(val);
      const assignee_id = val.startsWith("member:") ? val.slice(7) : null;
      const responsible_contact_id = val.startsWith("contact:") ? val.slice(8) : null;
      const res = await updateTask({ id: task.id, assignee_id, responsible_contact_id });
      if (res && "error" in res) {
        ctx?.showToast(res.error || "Sorumlu kişi değiştirilemedi.");
        return;
      }
      ctx?.afterMutation();
    });
  }

  const avatar = currentName ? (
    // Initials only; neutral until the task is done (never "green by default").
    <Avatar
      name={currentName}
      size="xs"
      tone={task.status === "done" ? "done" : "neutral"}
      title={`${currentName} — ${task.status === "done" ? "Tamamladı" : "Tamamlanmadı"}`}
    />
  ) : (
    <span className="text-[12px] text-subtle pointer-events-none">—</span>
  );

  if (!canAssign) {
    return (
      <span
        className="inline-flex items-center ml-auto shrink-0"
        title="Bu göreve sorumlu kişi atama yetkiniz yok."
      >
        {avatar}
      </span>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1 ml-auto shrink-0" data-interactive>
      {avatar}
      <select
        value={encoded}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        // Görünmez seçici: avatarın üstünde saydam <select>, tıklayınca
        // tarayıcının kendi listesi açılır — Field primitifi burada çizim
        // yapmadığı için gereksiz.
        className="absolute inset-0 w-full cursor-pointer opacity-0"
        aria-label="Sorumlu değiştir"
      >
        <option value="">— Atanmamış</option>
        {profiles.length > 0 && (
          <optgroup label="Üyeler">
            {profiles.map((p) => (
              <option key={p.id} value={`member:${p.id}`}>{p.full_name ?? p.email}</option>
            ))}
          </optgroup>
        )}
        {contacts.length > 0 && (
          <optgroup label="Kişiler">
            {contacts.map((c) => (
              <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

// ── Card body (shared between static + sortable) ──────────────────────────────

function CardContent({
  task,
  profiles,
  contacts,
  responsibleNames,
  interactive,
  onDelete,
  onArchive,
  onDuplicate,
  canArchiveCard = true,
  canDeleteCard = true,
  showMenu = true,
  showStatus = false,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  interactive: boolean;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  canArchiveCard?: boolean;
  canDeleteCard?: boolean;
  showMenu?: boolean;
  /** Durum çipi YALNIZ mobil kartta çizilir — orada sürükleme yok, durumu
   *  değiştirmenin başka yolu kalmıyor. Masaüstünde kartın hangi sütunda
   *  durduğu zaten durumudur; çip orada sadece tekrardı. */
  showStatus?: boolean;
}) {
  // Detail link keeps the originating board's context (so "← geri" returns here).
  const boardCtx = useContext(BoardContext);
  const router = useRouter();
  const [movePending, startMove] = useTransition();

  /* Kart menüsündeki "Taşı" — sürükle-bırakla AYNI işi yapar, ama fare
     gerektirmez: klavyeyle çalışan ya da sürüklemeyi bilmeyen biri de kartı
     taşıyabilsin. İzin kuralı satır içi çiple tek kaynaktan gelir.
     Mobil kartta ÇİZİLMEZ (showStatus): orada durum çipi zaten aynı işi yapar,
     iki yol birden aynı karta konursa gereksiz kalabalık olur. */
  const { canDone: canMoveToDone, canChange: canMoveCard } =
    statusMovePermission(boardCtx, task, task.status);
  const moveTargets = canMoveCard && !showStatus
    ? CARD_STATUS_CHOICES.map((c) => ({
        value: c.value,
        label: c.label,
        active: c.value === task.status,
        disabled: c.value === "done" && !canMoveToDone,
      }))
    : [];
  function handleMove(status: TaskStatus) {
    if (status === task.status) return;
    if (status === "done" && !canMoveToDone) {
      boardCtx?.showToast("Tamamlandı aşamasına yalnızca yöneticiler taşıyabilir.");
      return;
    }
    startMove(async () => {
      const res = await updateTask({ id: task.id, status });
      if (res && "error" in res) {
        boardCtx?.showToast(res.error || "Görev taşınamadı.");
        return;
      }
      boardCtx?.afterMutation();
      boardCtx?.showToast(movedToast(status));
    });
  }
  const hrefSuffix = boardCtx?.taskHrefSuffix ?? "";
  const taskHref = `/tasks/${task.id}${hrefSuffix}`;
  // Per-card delete: members may only delete tasks they created (server-enforced).
  const canDeleteThis = boardCtx ? boardCtx.canDeleteTask(task) : canDeleteCard;
  // Duplicate mirrors the server rule in duplicateTask: admins any task; a
  // member only tasks they created / own / are responsible for.
  const canDuplicateThis = boardCtx ? boardCtx.isResponsible(task) : true;
  const taskDone = task.status === "done";
  // Active member participants (with per-person completion) drive the people chips.
  const participants = useTaskParticipants(task.id);
  const responsibleName =
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[task.responsible_contact_id ?? ""];

  // State is an OVERLAY only: a chip + due-date color. Never the card color.
  const markers = getTaskStateMarkers(task);
  // Note-workflow signal (max ONE chip: Aksiyon bekliyor > Onay bekliyor >
  // Sorumlu değişti > Yeni not > Güncellendi) — never crowds the Acil frame.
  const noteSignal = useContext(NoteSignalsContext)[task.id];

  /* TEK ROZET KURALI.
     Kartın üstünde bir zamanlar beş rozet birden durabiliyordu: departman +
     durum ("Gecikti"/"Bekliyor"/"Onay") + öncelik + not sinyali + gizli işaret.
     Aslı Hanım (2026-08-24): "İsmi, işi, tarihi bu kadar… Mühendis gibi
     hissetmek istemiyorum."
     Artık kart en fazla BİR rozet taşır ve sırası şudur:
       Acil  >  not sinyali (aksiyon/onay bekleyen)  >  gizli
     Departman rozeti kalktı — kartın rengi zaten kimin işi olduğunu söylüyor.
     Durum rozeti kalktı — hangi sütunda durduğu zaten durumudur. */
  const soleChip: { label: string; className: string; icon?: boolean } | null =
    task.priority === "urgent"
      ? { label: PRIORITY_LABELS.urgent, className: PRIORITY_CHIP.urgent, icon: true }
      : noteSignal
      ? { label: noteSignal.label, className: noteSignal.className }
      : (task as unknown as { visibility?: string }).visibility === "admin_only"
      ? { label: ADMIN_ONLY_CHIP_LABEL, className: "bg-hold/10 text-hold border border-hold/30" }
      : null;

  return (
    /* Taşınırken kart söner: sunucu cevabı gelene kadar "bir şey oluyor" görünür
       ve aynı işlem iki kez tetiklenmez. */
    <div className={cn("flex-1 min-w-0 transition-opacity duration-150", movePending && "pointer-events-none opacity-50")}>
      {/* Üst satır: tek rozet (varsa) + kart menüsü */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {soleChip && (
            <Badge size="xs" className={cn("mb-1.5 max-w-full truncate inline-flex items-center gap-0.5", soleChip.className)}>
              {soleChip.icon && <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />}
              {soleChip.label}
            </Badge>
          )}
        </div>
        {interactive && showMenu && onDelete && onArchive && onDuplicate && (
          <CardMenu
            /* Uygulama içi gezinme (router.push). window.location.href TÜM
               sayfayı yeniden yüklüyordu: kabuk, pano verisi ve seçili kişi
               sıfırdan kuruluyor, "Düzenle" saniyelerce beyaz ekran demek
               oluyordu. */
            onEdit={() => router.push(taskHref)}
            onDuplicate={() => onDuplicate(task.id)}
            onArchive={() => onArchive(task.id)}
            onDelete={() => onDelete(task.id)}
            canArchive={canArchiveCard}
            canDelete={canDeleteThis}
            canDuplicate={canDuplicateThis}
            moveTargets={moveTargets}
            onMove={handleMove}
          />
        )}
      </div>

      {/* Title — operasyon başlıkları uzun olabilir; 4 satıra kadar tam okunsun
          ve tooltip ile tamamı görülebilsin. Başlık açıklamadan önceliklidir. */}
      <Link
        prefetch={false}
        href={taskHref}
        title={task.title}
        draggable={false}
        className={cn(
          "text-[13.5px] font-semibold line-clamp-4 block leading-snug tracking-[-0.005em] break-words",
          markers.shouldStrike
            ? "text-success/90 line-through decoration-success/40"
            : "text-ink hover:text-brand",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      {/* Açıklama satırı KALDIRILDI — kartta iş başlığı yeter; ayrıntı görevin
          kendi sayfasında. ("Bize ne kadar fazla bilgi verirsen o kadar
          yavaşlarız." — Aslı Hanım, 2026-08-24) */}

      {/* Alt satır: TARİH + KİŞİ. Durum çipi masaüstünde yok — sütun zaten durum. */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {showStatus && (interactive ? (
          <CardStatusChip task={task} />
        ) : (
          <span className={cn("text-[12px] rounded-md px-1.5 py-0.5 leading-none font-medium", STATUS_CHIP_TONE[task.status] ?? "bg-surface-sunken text-muted")}>
            {STATUS_LABELS[task.status]}
          </span>
        ))}

        {/* TARİH — gecikmişse ikon + kırmızı metin + açıklayıcı title; kart
            kırmızıya BOYANMAZ (kart rengi kişinin kimliğidir, semantics.ts). */}
        {task.due_date && (
          <span
            className={cn("flex items-center gap-1 text-[12px] font-medium tabular-nums", markers.dueDateClass)}
            title={markers.overdue ? "Teslim tarihi geçti" : "Teslim tarihi"}
          >
            {markers.overdue && <AlertTriangle size={11} aria-hidden />}
            {markers.overdue && <span className="sr-only">Gecikti: </span>}
            {formatDate(task.due_date)}
          </span>
        )}

        {/* People: member participant chips (with completion) grouped bottom-right.
            Falls back to the assignee editor/avatar when there are no participants. */}
        {participants.length > 0 ? (
          <ParticipantChips participants={participants} />
        ) : interactive ? (
          <QuickAssigneeSelect
            task={task}
            profiles={profiles}
            contacts={contacts}
            responsibleNames={responsibleNames}
          />
        ) : responsibleName ? (
          <Avatar
            name={responsibleName}
            size="xs"
            tone={taskDone ? "done" : "neutral"}
            title={`${responsibleName} — ${taskDone ? "Tamamladı" : "Tamamlanmadı"}`}
            className="shrink-0 ml-auto"
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Static card (pre-mount) ───────────────────────────────────────────────────

function StaticTaskCard({
  task,
  profiles,
  contacts,
  responsibleNames,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
}) {
  // Department drives the card color; done overrides to the reserved green.
  // border (all sides) then border-l accent last so it wins. No cn() — tailwind-merge strips border-l-*.
  const personColor = useTaskPersonColor(task);
  const em = urgentCardStyle(task, getTaskCardStyleByPerson(task.status, personColor));
  const cardCls = `rounded-card border ${em.widthCls} p-3 ${em.shadow} hover:shadow-card-hover transition-shadow duration-200 ease-standard cursor-pointer ${em.surface} ${em.border} ${em.accent} ${em.ring}`;
  return (
    <div className={cardCls} style={em.style}>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 p-0.5 shrink-0 text-subtle/70" aria-hidden><GripVertical size={14} /></span>
        <CardContent task={task} profiles={profiles} contacts={contacts} responsibleNames={responsibleNames} interactive={false} />
      </div>
    </div>
  );
}

// ── Sortable card (post-mount) ────────────────────────────────────────────────

function TaskCard({
  task,
  profiles,
  contacts,
  responsibleNames,
  isDragOverlay = false,
  onDelete,
  onArchive,
  onDuplicate,
  canArchiveCard = true,
  canDeleteCard = true,
  showMenu = true,
  disableDrag = false,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  isDragOverlay?: boolean;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  canArchiveCard?: boolean;
  canDeleteCard?: boolean;
  showMenu?: boolean;
  disableDrag?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const router = useRouter();
  const boardCtx = useContext(BoardContext);
  // Department drives the card color; done overrides to the reserved green; urgent
  // overrides both with a red emphasis. No cn() — tailwind-merge strips border-l-*.
  const personColor = useTaskPersonColor(task);
  const em = urgentCardStyle(task, getTaskCardStyleByPerson(task.status, personColor));
  const colorCls = `${em.surface} ${em.border} ${em.accent} ${em.ring}`;
  const stateCls = [
    isDragging ? "opacity-40" : "",
    // Hover'da YALNIZ gölge (translate/scale yok): kartın kenarlığı kişinin
    // renginde kalır ve dnd-kit'in satır içi transform'uyla çakışma olmaz.
    isDragOverlay
      ? "shadow-drawer rotate-1"
      : "hover:shadow-card-hover transition-shadow duration-200 ease-standard",
    // Keyboard focus (the card receives tabIndex from dnd-kit attributes) — a
    // calm brand ring so drag/enter targets are visible without a mouse.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/60 focus-visible:ring-offset-1",
  ].filter(Boolean).join(" ");
  // The WHOLE card is the drag handle (grab anywhere except interactive children,
  // which stop pointer propagation). Grip icon stays as a subtle affordance.
  const canDrag = !disableDrag && !isDragOverlay;
  const dragCls = canDrag ? "cursor-pointer active:cursor-grabbing" : "cursor-pointer";
  const dragProps = canDrag ? { ...attributes, ...listeners } : {};

  // The WHOLE card opens the task detail — except interactive children (status
  // chip, assignee select, menu, links) which stop propagation and are filtered
  // by the closest() guard as a second net. A real drag (the mouse sensor fires
  // only after 5px, touch only after a 220ms press) must not navigate on release, so we remember
  // that a drag happened and swallow exactly the click that follows it.
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);
  const taskHref = `/tasks/${task.id}${boardCtx?.taskHrefSuffix ?? ""}`;
  function openDetail(e: React.MouseEvent | React.KeyboardEvent) {
    if (isDragOverlay) return;
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest("button, a, select, input, textarea, [data-interactive]")) return;
    router.push(taskHref);
  }

  return (
    <div
      ref={setNodeRef}
      /* Sürükleme dönüşümü ile kişi rengi AYNI style nesnesinde birleşir —
         ayrı verilirse biri diğerini eziyor. */
      style={{ ...em.style, transform: CSS.Transform.toString(transform), transition }}
      /* touch-manipulation: dokunmatikte çift-dokunma yakınlaştırma gecikmesi
         kalkar ama SAYFA/SÜTUN KAYDIRMASI çalışmaya devam eder (touch-none
         verilseydi tablette sütun hiç kaydırılamazdı). TouchSensor'ın basılı
         tutma eşiği sürüklemeyi zaten ayırıyor. */
      className={`rounded-card border ${em.widthCls} p-3 ${em.shadow} group touch-manipulation ${colorCls} ${stateCls} ${dragCls}`}
      {...dragProps}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(e);
        }
      }}
      aria-label={`Görev detayını aç: ${task.title}`}
    >
      <div className="flex items-start gap-1.5">
        {/* Tutamaç HER ZAMAN görünür (soluk) — sürüklenebilirlik hover'a
            saklanmaz; imleç tutamaçta "grab". Sürükleme kilitliyse yer korunur
            ama görünmez, kart metni hizada kalır. */}
        <span
          className={`mt-0.5 p-0.5 shrink-0 transition-colors duration-150 ${
            disableDrag ? "text-transparent" : "cursor-grab text-subtle/70 group-hover:text-muted"
          }`}
          aria-hidden
          title={disableDrag ? undefined : "Sürükleyerek taşıyın — dokunmatik ekranda kartı basılı tutun"}
        >
          <GripVertical size={14} />
        </span>
        <CardContent
          task={task}
          profiles={profiles}
          contacts={contacts}
          responsibleNames={responsibleNames}
          interactive={!isDragOverlay && !disableDrag}
          onDelete={isDragOverlay ? undefined : onDelete}
          onArchive={isDragOverlay ? undefined : onArchive}
          onDuplicate={isDragOverlay ? undefined : onDuplicate}
          canArchiveCard={canArchiveCard}
          canDeleteCard={canDeleteCard}
          showMenu={showMenu}
        />
      </div>
    </div>
  );
}

// ── Mobile card (no DnD — status changes via the card chip / task detail) ─────

function MobileTaskCard({
  task,
  profiles,
  contacts,
  responsibleNames,
  onDelete,
  onArchive,
  onDuplicate,
  canArchiveCard = true,
  canDeleteCard = true,
  showMenu = true,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  canArchiveCard?: boolean;
  canDeleteCard?: boolean;
  showMenu?: boolean;
}) {
  // Same colour language as the desktop card; no cn() — tailwind-merge strips border-l-*.
  const personColor = useTaskPersonColor(task);
  const em = urgentCardStyle(task, getTaskCardStyleByPerson(task.status, personColor));
  const colorCls = `${em.surface} ${em.border} ${em.accent} ${em.ring}`;
  const router = useRouter();
  const boardCtx = useContext(BoardContext);
  // Whole card opens the detail (same guard as the desktop card; no DnD here).
  function openDetail(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, select, input, textarea, [data-interactive]")) return;
    router.push(`/tasks/${task.id}${boardCtx?.taskHrefSuffix ?? ""}`);
  }
  return (
    <div
      /* İç boşluk masaüstü kartıyla AYNI (p-3): aynı kart iki ölçüde durmaz. */
      className={`rounded-card border ${em.widthCls} p-3 ${em.shadow} cursor-pointer ${colorCls} transition-transform duration-[var(--duration-fast)] ease-standard active:scale-[0.99]`}
      style={em.style}
      onClick={openDetail}
    >
      <CardContent
        task={task}
        profiles={profiles}
        contacts={contacts}
        responsibleNames={responsibleNames}
        interactive
        onDelete={onDelete}
        onArchive={onArchive}
        onDuplicate={onDuplicate}
        canArchiveCard={canArchiveCard}
        canDeleteCard={canDeleteCard}
        showMenu={showMenu}
        showStatus
      />
    </div>
  );
}

// ── Column (post-mount) ───────────────────────────────────────────────────────

function KanbanColumn({
  colDef,
  tasks,
  profiles,
  contacts,
  responsibleNames,
  onAddTask,
  onDelete,
  onArchive,
  onDuplicate,
  canArchiveCard = true,
  canDeleteCard = true,
  showMenu = true,
  disableDrag = false,
  lockDoneDrag = false,
}: {
  colDef: typeof BOARD_COLUMNS[number];
  tasks: Task[];
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  onAddTask: (_colId: BoardColId) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  canArchiveCard?: boolean;
  canDeleteCard?: boolean;
  showMenu?: boolean;
  disableDrag?: boolean;
  // Non-admins can't drag done cards (mirrors the server reopen lock).
  lockDoneDrag?: boolean;
}) {
  const taskIds = tasks.map((t) => t.id);
  const { setNodeRef, isOver } = useDroppable({ id: colDef.id });
  const headerTone = BOARD_COL_HEADER_TONE[colDef.id] ?? "text-muted";

  /* Masaüstünde sütun ŞERİDİ alanı doldurur: 288px taban genişlik + `grow`.
     Dar ekranda toplam genişlik sığmadığı için yatay kaydırma (min-w-max)
     aynen sürer; geniş ekranda artan yer sütunlara paylaştırılır — sağ yarısı
     boş kalan pano bundandı. `shrink-0` tabanın altına inmeyi engeller. */
  return (
    <div className="flex flex-col gap-2 w-[80vw] max-w-72 sm:w-72 sm:max-w-none sm:grow shrink-0">
      {/* Başlık: bölüm eyebrow ölçüsü (12px / semibold / 0.08em). Sayaç
          listeyi TARİF eder (sütundaki iş adedi) — kişiyi puanlayan sayı değil. */}
      <div className="sticky top-0 z-20 flex h-11 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={cn("truncate text-[12px] font-semibold uppercase tracking-[0.08em]", headerTone)}>
            {colDef.label}
          </h3>
          <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken px-1.5 py-0.5 text-[12px] font-semibold leading-none text-muted tabular-nums">
            {tasks.length}
          </span>
        </div>
        {!disableDrag && (
          <IconButton
            size="sm"
            aria-label={`${colDef.label} sütununa görev ekle`}
            onClick={() => onAddTask(colDef.id)}
            className="size-7 text-subtle hover:bg-brand-soft hover:text-brand"
          >
            <Plus size={15} />
          </IconButton>
        )}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2 rounded-card p-1.5 min-h-14 bg-surface-sunken/50 transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-standard",
            tasks.length === 0 && "border border-dashed border-line",
            isOver && "bg-brand-soft/60 ring-2 ring-inset ring-brand-ring/50",
          )}
          data-col={colDef.id}
        >
          {/* Boş sütun: küçük, sakin tek satır — dev boş kart değil. Sürükleme
              üstüne gelince bırakma ipucuna döner. */}
          {tasks.length === 0 && (
            <p className="pointer-events-none select-none py-3 text-center text-[12px] text-subtle">
              {isOver ? "Buraya bırakın" : "Görev yok"}
            </p>
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              profiles={profiles}
              contacts={contacts}
              responsibleNames={responsibleNames}
              onDelete={onDelete}
              onArchive={onArchive}
              onDuplicate={onDuplicate}
              canArchiveCard={canArchiveCard}
              canDeleteCard={canDeleteCard}
              showMenu={showMenu}
              disableDrag={disableDrag || (lockDoneDrag && task.status === "done")}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Static column (pre-mount) ─────────────────────────────────────────────────

function StaticKanbanColumn({
  colDef,
  tasks,
  profiles,
  contacts,
  responsibleNames,
}: {
  colDef: typeof BOARD_COLUMNS[number];
  tasks: Task[];
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
}) {
  const headerTone = BOARD_COL_HEADER_TONE[colDef.id] ?? "text-muted";
  /* Genişlik davranışı DnD sütunuyla birebir aynı olmalı — mount öncesi ve
     sonrası yerleşim zıplamasın. */
  return (
    <div className="flex flex-col gap-2 w-[80vw] max-w-72 sm:w-72 sm:max-w-none sm:grow shrink-0 anim-fade">
      <div className="sticky top-0 z-20 flex h-11 items-center gap-2">
        <h3 className={cn("truncate text-[12px] font-semibold uppercase tracking-[0.08em]", headerTone)}>
          {colDef.label}
        </h3>
        <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken px-1.5 py-0.5 text-[12px] font-semibold leading-none text-muted tabular-nums">{tasks.length}</span>
      </div>
      <div className={cn("flex flex-col gap-2 rounded-card p-1.5 min-h-14 bg-surface-sunken/50", tasks.length === 0 && "border border-dashed border-line")}>
        {tasks.length === 0 && (
          <p className="pointer-events-none select-none py-3 text-center text-[12px] text-subtle">Görev yok</p>
        )}
        {tasks.map((task) => (
          <StaticTaskCard key={task.id} task={task} profiles={profiles} contacts={contacts} responsibleNames={responsibleNames} />
        ))}
      </div>
    </div>
  );
}

// ── Mounted guard ─────────────────────────────────────────────────────────────
const subscribeMounted = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

// ── Main board ────────────────────────────────────────────────────────────────

export function KanbanBoard({
  tasks: initialTasks,
  savedViews,
  viewSlug,
  weekIso,
  workspaceId,
  userId,
  profiles,
  contacts,
  notes,
  rules = [],
  newRulesCount = 0,
  departments = [],
  participantsByTask = {},
  members = [],
  deptMembers = [],
  userRole = "member",
  adminBoard,
  noteFeed = [],
  noteAcks = [],
}: Props) {
  const isAdminBoard = !!adminBoard;
  const deptMeta = useMemo(() => buildDeptMeta(departments), [departments]);
  // Top-level departments for the Departman filter dropdown
  const deptFilterOptions = useMemo(
    () => departments.filter((d) => d.parent_id === null).map((d) => ({ id: d.id, name: d.name })),
    [departments],
  );
  // A task matches a top-level department filter if its department is that
  // department or one of its children.
  const deptMatchIds = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const d of departments.filter((x) => x.parent_id === null)) {
      const set = new Set<string>([d.id]);
      for (const c of departments.filter((x) => x.parent_id === d.id)) set.add(c.id);
      m[d.id] = set;
    }
    return m;
  }, [departments]);
  const canCreate  = canCreateTask(userRole);
  const canDelete  = canDeleteTask(userRole);
  const canArchive = canArchiveTask(userRole);
  const canComplete = canCompleteTask(userRole);
  const isViewer   = userRole === "viewer";

  // Responsibility check mirrors the server (reorderTask): admins may move any
  // task; members only tasks they own, created, or are a participant of.
  const isResponsible = useCallback((task: Task) => {
    if (userRole === "owner" || userRole === "admin") return true;
    if (task.assignee_id === userId || task.created_by === userId) return true;
    return (participantsByTask[task.id] ?? []).some((p) => p.userId === userId);
  }, [userRole, userId, participantsByTask]);

  // Delete rule mirrors the server (canDeleteTaskItem): admins delete any task;
  // members delete ONLY tasks they created — never an admin-created task, even if
  // they are the responsible person.
  const canDeleteTaskFn = useCallback((task: Task) => {
    if (userRole === "owner" || userRole === "admin") return true;
    if (userRole === "viewer") return false;
    return (task.created_by ?? null) === userId;
  }, [userRole, userId]);
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);
  const router = useRouter();

  /* SÜRÜKLEME ALGILAYICILARI — fare ve parmak ayrı ayrı.
     Eskiden tek `PointerSensor` vardı. PointerSensor parmağı da yakalar ama
     sürüklemeyi ilk 5px'te başlatır; dokunmatikte o ilk 5px KAYDIRMA hareketinin
     kendisidir — tablette sütunu kaydırmaya çalışan kişi farkında olmadan kartı
     sürüklüyor, gerçek sürükleme ise tarayıcı kaydırmayı üstlendiği an
     (pointercancel) yarıda kalıyordu.
     Artık: fare 5px hareketle, parmak 220ms BASILI TUTMA ile sürükler. Basılı
     tutmadan yapılan her dokunuş kaydırma veya tıklama olarak tarayıcıda kalır;
     8px tolerans, parmağın doğal titremesini sürükleme sanmaz. */
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const [_isPending, startTransition] = useTransition();
  /* Bkz. BoardCtxValue.afterMutation — Yönetici Pano rotası sunucu eylemlerinin
     revalidatePath("/board") çağrısıyla tazelenmiyor. */
  const afterMutation = useCallback(() => {
    if (isAdminBoard) router.refresh();
  }, [isAdminBoard, router]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>("ready");

  // Mobile board: which single column is shown (segmented control).
  const [mobileSeg, setMobileSeg] = useState<MobileSegId>("yapilacak");

  // Client-side filters (not URL-persisted; reset on refresh)
  const [personFilter, setPersonFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [search, setSearch] = useState("");

  // Panonun kapısı kişi ızgarasıdır (Aslı Hanım, 2026-08-19: "Ana sayfan o
  // olsun. Kişi seçelim… ortada, büyük büyük"). Bir kişi seçilince ya da
  // "Tüm işler" denince kolonlara geçilir; "← Kişiler" ile geri dönülür.
  // Yönetici Pano bu kapıyı kullanmaz (kendi yönetici filtresi var).
  const [peopleEntry, setPeopleEntry] = useState(!isAdminBoard);

  // Manager-mode state (visibility tab + manager person filter). URL-synced so a
  // Yönetici Pano view is shareable; defaults come from the server-parsed params.
  const [adminVisibility, setAdminVisibility] = useState<TaskVisibility>(adminBoard?.visibility ?? "admin_only");
  const [adminManager, setAdminManager] = useState<string>(adminBoard?.manager ?? "all");
  const managerUserIdSet = useMemo(() => new Set(adminBoard?.managerUserIds ?? []), [adminBoard]);
  // userId → workspace_members.id, so create-from-board can seed a default
  // responsible (the active manager, or the creating admin).
  const memberIdByUserId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mm of members) if (mm.userId) m[mm.userId] = mm.memberId;
    return m;
  }, [members]);

  function syncAdminUrl(vis: TaskVisibility, mgr: string) {
    const params = new URLSearchParams();
    params.set("visibility", vis);
    if (mgr !== "all") params.set("manager", mgr);
    router.replace(`/admin-board?${params.toString()}`, { scroll: false });
  }

  // Week selector — initialized from URL param (weekIso) so page reload preserves selection
  const [weekStart, setWeekStart] = useState<Date>(() =>
    weekIso ? getMondayOf(new Date(weekIso + "T00:00:00")) : getMondayOf(new Date())
  );
  // "Bu hafta" toggle — basılıyken aktif görünümün ÜZERİNE hafta filtresi biner
  // (yalnız seçili haftada teslim tarihli işler); kapalıyken TÜM işler görünür.
  // URL'de ?week= varsa sayfa yenilemede toggle açık kalır.
  const [weekOnly, setWeekOnly] = useState<boolean>(() => !!weekIso);
  const currentMonday = getMondayOf(new Date());
  const isCurrentWeek = weekStart.toDateString() === currentMonday.toDateString();


  // Toast notifications (optionally with an action link, e.g. "open in Tüm işler")
  type Toast = { id: string; msg: string; action?: { label: string; href: string } };
  const [toasts, setToasts] = useState<Toast[]>([]);
  /* Bildirim zamanlayıcıları panoyla birlikte ölür: toast görünürken başka bir
     sayfaya geçildiğinde (ör. toast'taki "Çöp kutusu" bağlantısı) sökülmüş
     bileşende setState çalışıyordu. */
  const toastTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = toastTimers.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);
  function showToast(msg: string, action?: Toast["action"]) {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, msg, action }]);
    const timer = setTimeout(() => {
      toastTimers.current.delete(timer);
      setToasts((p) => p.filter((t) => t.id !== id));
    }, action ? 7000 : 3000);
    toastTimers.current.add(timer);
  }
  function dismissToast(id: string) {
    setToasts((p) => p.filter((t) => t.id !== id));
  }

  // Effective slug: null or missing → default to "Tüm işler". Aslı Hanım'ın
  // isteğiyle haftalık/aylık bölümleme kaldırıldı; giriş yapıldığında bekleyen,
  // geçmiş ve gelecekteki TÜM işler görünür.
  const effectiveSlug = viewSlug ?? "all";
  // Hafta gezgini yalnız toggle basılıyken görünür (eski this-week sekmesi yok).
  const weekFilterActive = !isAdminBoard && weekOnly;

  // ── Geri bildirimle şimdilik gizlenen özellikler ─────────────────────────────
  // Nisa/Aslı Hanım'ın isteğiyle kapatıldı; kod ve veri korunur, tek satırla
  // geri açılabilir.
  const RULES_PANEL_ENABLED = false; // Kurallar paneli
  const CSV_IMPORT_ENABLED = false;  // CSV'den içe aktar
  // Departman filtresi — Aslı Hanım (2026-08-19): "Yukarıda bir daha üretim ve
  // tedarik zinciri, finans ve operasyon diye yazmasın yani. Yoruyor onlar
  // bizi." Filtre mantığı ve verisi korunur; yalnız araç çubuğundan kalktı.
  const DEPARTMENT_FILTER_ENABLED = false;

  const responsibleNames = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => { map[p.id] = p.full_name ?? p.email ?? "?"; });
    contacts.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [profiles, contacts]);

  // Single source of truth for assignable people: workspace members ∪ CRM
  // contacts, with contact↔user duplicates collapsed (explicit user_id link or
  // normalized-name match — the member entry wins). The same builder feeds the
  // task-detail Sorumlu kişiler panel and the create form, so every assignment
  // UI shows the SAME people. Department membership never filters this list.
  /* Görev → katılımcı userId listesi. Kişi süzgecinin ÜÇÜNCÜ kaynağı
     (task_member_completions); "Görev oluştur" penceresi sorumluyu yalnız
     buraya yazıyor. */
  const participantUserIds = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [taskId, list] of Object.entries(participantsByTask)) {
      out[taskId] = list.map((p) => p.userId);
    }
    return out;
  }, [participantsByTask]);

  const assignablePeople = useMemo(() => {
    const memberInputs = members.length > 0
      ? members
      : profiles.map((p) => ({ memberId: p.id, userId: p.id, name: p.full_name ?? p.email ?? "—" }));
    return buildAssignablePeople({ members: memberInputs, contacts });
  }, [members, profiles, contacts]);

  const pickerContacts = useMemo(() => {
    const soloContactIds = new Set(
      assignablePeople.filter((p) => p.type === "contact").map((p) => p.contactId),
    );
    return contacts.filter((c) => soloContactIds.has(c.id));
  }, [assignablePeople, contacts]);

  /* Üyeye BİRLEŞTİRİLEN CRM kişisi (userId → contactId).
     Aynı insan iki kayıtta olabiliyor; ızgarada tek kart çıkar ve o kart
     üyeyi temsil eder. Eski CRM kaydına atanmış işler bu harita olmadan
     hiçbir kartta görünmezdi. */
  const mergedContactOf = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of assignablePeople) {
      if (p.type === "user" && p.userId && p.contactId) out[p.userId] = p.contactId;
    }
    return out;
  }, [assignablePeople]);

  function handleAddTask(colId: BoardColId) {
    const col = BOARD_COLUMNS.find((c) => c.id === colId);
    setModalDefaultStatus(col?.targetStatus ?? "ready");
    setModalOpen(true);
  }

  const [optimisticTasks, setOptimisticTasks] = useOptimistic(
    initialTasks,
    (
      state: Task[],
      action:
        | { type: "reorder"; id: string; status: TaskStatus; afterId: string | null }
        | { type: "remove"; id: string },
    ) => {
      if (action.type === "remove") return state.filter((t) => t.id !== action.id);
      const moved = state.find((t) => t.id === action.id);
      if (!moved) return state;
      // Mirror the DB trigger: completing sets completed_at (so the task stays
      // visible in week-scoped views like "Tüm işler"); un-completing clears it.
      const completed_at =
        action.status === "done"
          ? moved.completed_at ?? new Date().toISOString()
          : null;
      const updated = { ...moved, status: action.status, completed_at };
      const rest = state.filter((t) => t.id !== action.id);
      if (!action.afterId) return [...rest, updated];
      const idx = rest.findIndex((t) => t.id === action.afterId);
      if (idx === -1) return [...rest, updated];
      return [...rest.slice(0, idx + 1), updated, ...rest.slice(idx + 1)];
    },
  );

  // ── Card lifecycle handlers ──────────────────────────────────────────────────

  /* Yıkıcı işlemler SESSİZ KALAMAZ. Eskiden sonuç okunmuyordu: sunucu "yetkiniz
     yok" dese bile kart iyimser olarak listeden siliniyor ve "çöp kutusuna
     taşındı" yazıyordu; kart bir sonraki yenilemede geri geliyordu ve kimse
     neden olduğunu bilmiyordu. Artık hata Türkçe gösterilir ve router.refresh()
     ile pano sunucudaki GERÇEK duruma geri döner. */
  function handleDeleteCard(id: string) {
    startTransition(async () => {
      setOptimisticTasks({ type: "remove", id });
      const res = await softDeleteTask(id);
      if ("error" in res) {
        showToast(res.error || "Görev silinemedi.");
        router.refresh();
        return;
      }
      afterMutation();
      showToast("Görev çöp kutusuna taşındı.", { label: "Çöp kutusu", href: "/trash" });
    });
  }

  function handleArchiveCard(id: string) {
    startTransition(async () => {
      setOptimisticTasks({ type: "remove", id });
      const res = await archiveTask(id);
      if ("error" in res) {
        showToast(res.error || "Görev arşivlenemedi.");
        router.refresh();
        return;
      }
      afterMutation();
      showToast("Görev arşivlendi.", { label: "Arşiv", href: "/archive" });
    });
  }

  function handleDuplicateCard(id: string) {
    startTransition(async () => {
      const res = await duplicateTask(id);
      if ("error" in res) {
        showToast(res.error || "Görev çoğaltılamadı.");
        return;
      }
      router.refresh();
      showToast("Görev çoğaltıldı.");
    });
  }

  // Composed filter. Normal board: saved-view → department → person → search.
  // Manager board: visibility tab → manager → department → search (no week/view,
  // and the manager filter replaces the assignee-based person filter).
  const filteredTasks = useMemo(() => {
    let tasks: Task[];
    if (adminBoard) {
      tasks = optimisticTasks.filter((t) => asVisibility(t.visibility) === adminVisibility);
      tasks = tasks.filter((t) => {
        const resp = adminBoard.responsibleByTask[t.id] ?? [];
        if (adminManager === "all") {
          // admin_only is managers-only by construction → show all; the workspace
          // tab keeps only tasks owned by at least one manager.
          return adminVisibility === "admin_only" || resp.some((uid) => managerUserIdSet.has(uid));
        }
        return resp.includes(adminManager);
      });
    } else {
      tasks = applyViewFilter(optimisticTasks, effectiveSlug, userId, weekStart);
      // "Bu hafta" toggle'ı görünümün üzerine biner: yalnız seçili haftada
      // teslim tarihi olan işler kalır (tarihsizler hariç — hafta modeli).
      if (weekOnly) tasks = tasks.filter((t) => isDueInWeek(t, weekStart));
    }
    if (departmentFilter) {
      const allowed = deptMatchIds[departmentFilter] ?? new Set([departmentFilter]);
      tasks = tasks.filter((t) => t.department_id != null && allowed.has(t.department_id));
    }
    if (!adminBoard) tasks = applyPersonFilter(tasks, personFilter, participantUserIds, mergedContactOf);
    tasks = tasks.filter((t) => matchesSearch(t, search, responsibleNames));
    return tasks;
  }, [adminBoard, adminVisibility, adminManager, managerUserIdSet, optimisticTasks, effectiveSlug, userId, weekStart, weekOnly, departmentFilter, deptMatchIds, personFilter, participantUserIds, mergedContactOf, search, responsibleNames]);

  // Distribute filtered tasks into columns
  const tasksByCol = useMemo(() => {
    const today = localISO(new Date());
    return BOARD_COLUMNS.reduce<Record<BoardColId, Task[]>>((acc, col) => {
      acc[col.id] = filteredTasks
        .filter((t) => (col.statuses as TaskStatus[]).includes(t.status))
        .sort((a, b) => {
          // 1. Priority/urgency tier (Acil → Geciken → Yakın teslim → normal)
          const ra = taskUrgencyRank(a, today);
          const rb = taskUrgencyRank(b, today);
          if (ra !== rb) return ra - rb;
          // 2. Earlier due date first (undated last)
          const da = a.due_date ?? "9999-12-31";
          const db = b.due_date ?? "9999-12-31";
          if (da !== db) return da < db ? -1 : 1;
          // 3. Manual drag-and-drop order (fractional index) is the final word
          return (a.fractional_index ?? "").localeCompare(b.fractional_index ?? "");
        });
      return acc;
    }, {} as Record<BoardColId, Task[]>);
  }, [filteredTasks]);

  function findTask(id: string) {
    return optimisticTasks.find((t) => t.id === id);
  }

  const onDragStart = useCallback((event: DragStartEvent) => {
    const task = findTask(event.active.id as string);
    if (task) setActiveTask(task);
  }, [optimisticTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Sürükleme İPTAL edilebilir: Esc'e basmak, parmağın ekrandan çıkması,
     tarayıcının dokunuşu kaydırmaya çevirmesi… Bu durumda dnd-kit onDragEnd'i
     DEĞİL onDragCancel'ı çağırır. Bu kanca yokken activeTask temizlenmiyordu ve
     ekranın ortasında hiçbir yere bırakılamayan hayalet bir kart asılı kalıyordu
     (kurtuluşu sayfayı yenilemekti). */
  const onDragCancel = useCallback(() => setActiveTask(null), []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const srcTask = findTask(activeId);
    if (!srcTask) return;

    const srcColId = getTaskColId(srcTask.status);

    let tgtColId: BoardColId;
    const overTask = findTask(overId);
    if (overTask) {
      tgtColId = getTaskColId(overTask.status);
    } else if (BOARD_COLUMNS.some((c) => c.id === overId)) {
      tgtColId = overId as BoardColId;
    } else {
      return;
    }

    const tgtCol = BOARD_COLUMNS.find((c) => c.id === tgtColId)!;
    const newStatus: TaskStatus = srcColId === tgtColId ? srcTask.status : tgtCol.targetStatus;

    // Members may only move tasks they are responsible for (own / participant).
    if (!isResponsible(srcTask)) {
      showToast("Bu görevi yalnızca sorumlu kişiler veya yöneticiler taşıyabilir.");
      return;
    }

    // Approval gate: only owner/admin may cross the "Tamamlandı" boundary — both
    // INTO done and OUT of done. Members route through "Kontrol / Onay".
    if (newStatus !== srcTask.status && (newStatus === "done" || srcTask.status === "done") && !canComplete) {
      showToast(
        srcTask.status === "done"
          ? "Tamamlanmış görevleri yalnızca yöneticiler değiştirebilir."
          : "Tamamlandı aşamasına yalnızca yöneticiler taşıyabilir.",
      );
      return;
    }

    // Explain disappearance: if this status change pushes the task out of the
    // current saved-view filter, never let it silently vanish — tell the user
    // why and give a one-click way to find it in "Tüm işler". (Manager board has
    // no week/view filter, so a status change never hides a card there.)
    if (!isAdminBoard && newStatus !== srcTask.status) {
      const updatedForFilter: Task = {
        ...srcTask,
        status: newStatus,
        completed_at: newStatus === "done" ? srcTask.completed_at ?? new Date().toISOString() : null,
      };
      const stillInView = applyViewFilter([updatedForFilter], effectiveSlug, userId, weekStart).length > 0;
      if (!stillInView) {
        const week = localISO(weekStart);
        const msg =
          effectiveSlug === "overdue"
            ? "Görev tamamlandı ve Gecikenler görünümünden çıkarıldı."
            : effectiveSlug === "done"
            ? "Görev aktif duruma alındı ve Tamamlananlar görünümünden çıkarıldı."
            : "Görev güncellendi ve bu görünümün filtresi dışına çıktı.";
        showToast(msg, { label: "Tüm işlerde aç", href: `/board?view=all&week=${week}` });
      }
    }

    const tgtTasks = tasksByCol[tgtColId] ?? [];
    const overIdx = overTask ? tgtTasks.findIndex((t) => t.id === overId) : tgtTasks.length;
    const withoutActive = tgtTasks.filter((t) => t.id !== activeId);
    const prevTask = overIdx > 0 ? withoutActive[Math.min(overIdx - 1, withoutActive.length - 1)] : null;
    const nextTask = overIdx < withoutActive.length ? withoutActive[overIdx] : null;

    const prevIndex = prevTask?.fractional_index ?? null;
    const nextIndex = nextTask?.fractional_index ?? null;

    startTransition(async () => {
      setOptimisticTasks({
        type: "reorder",
        id: activeId,
        status: newStatus,
        afterId: prevTask?.id ?? null,
      });

      const result = await reorderTask({ id: activeId, newStatus, prevIndex, nextIndex });
      if ("error" in result) {
        // Never fail silently — explain and resync so the card snaps back cleanly.
        showToast(result.error || "Görev taşınamadı.");
        router.refresh();
        return;
      }
      afterMutation();
    });
  }, [optimisticTasks, tasksByCol]); // eslint-disable-line react-hooks/exhaustive-deps

  /* "✕ Temizle" yalnız GERÇEK bir filtre varken çıkar. personFilter artık
     filtre değil, panonun hangi kişide açıldığıdır (giriş ızgarasından gelir)
     — ondan çıkış yolu soldaki "Kişiler" düğmesi. Onu da filtre sayınca
     düğme her zaman görünüyor ve araç çubuğunda hiç sönmeyen bir uyarı gibi
     duruyordu. */
  const hasActiveFilter = (isAdminBoard && adminManager !== "all") || !!search || !!departmentFilter;

  // Manager-board task detail links carry the originating context so the detail
  // page's "← geri" returns to the right Yönetici Pano tab.
  const taskHrefSuffix = isAdminBoard
    ? `?from=admin-board&visibility=${adminVisibility}${adminManager !== "all" ? `&manager=${adminManager}` : ""}`
    : "";

  // Seed the create form's responsible people so a new manager-board task lands
  // in the current filter: the selected manager, else the creating admin.
  const adminCreateResponsibleIds = useMemo<string[] | undefined>(() => {
    if (!isAdminBoard) return undefined;
    const seedUser = adminManager !== "all" ? adminManager : userId;
    const mid = memberIdByUserId[seedUser];
    return mid ? [mid] : [];
  }, [isAdminBoard, adminManager, memberIdByUserId, userId]);

  // ── Kişi ızgarası — panonun giriş ekranı ─────────────────────────────────
  // Üyeler ∪ (üyeyle eşleşmeyen) CRM kişileri; ızgara ve renk/ikon ataması
  // buradan beslenir. Departman üyeliği burayı ASLA daraltmaz (proje kuralı:
  // buildAssignablePeople tek kaynak).
  const gridPeople = useMemo<GridPerson[]>(() => {
    const fromMembers: GridPerson[] = (members.length > 0
      ? members.map((m) => ({
          filterKey: `member:${m.userId}`,
          id: m.userId,
          name: m.name,
          avatarUrl: profiles.find((p) => p.id === m.userId)?.avatar_url ?? null,
          isAdmin: m.isAdmin,
          jobTitle: m.jobTitle ?? null,
        }))
      : profiles.map((p) => ({
          filterKey: `member:${p.id}`,
          id: p.id,
          name: p.full_name ?? p.email ?? "—",
          avatarUrl: p.avatar_url ?? null,
        })));
    const fromContacts: GridPerson[] = pickerContacts.map((c) => ({
      filterKey: `contact:${c.id}`,
      id: c.id,
      name: c.name,
    }));
    return [...fromMembers, ...fromContacts];
  }, [members, profiles, pickerContacts]);

  /* Kimlik seçimleri (Ayarlar → Kişi Kimliği). Anahtar profiles.id — pano,
     liste ve raporlar aynı tohumu kullanmalı, yoksa kişinin rengi ekranlar
     arasında tutmaz. */
  const personChoices = useMemo(() => {
    const out: Record<string, { colorKey?: string | null; iconKey?: string | null }> = {};
    for (const m of members) out[m.userId] = { colorKey: m.colorKey, iconKey: m.iconKey };
    return out;
  }, [members]);

  const personTones = useMemo(
    () => assignPersonTones(gridPeople.map((p) => p.id), personChoices),
    [gridPeople, personChoices],
  );

  /** Görev kartının rengi buradan gelir: profiles.id → ton anahtarı. */
  const personColorMap = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, tone] of Object.entries(personTones)) out[id] = tone.key;
    return out;
  }, [personTones]);

  /** Seçili kişinin ızgaradaki kaydı — üst şeritteki renkli başlık için. */
  const selectedPerson = useMemo(
    () => gridPeople.find((p) => p.filterKey === personFilter) ?? null,
    [gridPeople, personFilter],
  );

  const boardCtx = useMemo<BoardCtxValue>(
    () => ({ canComplete, isResponsible, canDeleteTask: canDeleteTaskFn, showToast, taskHrefSuffix, afterMutation }),
    [canComplete, isResponsible, canDeleteTaskFn, taskHrefSuffix, afterMutation], // eslint-disable-line react-hooks/exhaustive-deps -- showToast uses stable setToasts
  );

  // ── Haftanın Not Akışı: week-scoped feed items ────────────────────────────
  // Info notes belong ONLY to their creation week; action/handoff/approval
  // notes carry over into later weeks while still open (until claimed/closed),
  // so a pending action can never silently disappear on a week flip. Note the
  // task columns' week filter stays due_date-based and untouched — this filter
  // applies to the note feed only.
  const claimedNoteIds = useMemo(
    () => new Set(noteAcks.filter((a) => a.action === "claimed").map((a) => a.note_id)),
    [noteAcks],
  );
  // The feed follows the SELECTED week only on "Bu hafta"; every other view is
  // week-independent, so the feed there is pinned to the CURRENT week — the
  // notes column can never suggest those views are week-filtered.
  const feedWeekIso = localISO(effectiveSlug === "this-week" ? weekStart : currentMonday);
  const weekFeedItems = useMemo(() => {
    // Haftalık bölümleme kaldırıldı: "Bu hafta" dışındaki görünümlerde (artık
    // varsayılan) not akışı haftaya göre filtrelenmez — son notların tamamı görünür.
    if (effectiveSlug !== "this-week") return noteFeed;
    const monday = new Date(feedWeekIso + "T00:00:00");
    const mondayStr = feedWeekIso;
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const sundayStr = localISO(sunday);
    const dayOf = (iso: string) => localISO(new Date(iso));
    return noteFeed.filter((n) => {
      const d = dayOf(n.createdAt);
      const inWeek = d >= mondayStr && d <= sundayStr;
      if (n.noteType === "info") return inWeek;
      const claimed = n.actionStatus === "claimed" || !!n.claimedByName || claimedNoteIds.has(n.id);
      const open = !claimed && n.actionStatus !== "closed";
      return inWeek || (open && d <= sundayStr);
    });
  }, [noteFeed, feedWeekIso, claimedNoteIds, effectiveSlug]);

  // ── Per-card note signal (single small chip, priority-ordered) ────────────
  const noteSignals = useMemo<Record<string, NoteSignal>>(() => {
    const now = new Date().getTime();
    const RECENT_NOTE = 48 * 3600 * 1000; // "Yeni not" / "Sorumlu değişti" window
    const RECENT_UPDATE = 24 * 3600 * 1000; // "Güncellendi" window
    const seenByMe = new Set(
      noteAcks.filter((a) => a.user_id === userId && a.action === "seen").map((a) => a.note_id),
    );
    const best: Record<string, { rank: number; sig: NoteSignal }> = {};
    const propose = (taskId: string, rank: number, label: string, className: string) => {
      const cur = best[taskId];
      if (!cur || rank < cur.rank) best[taskId] = { rank, sig: { label, className } };
    };
    for (const n of noteFeed) {
      const claimed = n.actionStatus === "claimed" || !!n.claimedByName || claimedNoteIds.has(n.id);
      const open = !claimed && n.actionStatus !== "closed";
      const recent = now - new Date(n.createdAt).getTime() < RECENT_NOTE;
      if (n.noteType === "action_required" && open) {
        propose(n.taskId, 1, "Aksiyon bekliyor", "bg-hold/10 text-hold border border-hold/30");
      } else if (n.noteType === "approval_waiting" && open) {
        propose(n.taskId, 2, "Onay bekliyor", "bg-approval/10 text-approval border border-approval/30");
      } else if (n.noteType === "handoff" && recent) {
        propose(n.taskId, 3, "Sorumlu değişti", "bg-info/10 text-info border border-info/30");
      } else if (recent && n.authorId !== userId && !seenByMe.has(n.id)) {
        propose(n.taskId, 4, "Yeni not", "bg-brand-soft text-brand-strong border border-brand-ring/50");
      }
    }
    // "Güncellendi" — a recent task edit with no stronger note signal. Done
    // cards skip it (completed history needs no freshness chip).
    for (const t of optimisticTasks) {
      if (best[t.id] || t.status === "done") continue;
      if (
        t.updated_at && t.created_at && t.updated_at !== t.created_at &&
        now - new Date(t.updated_at).getTime() < RECENT_UPDATE
      ) {
        propose(t.id, 5, "Güncellendi", "bg-surface-sunken text-muted border border-line");
      }
    }
    const out: Record<string, NoteSignal> = {};
    for (const [k, v] of Object.entries(best)) out[k] = v.sig;
    return out;
  }, [noteFeed, noteAcks, claimedNoteIds, userId, optimisticTasks]);

  const feedNode = (
    <WeeklyNoteFeed
      items={weekFeedItems}
      deptMeta={deptMeta}
      currentUserId={userId}
      isViewer={isViewer}
      acks={noteAcks}
      onMutated={afterMutation}
    />
  );
  // Heading follows the feed's week: the selected week's label while browsing a
  // past/future week on "Bu hafta", otherwise the plain current-week wording.
  const feedLabel =
    effectiveSlug === "this-week" && !isCurrentWeek
      ? `Görev notları · ${formatWeekLabel(weekStart)}`
      : "Görev notları";

  return (
    <DeptMetaContext.Provider value={deptMeta}>
    <PersonColorContext.Provider value={personColorMap}>
    <ParticipantsContext.Provider value={participantsByTask}>
    <NoteSignalsContext.Provider value={noteSignals}>
    <BoardContext.Provider value={boardCtx}>
    {/* Desktop: fixed-height shell with internal column scroll. Mobile (max-md):
        natural height so the rules/week/tabs/filters chrome scrolls away with the
        page and only the compact status tabs stay sticky. */}
    <div className="flex flex-col h-full max-md:h-auto max-md:min-h-full">

      {/* Live refresh: realtime when enabled, light polling otherwise, so other
          people's changes surface without a manual reload. */}
      <WorkspaceLiveRefresh workspaceId={workspaceId} />

      {/* ── Manager board header: visibility tabs (Yönetici Pano only) ─────── */}
      {isAdminBoard && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 bg-surface border-b border-hairline shrink-0 flex-wrap">
          <ShieldCheck size={16} className="text-brand shrink-0" />
          <span className="text-sm font-semibold tracking-tight text-ink mr-1">Yönetici Pano</span>
          <div className="inline-flex rounded-control border border-line bg-surface-sunken p-0.5">
            {(["admin_only", "workspace"] as TaskVisibility[]).map((v) => {
              const on = adminVisibility === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { setAdminVisibility(v); syncAdminUrl(v, adminManager); }}
                  className={cn(
                    // Dokunmatikte parmağa göre (mobil denetimde 32px ölçüldü);
                    // farede yoğunluk korunur.
                    "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 pointer-coarse:min-h-10",
                    on ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink",
                  )}
                >
                  {v === "admin_only" && <Lock size={12} />}
                  {VISIBILITY_LABELS[v]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rules panel (compact, collapsible) — normal board only ────────── */}
      {RULES_PANEL_ENABLED && !isAdminBoard && <BoardRulesPanel rules={rules} newCount={newRulesCount} />}

      {/* ── View tabs + week navigation — normal board only ───────────────── */}
      {/* Two logical groups in one strip: the general (week-independent) views,
          then — visually separated with a divider + calendar icon — "Bu hafta",
          the ONLY view the week applies to. The week navigator renders directly
          UNDER the tabs and ONLY while "Bu hafta" is active, so no other view
          can appear week-bound. Each tab explains itself via the muted
          description line below the strip. */}
      {!isAdminBoard && !peopleEntry && savedViews.length > 0 && (
        <div className="px-4 pt-2.5 pb-2 bg-surface border-b border-line shrink-0 space-y-1.5">
          {/* Shared segmented view tabs (identical language to the List). The
              general views come first; "Bu hafta" is set apart with a divider +
              calendar icon because it is the ONLY week-scoped view. Entering it
              always starts on the CURRENT week. Icons show on every tab so the
              board reads as a Monday-style toolbar. */}
          {/* Sekmeler + "Bu hafta" toggle'ı aynı satırda ("Onay bekleyenler"in
              hemen yanında). Toggle basılı → aktif görünümün üzerine hafta
              filtresi biner; kapalı (varsayılan) → tüm işler. */}
          <div className="flex flex-wrap items-center gap-2">
            <ViewTabs
              iconsEverywhere
              // "Bu hafta" sekmesi gizlendi — haftalık bölümleme kaldırıldı.
              // (Görünüm mantığı ve saved view verisi korunur; geri alınabilir.)
              items={savedViews
                .filter((view) => (SAVED_VIEW_SLUG_MAP[view.name] ?? view.id) !== "this-week")
                .map((view): ViewTabItem => {
                  const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
                  return {
                    slug,
                    label: view.name,
                    icon: VIEW_META[slug as keyof typeof VIEW_META]?.icon,
                    active: effectiveSlug === slug,
                    dividerBefore: false,
                  };
                })}
              getHref={(slug) => `/board?view=${slug}`}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const next = !weekOnly;
                const monday = getMondayOf(new Date());
                setWeekOnly(next);
                setWeekStart(monday);
                router.push(
                  next
                    ? `/board?view=${effectiveSlug}&week=${localISO(monday)}`
                    : `/board?view=${effectiveSlug}`,
                  { scroll: false },
                );
              }}
              aria-pressed={weekOnly}
              // Basılı hâl tereddütsüz seçili: marka dolgusu + halka rengi kenarlık.
              className={weekOnly ? "border-brand-ring bg-brand-soft text-brand-strong hover:bg-brand-soft" : "text-muted"}
              title={weekOnly ? "Hafta filtresini kaldır — tüm işleri göster" : "Yalnız bu haftanın işlerini göster"}
            >
              <CalendarDays size={14} />
              Bu hafta
            </Button>
          </div>

          {/* Active view description + (toggle açıkken) week navigator */}
          <div className="flex items-center gap-3 flex-wrap min-h-6">
            <p className="text-[13px] text-muted">
              {VIEW_DESCRIPTIONS[effectiveSlug] ?? ""}
              {weekFilterActive && " · yalnız seçili haftada teslim tarihli işler"}
            </p>
            {weekFilterActive && (
              <div className="flex items-center gap-1">
                <IconButton
                  size="sm"
                  aria-label="Önceki hafta"
                  onClick={() => {
                    const n = new Date(weekStart);
                    n.setDate(n.getDate() - 7);
                    const monday = getMondayOf(n);
                    setWeekStart(monday);
                    router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
                  }}
                >
                  <ChevronLeft size={15} />
                </IconButton>
                <span className="text-[13px] font-semibold text-ink min-w-28 text-center select-none tabular-nums">
                  {formatWeekLabel(weekStart)}
                </span>
                <IconButton
                  size="sm"
                  aria-label="Sonraki hafta"
                  onClick={() => {
                    const n = new Date(weekStart);
                    n.setDate(n.getDate() + 7);
                    const monday = getMondayOf(n);
                    setWeekStart(monday);
                    router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
                  }}
                >
                  <ChevronRight size={15} />
                </IconButton>
                {!isCurrentWeek && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 text-brand hover:bg-brand-soft hover:text-brand-strong"
                    onClick={() => {
                      const monday = getMondayOf(new Date());
                      setWeekStart(monday);
                      router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
                    }}
                  >
                    Bu haftaya dön
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Kişi ızgarası — panonun kapısı (Aslı Hanım, 2026-08-19) ──────── */}
      {peopleEntry && !isAdminBoard && (
        <PeopleGrid
          people={gridPeople}
          choices={personChoices}
          meKey={`member:${userId}`}
          onPick={(key) => { setPersonFilter(key); setPeopleEntry(false); }}
          onShowAll={() => { setPersonFilter(""); setPeopleEntry(false); }}
        />
      )}

      {/* ── Seçili kişi şeridi — kimin sayfasındayız? ─────────────────────── */}
      {!peopleEntry && !isAdminBoard && (
        <div className="flex items-center gap-2 border-b border-hairline bg-surface px-4 py-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            className="text-muted"
            onClick={() => { setPersonFilter(""); setSearch(""); setPeopleEntry(true); }}
          >
            <ChevronLeft size={14} /> Kişiler
          </Button>
          {selectedPerson ? (
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={`h-5 w-1.5 shrink-0 rounded-full ${personTones[selectedPerson.id]?.bar ?? "bg-brand"}`}
              />
              <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
                {getPersonDisplayName(selectedPerson.name)}
              </span>
              {/* Tek sayfa rapor — Aslı Hanım (2026-08-19): "Tek sayfalık, kişi
                  bazlı… sadece bir sayfada kendisiyle ilgili detayları okusun."
                  Yalnız sistem kullanıcısı olan kişide anlamlı (CRM kişisinin
                  görevi/toplantısı olmaz). */}
              {selectedPerson.filterKey.startsWith("member:") && (
                <Link
                  href={`/reports/${selectedPerson.id}`}
                  className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-muted shadow-xs transition-[background-color,border-color,color] duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink"
                  title="Bu kişinin tek sayfalık özeti — yazdırılabilir"
                >
                  <FileText size={13} /> Tek sayfa özet
                </Link>
              )}
            </span>
          ) : (
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink">Tüm işler</span>
          )}
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {!peopleEntry && (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-surface shrink-0 flex-wrap">
        {/* Left: action buttons (hidden for viewer) */}
        {/* Ekranın TEK primary düğmesi. */}
        {canCreate && (
          <Button size="sm" onClick={() => { setModalDefaultStatus("ready"); setModalOpen(true); }}>
            <Plus size={14} />
            Görev oluştur
          </Button>
        )}
        {/* CSV içe aktar — geri bildirimle şimdilik gizlendi (kod/action korunur). */}
        {CSV_IMPORT_ENABLED && canComplete && !isAdminBoard && (
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={14} />
            CSV&apos;den içe aktar
          </Button>
        )}

        {/* Right: Departman + Kişi + Arama */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">

          {/* Departman filtresi — gizli (DEPARTMENT_FILTER_ENABLED). */}
          {DEPARTMENT_FILTER_ENABLED && (
          <SelectInput
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={cn("h-8 w-auto text-[13px]", departmentFilter ? "border-brand-ring text-brand" : "text-muted")}
            aria-label="Departmana göre filtrele"
          >
            <option value="">Departman</option>
            {deptFilterOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectInput>
          )}

          {/* Person filter. Manager board lists ONLY owner/admin people and
              filters by canonical responsibility; the normal board keeps the
              member/contact assignee filter. */}
          {/* Kişi seçimi araç çubuğunda DEĞİL — panonun kapısı kişi ızgarası,
              geri dönüş yolu da soldaki "Kişiler" düğmesi. Aynı işi yapan
              ikinci bir açılır liste araç çubuğunu kalabalıklaştırıyordu.
              Yönetici panosunda yönetici seçici kalıyor: orada giriş ızgarası
              yok. */}
          {isAdminBoard && (
            <SelectInput
              value={adminManager}
              onChange={(e) => { setAdminManager(e.target.value); syncAdminUrl(adminVisibility, e.target.value); }}
              className={cn("h-8 w-auto text-[13px]", adminManager !== "all" ? "border-brand-ring text-brand" : "text-muted")}
              aria-label="Yöneticiye göre filtrele"
            >
              <option value="all">Tüm yöneticiler</option>
              {(adminBoard?.managers ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>{getPersonDisplayName(m.name)}</option>
              ))}
            </SelectInput>
          )}

          {/* Search */}
          {/* Arama: ortak TextInput (araç çubuğu boyu h-8). Odaklanınca genişler. */}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
            <TextInput
              type="search"
              placeholder="Ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "h-8 w-44 pl-8 text-[13px] transition-[width,border-color,box-shadow,background-color] duration-200 ease-standard focus:w-64",
                search && "border-brand-ring",
              )}
              aria-label="Görev ara"
            />
          </div>

          {/* "Temizle" yalnız uygulanmış bir filtre varken. */}
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDepartmentFilter(""); setSearch("");
                if (isAdminBoard) { setAdminManager("all"); syncAdminUrl(adminVisibility, "all"); }
              }}
              aria-label="Filtreleri temizle"
            >
              <X size={13} /> Temizle
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Kişi yük özeti şeridi ("N bu hafta tamamlandı · N devam ediyor ·
          N bekliyor · ⚠ N gecikmiş") KALDIRILDI — Aslı Hanım, 2026-08-24:
          "tamamlandı, tamamlanmadı, eksik kaldı, geç kaldı, sıfır, bir bir…
           Öyle bir şey istemiyoruz ki. İsmi, işi, tarihi bu kadar."
          Kimin sayfasında olduğumuzu bir üstteki seçili-kişi şeridi zaten
          söylüyor; sayılar işin kendisinin önüne geçiyordu. */}

      {/* ── Pre-mount: static (no DnD) — desktop/tablet only ─────────────── */}
      {!peopleEntry && !mounted && (
        <div className="hidden md:block overflow-auto flex-1 min-h-0">
          <div className="relative min-w-max">
            {/* Continuous sticky band behind every column header (no gaps/peek). */}
            <div aria-hidden className="sticky top-0 z-10 h-11 border-b border-line bg-app" />
            <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 pb-4 items-start -mt-11">
              {/* Not sütunu Yönetici Panoda da çizilir: pano dili her iki yüzeyde
                  aynı olmalı ve yönetici notları/akışı burada da lazım. Sütunun
                  kendi izin davranışı (readOnly / isAdmin) değişmez. */}
              <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} currentUserId={userId} isAdmin={canComplete} feed={feedNode} feedLabel={feedLabel} onMutated={afterMutation} />
              {BOARD_COLUMNS.map((col) => (
                <StaticKanbanColumn
                  key={col.id}
                  colDef={col}
                  tasks={tasksByCol[col.id] ?? []}
                  profiles={profiles}
                  contacts={pickerContacts}
                  responsibleNames={responsibleNames}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Post-mount: full DnD board ───────────────────────────────────── */}
      {!peopleEntry && mounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="hidden md:block overflow-auto flex-1 min-h-0">
            <div className="relative min-w-max">
              {/* Continuous sticky band behind every column header (no gaps/peek). */}
              <div aria-hidden className="sticky top-0 z-10 h-11 border-b border-line bg-app" />
              <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 pb-4 items-start -mt-11">
                <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} currentUserId={userId} isAdmin={canComplete} feed={feedNode} feedLabel={feedLabel} onMutated={afterMutation} />
                {BOARD_COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    colDef={col}
                    tasks={tasksByCol[col.id] ?? []}
                    profiles={profiles}
                    contacts={pickerContacts}
                    responsibleNames={responsibleNames}
                    onAddTask={handleAddTask}
                    onDelete={handleDeleteCard}
                    onArchive={handleArchiveCard}
                    onDuplicate={handleDuplicateCard}
                    canArchiveCard={canArchive}
                    canDeleteCard={canDelete}
                    showMenu={!isViewer}
                    disableDrag={isViewer}
                    lockDoneDrag={!canComplete}
                  />
                ))}
              </div>
            </div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCard
                task={activeTask}
                isDragOverlay
                profiles={profiles}
                contacts={pickerContacts}
                responsibleNames={responsibleNames}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Mobile board: segmented status control + single full-width column ── */}
      {!peopleEntry && (
      <div className="md:hidden flex flex-col">
        {/* Segmented status tabs — the one sticky element on mobile (compact, single
            row, horizontal scroll with the scrollbar hidden). */}
        <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-hairline bg-surface px-3 py-2 no-scrollbar">
          {(isAdminBoard ? MOBILE_SEGMENTS.filter((s) => s.id !== "notes") : MOBILE_SEGMENTS).map((seg) => {
            const count = seg.id === "notes" ? notes.length : (tasksByCol[seg.id as BoardColId]?.length ?? 0);
            const active = mobileSeg === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => setMobileSeg(seg.id)}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap border transition-colors duration-150 shrink-0",
                  active
                    ? "bg-brand text-white border-brand shadow-xs"
                    : "bg-surface text-muted border-line active:bg-surface-muted",
                )}
                aria-pressed={active}
              >
                {seg.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[12px] leading-none font-semibold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-surface-sunken text-muted",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Single column content — flows into the page scroll (no inner scroll) */}
        <div className="px-3 py-3">
          {!isAdminBoard && mobileSeg === "notes" ? (
            <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} currentUserId={userId} isAdmin={canComplete} mobile feed={feedNode} feedLabel={feedLabel} onMutated={afterMutation} />
          ) : (
            (() => {
              const colTasks = tasksByCol[mobileSeg as BoardColId] ?? [];
              if (colTasks.length === 0) {
                return (
                  <EmptyState
                    key={mobileSeg}
                    compact
                    className="anim-fade"
                    title="Görev yok"
                    /* Yeni görev, BULUNULAN sekmenin durumunda açılır. Eskiden
                       her sekmeden "Yapılacak" olarak oluşuyordu: "Kontrol"
                       sekmesinde görev oluşturan kişi listenin yine boş
                       kaldığını görüyordu. */
                    action={canCreate ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const col = BOARD_COLUMNS.find((c) => c.id === mobileSeg);
                          setModalDefaultStatus(col?.targetStatus ?? "ready");
                          setModalOpen(true);
                        }}
                      >
                        <Plus size={14} /> Görev oluştur
                      </Button>
                    ) : undefined}
                  />
                );
              }
              return (
                <div key={mobileSeg} className="flex flex-col gap-2.5 anim-fade">
                  {colTasks.map((task) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      profiles={profiles}
                      contacts={pickerContacts}
                      responsibleNames={responsibleNames}
                      onDelete={handleDeleteCard}
                      onArchive={handleArchiveCard}
                      onDuplicate={handleDuplicateCard}
                      canArchiveCard={canArchive}
                      canDeleteCard={canDelete}
                      showMenu={!isViewer}
                    />
                  ))}
                </div>
              );
            })()
          )}
        </div>
      </div>
      )}

      {/* ── Toast overlay ─────────────────────────────────────────────────── */}
      {/* Telefonda alt gezinmenin ÜSTÜNDE durur (4.5rem + güvenli alan). */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[100] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-4 md:right-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto anim-slide-up flex max-w-sm items-center gap-3 rounded-card bg-ink px-4 py-2.5 text-sm text-white shadow-drawer"
            >
              <span className="flex-1">{t.msg}</span>
              {t.action && (
                <Link
                  href={t.action.href}
                  onClick={() => dismissToast(t.id)}
                  className="shrink-0 font-medium text-brand-ring underline underline-offset-2 transition-colors duration-150 hover:text-white"
                >
                  {t.action.label}
                </Link>
              )}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="tap-target shrink-0 rounded-md text-white/60 transition-colors duration-150 hover:text-white"
                aria-label="Kapat"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <CreateTaskModal
          key={`${modalDefaultStatus}-${adminVisibility}-${adminManager}`}
          onClose={() => setModalOpen(false)}
          workspaceId={workspaceId}
          defaultStatus={modalDefaultStatus}
          profiles={profiles}
          contacts={pickerContacts}
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          isAdmin={canComplete}
          defaultVisibility={isAdminBoard ? adminVisibility : undefined}
          lockResponsibleToAdmins={isAdminBoard}
          defaultResponsibleIds={adminCreateResponsibleIds}
        />
      )}
      {importOpen && (
        <CsvImportModal onClose={() => setImportOpen(false)} />
      )}
    </div>
    </BoardContext.Provider>
    </NoteSignalsContext.Provider>
    </ParticipantsContext.Provider>
    </PersonColorContext.Provider>
    </DeptMetaContext.Provider>
  );
}
