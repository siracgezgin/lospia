"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GripVertical, Plus, FileSpreadsheet, Search, X, Check,
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
  getTaskCardStyle,
  getDepartmentCardStyle,
  getTaskStateMarkers,
  PRIORITY_CHIP,
  PRIORITY_SHOW_ON_BOARD,
  STATUS_CHIP_TONE,
  BOARD_COL_HEADER_TONE,
} from "@/lib/design/semantics";
import { Badge } from "@/components/ui/Badge";
import { reorderTask, updateTask, softDeleteTask, archiveTask, duplicateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { buildDeptMeta, type DeptMeta } from "@/lib/utils/departments";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";
import { NotesColumn } from "@/components/board/NotesColumn";
import { BoardRulesPanel } from "@/components/board/BoardRulesPanel";
import { canCreateTask, canDeleteTask, canArchiveTask, canCompleteTask } from "@/lib/auth/permissions";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole, WorkspaceDepartment } from "@/types";
import type { BoardRule, BoardMember } from "@/app/(app)/board/page";
import type { TaskParticipant } from "@/types";

// Department metadata (id → {name, color}) shared with all card renderers.
const DeptMetaContext = createContext<Record<string, DeptMeta>>({});
function useTaskDept(task: Task): DeptMeta | undefined {
  const meta = useContext(DeptMetaContext);
  return task.department_id ? meta[task.department_id] : undefined;
}

// Participant completions (taskId → [{name, completed}]) for card chips.
const ParticipantsContext = createContext<Record<string, TaskParticipant[]>>({});
function useTaskParticipants(taskId: string): TaskParticipant[] {
  return useContext(ParticipantsContext)[taskId] ?? [];
}

// Board-wide permission + toast surface, so deep card components can enforce the
// same rules used by drag/drop and report blocks with a clear toast.
type BoardCtxValue = {
  canComplete: boolean;                       // owner/admin may finalize Tamamlandı
  isResponsible: (task: Task) => boolean;     // admin → always; member → own/participant
  showToast: (msg: string) => void;
  taskHrefSuffix: string;                     // appended to /tasks/{id} (e.g. ?from=admin-board)
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

/** Clickable status chip with a small dropdown — an alternative to drag/drop.
 *  Enforces the same permissions: non-responsible members get a static chip;
 *  members can't pick Tamamlandı. */
function CardStatusChip({ task }: { task: Task }) {
  const ctx = useContext(BoardContext);
  const [open, setOpen] = useState(false);
  const [optStatus, setOptStatus] = useOptimistic<TaskStatus>(task.status);
  const [, startT] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const tone = STATUS_CHIP_TONE[optStatus] ?? "bg-gray-100 text-gray-600";
  const chipCls = cn("text-[10px] rounded px-1.5 py-0.5 leading-none font-medium", tone);
  const canDone = ctx?.canComplete ?? false;
  // A done task is locked for non-admins — they can neither change nor reopen it.
  const doneLocked = optStatus === "done" && !canDone;
  const canChange = (ctx?.isResponsible(task) ?? false) && !doneLocked;

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
      if (res && "error" in res) ctx!.showToast(res.error || "Durum değiştirilemedi.");
    });
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(chipCls, "inline-flex items-center gap-0.5 hover:brightness-95 transition")}
        title="Durumu değiştir"
      >
        {STATUS_LABELS[optStatus]}
        <ChevronDown size={9} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {CARD_STATUS_CHOICES.map((o) => {
            const disabled = o.value === "done" && !canDone;
            const active = o.value === optStatus;
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => choose(o.value)}
                className={cn(
                  "w-full text-left px-2.5 py-1 text-[11px] flex items-center gap-1.5 hover:bg-gray-50",
                  active && "font-semibold text-blue-700",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
                )}
                title={disabled ? "Yalnızca yöneticiler tamamlayabilir" : undefined}
              >
                {o.label}
                {active && <Check size={10} className="ml-auto" />}
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
        <span key={p.memberId} className="relative" title={`${p.name}${p.completed ? " — tamamladı" : " — bekleniyor"}`}>
          <Avatar name={p.name} size="xs" className={cn("ring-1 ring-white", p.completed && "ring-2 ring-green-500")} />
          {p.completed && (
            <Check size={8} className="absolute -bottom-0.5 -right-0.5 text-green-600 bg-white rounded-full" strokeWidth={3} />
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[8px] font-semibold ring-1 ring-white">
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

function weekEnd(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isInWeek(ts: string | null, monday: Date): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  return d >= monday && d <= weekEnd(monday);
}

function applyViewFilter(tasks: Task[], slug: string, userId: string, monday: Date): Task[] {
  const today = localISO(new Date());
  const mondayStr = localISO(monday);
  const sundayStr = (() => { const d = new Date(monday); d.setDate(d.getDate() + 6); return localISO(d); })();

  // A task belongs to the week if its due date OR its entry/start date falls in
  // the week. New tasks default start_date to today, so they always appear in
  // the current week even before a due date is chosen.
  const inRange = (d: string | null) => d !== null && d >= mondayStr && d <= sundayStr;
  const inWeekByDate = (t: Task) => inRange(t.due_date) || inRange(t.start_date);

  const notArchived = (t: Task) =>
    !t.archived_at && !t.deleted_at && t.status !== "archived";

  switch (slug) {
    case "all": // Tüm işler — ALL active tasks, not scoped to the selected week
      return tasks.filter((t) => notArchived(t));

    case "_week_scoped_all_DEPRECATED":
      return tasks.filter((t) => {
        if (!notArchived(t)) return false;
        // A done task belongs to the week if it was DUE that week or COMPLETED
        // that week — so completing a task due this week keeps it on this board.
        if (t.status === "done") return inWeekByDate(t) || isInWeek(t.completed_at, monday);
        return inWeekByDate(t); // tasks without due_date are not shown in weekly board
      });

    case "mine": // Bana atananlar — assigned to me in selected week
      return tasks.filter((t) => {
        if (!notArchived(t)) return false;
        if (t.assignee_id !== userId) return false;
        // A done task belongs to the week if it was DUE that week or COMPLETED
        // that week — so completing a task due this week keeps it on this board.
        if (t.status === "done") return inWeekByDate(t) || isInWeek(t.completed_at, monday);
        return inWeekByDate(t);
      });

    case "this-week": // Bu hafta — same scope as "all" (tab navigates to current week)
      return tasks.filter((t) => {
        if (!notArchived(t)) return false;
        // A done task belongs to the week if it was DUE that week or COMPLETED
        // that week — so completing a task due this week keeps it on this board.
        if (t.status === "done") return inWeekByDate(t) || isInWeek(t.completed_at, monday);
        return inWeekByDate(t);
      });

    case "overdue": // Gecikenler — overdue regardless of selected week
      return tasks.filter((t) =>
        notArchived(t) &&
        t.status !== "done" &&
        t.due_date !== null && t.due_date < today,
      );

    case "done": // Tamamlananlar — completed in selected week
      return tasks.filter((t) =>
        t.status === "done" &&
        (t.completed_at
          ? isInWeek(t.completed_at, monday)
          : inWeekByDate(t)),
      );

    case "waiting-approval": // Onay bekleyenler
      return tasks.filter((t) => {
        if (!notArchived(t) || t.status === "done") return false;
        const isWaiting =
          t.status === "review" ||
          t.approval_required === true ||
          t.waiting_on_member_id != null ||
          t.waiting_on_contact_id != null;
        if (!isWaiting) return false;
        // Week-scope if has due_date; otherwise include (urgent to resolve)
        if (t.due_date) return inWeekByDate(t);
        return true;
      });

    default: // fallback = same as "all"
      return tasks.filter((t) => {
        if (!notArchived(t)) return false;
        // A done task belongs to the week if it was DUE that week or COMPLETED
        // that week — so completing a task due this week keeps it on this board.
        if (t.status === "done") return inWeekByDate(t) || isInWeek(t.completed_at, monday);
        return inWeekByDate(t);
      });
  }
}

function applyPersonFilter(tasks: Task[], personFilter: string): Task[] {
  if (!personFilter) return tasks;
  if (personFilter.startsWith("member:")) {
    const id = personFilter.slice(7);
    return tasks.filter((t) => {
      if (t.assignee_id === id) return true;
      const collabs = (t.custom_fields as Record<string, unknown>)?.collaborators;
      return Array.isArray(collabs) && collabs.includes(id);
    });
  }
  if (personFilter.startsWith("contact:")) {
    const id = personFilter.slice(8);
    return tasks.filter((t) => {
      if (t.responsible_contact_id === id) return true;
      const collabs = (t.custom_fields as Record<string, unknown>)?.collaborators;
      return Array.isArray(collabs) && collabs.includes(id);
    });
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
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
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

// ── Card 3-dot menu ───────────────────────────────────────────────────────────

function CardMenu({
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  canArchive = true,
  canDelete = true,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  canArchive?: boolean;
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { setOpen((o) => !o); setConfirming(false); }}
        className="p-0.5 rounded text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Görev seçenekleri"
        tabIndex={-1}
      >
        <MoreVertical size={12} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Pencil size={11} /> Düzenle
          </button>
          <button
            onClick={() => { setOpen(false); onDuplicate(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Copy size={11} /> Çoğalt
          </button>
          {canArchive && (
            <button
              onClick={() => { setOpen(false); onArchive(); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Archive size={11} /> Arşivle
            </button>
          )}
          {canDelete && <div className="my-1 border-t border-gray-100" />}
          {canDelete && confirming ? (
            <div className="px-2 py-1.5">
              <p className="text-[10px] text-red-600 mb-1.5 leading-snug">Çöp kutusuna taşınsın mı?</p>
              <div className="flex gap-1">
                <button
                  onClick={() => { setOpen(false); setConfirming(false); onDelete(); }}
                  className="flex-1 text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5 hover:bg-red-700"
                >
                  Evet
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 hover:bg-gray-200"
                >
                  İptal
                </button>
              </div>
            </div>
          ) : canDelete ? (
            <button
              onClick={() => setConfirming(true)}
              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5"
            >
              <Trash2 size={11} /> Sil
            </button>
          ) : null}
        </div>
      )}
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
  const [_p, startTransition] = useTransition();
  const [encoded, setEncoded] = useOptimistic<string>(encodeResponsible(task));

  const currentName = encoded.startsWith("member:")
    ? responsibleNames[encoded.slice(7)] ?? "—"
    : encoded.startsWith("contact:")
    ? responsibleNames[encoded.slice(8)] ?? "—"
    : null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    startTransition(async () => {
      setEncoded(val);
      const assignee_id = val.startsWith("member:") ? val.slice(7) : null;
      const responsible_contact_id = val.startsWith("contact:") ? val.slice(8) : null;
      await updateTask({ id: task.id, assignee_id, responsible_contact_id });
    });
  }

  return (
    <div className="relative inline-flex items-center gap-1 ml-auto shrink-0">
      {currentName ? (
        // Initials only; full name via Avatar title tooltip
        <Avatar name={currentName} size="xs" />
      ) : (
        <span className="text-[10px] text-gray-300 pointer-events-none">—</span>
      )}
      <select
        value={encoded}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer w-full text-[10px]"
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
}) {
  // Department drives the card identity chip (even on a done card).
  const dept = useTaskDept(task);
  const deptStyle = getDepartmentCardStyle(dept?.color);
  // Detail link keeps the originating board's context (so "← geri" returns here).
  const hrefSuffix = useContext(BoardContext)?.taskHrefSuffix ?? "";
  const taskHref = `/tasks/${task.id}${hrefSuffix}`;
  // Active member participants (with per-person completion) drive the people chips.
  const participants = useTaskParticipants(task.id);
  const responsibleName =
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[task.responsible_contact_id ?? ""];

  const waitingOnName =
    responsibleNames[task.waiting_on_member_id ?? ""] ??
    responsibleNames[task.waiting_on_contact_id ?? ""] ??
    null;

  // State is an OVERLAY only: a chip + due-date color. Never the card color.
  const markers = getTaskStateMarkers(task);
  const showPriority = PRIORITY_SHOW_ON_BOARD[task.priority];

  return (
    <div className="flex-1 min-w-0">
      {/* Top row: department chip (identity) + state chip (overlay) + menu */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {dept && (
            <Badge size="xs" dot={deptStyle.dot} className={cn("max-w-36 truncate", deptStyle.chip)}>
              {dept.name}
            </Badge>
          )}
          {markers.chip && (
            <Badge size="xs" className={cn("max-w-32 truncate", markers.chip.className)}>
              {markers.chip.label === "Bekliyor" && waitingOnName ? `Bekliyor · ${waitingOnName}` : markers.chip.label}
            </Badge>
          )}
          {/* Priority lives up here (secondary) so the bottom row stays for people */}
          {showPriority && (
            <Badge size="xs" className={cn("shrink-0", PRIORITY_CHIP[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          )}
          {/* Admin_only marker. Members never receive these tasks, so this chip
              is, by construction, only ever visible to owner/admin. */}
          {(task as unknown as { visibility?: string }).visibility === "admin_only" && (
            <Badge size="xs" className="shrink-0 bg-amber-50 text-amber-700 border border-amber-200">
              <Lock size={9} className="mr-0.5" /> {ADMIN_ONLY_CHIP_LABEL}
            </Badge>
          )}
        </div>
        {interactive && showMenu && onDelete && onArchive && onDuplicate && (
          <CardMenu
            onEdit={() => { window.location.href = taskHref; }}
            onDuplicate={() => onDuplicate(task.id)}
            onArchive={() => onArchive(task.id)}
            onDelete={() => onDelete(task.id)}
            canArchive={canArchiveCard}
            canDelete={canDeleteCard}
          />
        )}
      </div>

      {/* Title */}
      <Link
        prefetch={false}
        href={taskHref}
        className={cn(
          "text-[13px] font-medium line-clamp-2 block leading-snug tracking-[-0.005em]",
          markers.shouldStrike
            ? "text-success/90 line-through decoration-success/40"
            : "text-ink hover:text-brand",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      {/* Description (one line) */}
      {task.description && (
        <p className="text-[11px] text-subtle mt-1 line-clamp-1 leading-snug">
          {task.description}
        </p>
      )}

      {/* Bottom row: status (clickable) + due + people chips (bottom-right) */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {/* Status chip — clickable dropdown for users who don't drag */}
        {interactive ? (
          <CardStatusChip task={task} />
        ) : (
          <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none font-medium", STATUS_CHIP_TONE[task.status] ?? "bg-gray-100 text-gray-600")}>
            {STATUS_LABELS[task.status]}
          </span>
        )}

        {task.due_date && (
          <span className={cn("text-[10px] flex items-center gap-0.5", markers.dueDateClass)}>
            {markers.overdue && <AlertTriangle size={9} />}
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
          <Avatar name={responsibleName} size="xs" className="shrink-0 ml-auto" />
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
  const dept = useTaskDept(task);
  const style = getTaskCardStyle(task.status, dept?.color);
  const cardCls = `rounded-lg border border-l-[3px] p-3 shadow-card transition-all ${style.surface} ${style.border} ${style.accent}`;
  return (
    <div className={cardCls}>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 p-0.5 shrink-0 text-gray-200"><GripVertical size={13} /></span>
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
  // Department drives the card color; done overrides to the reserved green. No cn() — tailwind-merge strips border-l-*.
  const dept = useTaskDept(task);
  const style = getTaskCardStyle(task.status, dept?.color);
  const colorCls = `${style.surface} ${style.border} ${style.accent}`;
  const stateCls = [
    isDragging ? "opacity-40" : "",
    isDragOverlay ? "shadow-pop rotate-1" : "hover:shadow-pop transition-shadow",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-l-[3px] p-3 shadow-card group ${colorCls} ${stateCls}`}
    >
      <div className="flex items-start gap-1.5">
        {!disableDrag ? (
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            aria-label="Sürükle"
            tabIndex={-1}
          >
            <GripVertical size={13} />
          </button>
        ) : (
          <span className="mt-0.5 p-0.5 shrink-0 text-transparent"><GripVertical size={13} /></span>
        )}
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
  const dept = useTaskDept(task);
  const style = getTaskCardStyle(task.status, dept?.color);
  const colorCls = `${style.surface} ${style.border} ${style.accent}`;
  return (
    <div className={`rounded-xl border border-l-[3px] p-3.5 shadow-card ${colorCls}`}>
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
  const headerTone = BOARD_COL_HEADER_TONE[colDef.id] ?? "text-gray-500";

  return (
    <div className="flex flex-col gap-2 w-[80vw] max-w-72 sm:w-72 shrink-0">
      <div className="sticky top-0 z-20 h-11 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn("text-xs font-bold uppercase tracking-wider truncate", headerTone)}>
            {colDef.label}
          </h3>
          <span className="text-[10px] font-semibold text-gray-500 bg-gray-200/70 rounded-full px-1.5 py-0.5 leading-none shrink-0">
            {tasks.length}
          </span>
        </div>
        {!disableDrag && (
          <button
            onClick={() => onAddTask(colDef.id)}
            className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors shrink-0"
            aria-label={`${colDef.label} sütununa görev ekle`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2 rounded-lg p-1 min-h-20 transition-colors",
            tasks.length === 0 && "border-2 border-dashed border-gray-100",
            isOver && "bg-blue-50/50 border-blue-200",
          )}
          data-col={colDef.id}
        >
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
  const headerTone = BOARD_COL_HEADER_TONE[colDef.id] ?? "text-gray-500";
  return (
    <div className="flex flex-col gap-2 w-[80vw] max-w-72 sm:w-72 shrink-0">
      <div className="sticky top-0 z-20 h-11 flex items-center gap-2">
        <h3 className={cn("text-xs font-bold uppercase tracking-wider truncate", headerTone)}>
          {colDef.label}
        </h3>
        <span className="text-[10px] font-semibold text-gray-500 bg-gray-200/70 rounded-full px-1.5 py-0.5 leading-none shrink-0">{tasks.length}</span>
      </div>
      <div className={cn("flex flex-col gap-2 rounded-lg p-1 min-h-20", tasks.length === 0 && "border-2 border-dashed border-gray-100")}>
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
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [_isPending, startTransition] = useTransition();
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
  const currentMonday = getMondayOf(new Date());
  const isCurrentWeek = weekStart.toDateString() === currentMonday.toDateString();

  // Derive the week ISO string for URL building (always the Monday)
  const weekParam = localISO(weekStart);


  // Toast notifications (optionally with an action link, e.g. "open in Tüm işler")
  type Toast = { id: string; msg: string; action?: { label: string; href: string } };
  const [toasts, setToasts] = useState<Toast[]>([]);
  function showToast(msg: string, action?: Toast["action"]) {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, msg, action }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), action ? 7000 : 3000);
  }
  function dismissToast(id: string) {
    setToasts((p) => p.filter((t) => t.id !== id));
  }

  // Effective slug: null or missing → treat as "all"
  const effectiveSlug = viewSlug ?? "all";

  const responsibleNames = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => { map[p.id] = p.full_name ?? p.email ?? "?"; });
    contacts.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [profiles, contacts]);

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

  function handleDeleteCard(id: string) {
    startTransition(async () => {
      setOptimisticTasks({ type: "remove", id });
      await softDeleteTask(id);
      showToast("Görev çöp kutusuna taşındı.");
    });
  }

  function handleArchiveCard(id: string) {
    startTransition(async () => {
      setOptimisticTasks({ type: "remove", id });
      await archiveTask(id);
      showToast("Görev arşivlendi.");
    });
  }

  function handleDuplicateCard(id: string) {
    startTransition(async () => {
      await duplicateTask(id);
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
    }
    if (departmentFilter) {
      const allowed = deptMatchIds[departmentFilter] ?? new Set([departmentFilter]);
      tasks = tasks.filter((t) => t.department_id != null && allowed.has(t.department_id));
    }
    if (!adminBoard) tasks = applyPersonFilter(tasks, personFilter);
    tasks = tasks.filter((t) => matchesSearch(t, search, responsibleNames));
    return tasks;
  }, [adminBoard, adminVisibility, adminManager, managerUserIdSet, optimisticTasks, effectiveSlug, userId, weekStart, departmentFilter, deptMatchIds, personFilter, search, responsibleNames]);

  // Distribute filtered tasks into columns
  const tasksByCol = useMemo(() => {
    return BOARD_COLUMNS.reduce<Record<BoardColId, Task[]>>((acc, col) => {
      acc[col.id] = filteredTasks
        .filter((t) => (col.statuses as TaskStatus[]).includes(t.status))
        .sort((a, b) => (a.fractional_index ?? "").localeCompare(b.fractional_index ?? ""));
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
      }
    });
  }, [optimisticTasks, tasksByCol]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilter = (isAdminBoard ? adminManager !== "all" : !!personFilter) || !!search || !!departmentFilter;

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

  // Person workload summary (computed from raw tasks, not view-filtered). Not
  // shown on the manager board (its person filter lists managers, not members).
  const personStats = useMemo(() => {
    if (isAdminBoard || !personFilter) return null;
    const today = localISO(new Date());
    const thisMonday = getMondayOf(new Date());
    const personName = personFilter.startsWith("member:")
      ? responsibleNames[personFilter.slice(7)] ?? ""
      : personFilter.startsWith("contact:")
      ? responsibleNames[personFilter.slice(8)] ?? ""
      : "";
    const personTasks = applyPersonFilter(optimisticTasks, personFilter);
    return {
      name: personName,
      completedThisWeek: personTasks.filter((t) => t.status === "done" && isInWeek(t.completed_at, thisMonday)).length,
      inProgress: personTasks.filter((t) => ["in_progress", "review"].includes(t.status)).length,
      waiting: personTasks.filter((t) => t.status === "blocked" || t.waiting_on_member_id != null || t.waiting_on_contact_id != null).length,
      overdue: personTasks.filter((t) => t.due_date != null && t.due_date < today && t.status !== "done").length,
    };
  }, [isAdminBoard, personFilter, optimisticTasks, responsibleNames]);

  const boardCtx = useMemo<BoardCtxValue>(
    () => ({ canComplete, isResponsible, showToast, taskHrefSuffix }),
    [canComplete, isResponsible, taskHrefSuffix], // eslint-disable-line react-hooks/exhaustive-deps -- showToast uses stable setToasts
  );

  return (
    <DeptMetaContext.Provider value={deptMeta}>
    <ParticipantsContext.Provider value={participantsByTask}>
    <BoardContext.Provider value={boardCtx}>
    {/* Desktop: fixed-height shell with internal column scroll. Mobile (max-md):
        natural height so the rules/week/tabs/filters chrome scrolls away with the
        page and only the compact status tabs stay sticky. */}
    <div className="flex flex-col h-full max-md:h-auto max-md:min-h-full">

      {/* ── Manager board header: visibility tabs (Yönetici Pano only) ─────── */}
      {isAdminBoard && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 bg-white border-b border-gray-100 shrink-0 flex-wrap">
          <ShieldCheck size={16} className="text-[#2f5d6b] shrink-0" />
          <span className="text-sm font-semibold text-gray-800 mr-1">Yönetici Pano</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {(["admin_only", "workspace"] as TaskVisibility[]).map((v) => {
              const on = adminVisibility === v;
              return (
                <button
                  key={v}
                  onClick={() => { setAdminVisibility(v); syncAdminUrl(v, adminManager); }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    on ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
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
      {!isAdminBoard && <BoardRulesPanel rules={rules} newCount={newRulesCount} />}

      {/* ── Week selector — normal board only ─────────────────────────────── */}
      {!isAdminBoard && (
      <div className="flex items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-100 shrink-0">
        <button
          onClick={() => {
            const n = new Date(weekStart);
            n.setDate(n.getDate() - 7);
            const monday = getMondayOf(n);
            setWeekStart(monday);
            router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
          }}
          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          aria-label="Önceki hafta"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-32 text-center select-none">
          {formatWeekLabel(weekStart)}
        </span>
        <button
          onClick={() => {
            const n = new Date(weekStart);
            n.setDate(n.getDate() + 7);
            const monday = getMondayOf(n);
            setWeekStart(monday);
            router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
          }}
          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          aria-label="Sonraki hafta"
        >
          <ChevronRight size={14} />
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => {
              const monday = getMondayOf(new Date());
              setWeekStart(monday);
              router.push(`/board?view=${effectiveSlug}&week=${localISO(monday)}`);
            }}
            className="ml-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            Bu hafta
          </button>
        )}
        {isCurrentWeek && (
          <span className="ml-1 text-xs text-gray-400 select-none">Bu hafta</span>
        )}
      </div>
      )}

      {/* ── Saved-view tab strip — normal board only ──────────────────────── */}
      {!isAdminBoard && savedViews.length > 0 && (
        <div className="flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto no-scrollbar shrink-0">
          {savedViews.map((view) => {
            const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
            const isActive = effectiveSlug === slug;
            // "Bu hafta" tab always snaps week back to current week
            const tabWeek = slug === "this-week"
              ? localISO(currentMonday)
              : weekParam;
            return (
              <a
                key={view.id}
                href={`/board?view=${slug}&week=${tabWeek}`}
                className={cn(
                  "px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700",
                )}
              >
                {view.name}
              </a>
            );
          })}
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white shrink-0 flex-wrap">
        {/* Left: action buttons (hidden for viewer) */}
        {canCreate && (
          <button
            onClick={() => { setModalDefaultStatus("ready"); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Görev oluştur
          </button>
        )}
        {canCreate && !isAdminBoard && (
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet size={14} />
            Excel&apos;den içe aktar
          </button>
        )}

        {/* Right: Departman + Kişi + Arama */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">

          {/* Departman filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={cn(
              "text-sm border rounded-lg px-2 py-1.5 bg-white transition-colors cursor-pointer",
              departmentFilter ? "border-[#406775] text-[#406775]" : "border-gray-200 text-gray-600",
            )}
            aria-label="Departmana göre filtrele"
          >
            <option value="">Departman</option>
            {deptFilterOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Person filter. Manager board lists ONLY owner/admin people and
              filters by canonical responsibility; the normal board keeps the
              member/contact assignee filter. */}
          {isAdminBoard ? (
            <select
              value={adminManager}
              onChange={(e) => { setAdminManager(e.target.value); syncAdminUrl(adminVisibility, e.target.value); }}
              className={cn(
                "text-sm border rounded-lg px-2 py-1.5 bg-white transition-colors cursor-pointer",
                adminManager !== "all" ? "border-blue-400 text-blue-700" : "border-gray-200 text-gray-600",
              )}
              aria-label="Yöneticiye göre filtrele"
            >
              <option value="all">Tüm yöneticiler</option>
              {(adminBoard?.managers ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>{getPersonDisplayName(m.name)}</option>
              ))}
            </select>
          ) : (
            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              className={cn(
                "text-sm border rounded-lg px-2 py-1.5 bg-white transition-colors cursor-pointer",
                personFilter ? "border-blue-400 text-blue-700" : "border-gray-200 text-gray-600",
              )}
              aria-label="Kişiye göre filtrele"
            >
              <option value="">Kişi</option>
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
          )}

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "text-sm border rounded-lg pl-7 pr-3 py-1.5 bg-white w-40 focus:outline-none focus:ring-1 transition-colors",
                search ? "border-blue-400 text-blue-700 focus:ring-blue-400" : "border-gray-200 text-gray-700 focus:ring-blue-300",
              )}
              aria-label="Görev ara"
            />
          </div>

          {/* Clear all */}
          {hasActiveFilter && (
            <button
              onClick={() => {
                setPersonFilter(""); setDepartmentFilter(""); setSearch("");
                if (isAdminBoard) { setAdminManager("all"); syncAdminUrl(adminVisibility, "all"); }
              }}
              className="text-xs text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors whitespace-nowrap"
              aria-label="Filtreleri temizle"
            >
              ✕ Temizle
            </button>
          )}
        </div>
      </div>

      {/* ── Person workload summary strip ───────────────────────────────── */}
      {personStats && (
        <div className="flex items-center gap-4 px-4 py-2 bg-blue-50/50 border-b border-blue-100 text-xs shrink-0 flex-wrap">
          <span className="font-semibold text-blue-800">{personStats.name}</span>
          <span className="text-gray-500">
            <span className="font-medium text-green-600">{personStats.completedThisWeek}</span> bu hafta tamamlandı
          </span>
          <span className="text-gray-500">
            <span className="font-medium text-blue-600">{personStats.inProgress}</span> devam ediyor
          </span>
          {personStats.waiting > 0 && (
            <span className="text-gray-500">
              <span className="font-medium text-orange-600">{personStats.waiting}</span> bekliyor
            </span>
          )}
          {personStats.overdue > 0 && (
            <span className="font-medium text-red-600">
              ⚠ {personStats.overdue} gecikmiş
            </span>
          )}
        </div>
      )}

      {/* ── Pre-mount: static (no DnD) — desktop/tablet only ─────────────── */}
      {!mounted && (
        <div className="hidden md:block overflow-auto flex-1 min-h-0">
          <div className="relative min-w-max">
            {/* Continuous sticky band behind every column header (no gaps/peek). */}
            <div aria-hidden className="sticky top-0 z-10 h-11 bg-app border-b border-line shadow-[0_4px_10px_-6px_rgba(16,24,40,0.18)]" />
            <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 pb-4 items-start -mt-11">
              {!isAdminBoard && <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} />}
              {BOARD_COLUMNS.map((col) => (
                <StaticKanbanColumn
                  key={col.id}
                  colDef={col}
                  tasks={tasksByCol[col.id] ?? []}
                  profiles={profiles}
                  contacts={contacts}
                  responsibleNames={responsibleNames}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Post-mount: full DnD board ───────────────────────────────────── */}
      {mounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="hidden md:block overflow-auto flex-1 min-h-0">
            <div className="relative min-w-max">
              {/* Continuous sticky band behind every column header (no gaps/peek). */}
              <div aria-hidden className="sticky top-0 z-10 h-11 bg-app border-b border-line shadow-[0_4px_10px_-6px_rgba(16,24,40,0.18)]" />
              <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 pb-4 items-start -mt-11">
                {!isAdminBoard && <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} />}
                {BOARD_COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    colDef={col}
                    tasks={tasksByCol[col.id] ?? []}
                    profiles={profiles}
                    contacts={contacts}
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
                contacts={contacts}
                responsibleNames={responsibleNames}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Mobile board: segmented status control + single full-width column ── */}
      <div className="md:hidden flex flex-col">
        {/* Segmented status tabs — the one sticky element on mobile (compact, single
            row, horizontal scroll with the scrollbar hidden). */}
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar bg-white/95 backdrop-blur border-b border-gray-100 sticky top-0 z-10">
          {(isAdminBoard ? MOBILE_SEGMENTS.filter((s) => s.id !== "notes") : MOBILE_SEGMENTS).map((seg) => {
            const count = seg.id === "notes" ? notes.length : (tasksByCol[seg.id as BoardColId]?.length ?? 0);
            const active = mobileSeg === seg.id;
            return (
              <button
                key={seg.id}
                onClick={() => setMobileSeg(seg.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap border transition-colors shrink-0",
                  active
                    ? "bg-[#2f5d6b] text-white border-[#2f5d6b]"
                    : "bg-white text-gray-600 border-gray-200 active:bg-gray-50",
                )}
                aria-pressed={active}
              >
                {seg.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
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
            <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} authorsById={responsibleNames} mobile />
          ) : (
            (() => {
              const colTasks = tasksByCol[mobileSeg as BoardColId] ?? [];
              if (colTasks.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center text-center gap-2 py-16 text-gray-400">
                    <p className="text-sm">Bu sütunda görev yok.</p>
                    {canCreate && (
                      <button
                        onClick={() => { setModalDefaultStatus("ready"); setModalOpen(true); }}
                        className="text-sm text-[#2f5d6b] font-medium"
                      >
                        + Görev oluştur
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2.5">
                  {colTasks.map((task) => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      profiles={profiles}
                      contacts={contacts}
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

      {/* ── Toast overlay ─────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto bg-[#1d2127] text-white text-sm px-4 py-2.5 rounded-lg shadow-pop flex items-center gap-3 max-w-sm"
            >
              <span className="flex-1">{t.msg}</span>
              {t.action && (
                <Link
                  href={t.action.href}
                  onClick={() => dismissToast(t.id)}
                  className="shrink-0 font-medium text-[#8fc7d6] hover:text-white underline underline-offset-2"
                >
                  {t.action.label}
                </Link>
              )}
              <button
                onClick={() => dismissToast(t.id)}
                className="shrink-0 text-white/50 hover:text-white"
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
          contacts={contacts}
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
        <ExcelImportModal
          onClose={() => setImportOpen(false)}
          workspaceId={workspaceId}
          contacts={contacts}
        />
      )}
    </div>
    </BoardContext.Provider>
    </ParticipantsContext.Provider>
    </DeptMetaContext.Provider>
  );
}
