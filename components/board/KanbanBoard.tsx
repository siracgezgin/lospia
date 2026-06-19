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
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GripVertical, Plus, FileSpreadsheet, Users, Search, X,
  ChevronLeft, ChevronRight, MoreVertical, Pencil, Copy, Archive, Trash2, AlertTriangle,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  BOARD_COLUMNS,
  getTaskColId,
  SAVED_VIEW_SLUG_MAP,
  type BoardColId,
} from "@/lib/utils/task-constants";
import { PRIORITY_LABELS, PROJECT_OPTIONS } from "@/lib/utils/task-constants";
import { reorderTask, updateTask, softDeleteTask, archiveTask, duplicateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";
import { NotesColumn } from "@/components/board/NotesColumn";
import { canCreateTask, canDeleteTask, canArchiveTask } from "@/lib/auth/permissions";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole } from "@/types";

// ── Priority chip styles ──────────────────────────────────────────────────────

const PRIORITY_CHIP: Record<TaskPriority, string> = {
  low:    "bg-gray-100 text-gray-400",
  medium: "bg-amber-100 text-amber-700",
  high:   "bg-red-100 text-red-700",
  urgent: "bg-red-700 text-white font-semibold",
};

// ── Category card styles ──────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { bg: string; border: string; badge: string }> = {
  // Clean category names (no A/B prefixes)
  "Lookbook":       { bg: "bg-purple-50/40",    border: "border-l-purple-400",    badge: "bg-purple-100 text-purple-700"      },
  "Erişim":         { bg: "bg-[#e8f1f4]",       border: "border-l-[#406775]",     badge: "bg-[#deedf4] text-[#406775]"        },
  "Teknik SEO":     { bg: "bg-teal-50/40",       border: "border-l-teal-400",      badge: "bg-teal-100 text-teal-700"          },
  "GEO / AI":       { bg: "bg-emerald-50/40",    border: "border-l-emerald-400",   badge: "bg-emerald-100 text-emerald-700"    },
  // Legacy aliases for tasks created before rename
  "A — Lookbook":   { bg: "bg-purple-50/40",    border: "border-l-purple-400",    badge: "bg-purple-100 text-purple-700"      },
  "B — Erişim":     { bg: "bg-[#e8f1f4]",       border: "border-l-[#406775]",     badge: "bg-[#deedf4] text-[#406775]"        },
  "B — Teknik SEO": { bg: "bg-teal-50/40",       border: "border-l-teal-400",      badge: "bg-teal-100 text-teal-700"          },
  "B — GEO / AI":   { bg: "bg-emerald-50/40",    border: "border-l-emerald-400",   badge: "bg-emerald-100 text-emerald-700"    },
  // Department categories (title-case)
  "Kumaş Siparişi": { bg: "bg-amber-50/40",      border: "border-l-amber-400",     badge: "bg-amber-100 text-amber-700"        },
  "Üretim":         { bg: "bg-[#e8f1f4]",        border: "border-l-[#406775]",     badge: "bg-[#deedf4] text-[#406775]"        },
  "Operasyon":      { bg: "bg-[#f0f4f5]",        border: "border-l-[#5b8fa0]",     badge: "bg-[#e0eff5] text-[#406775]"        },
  "Satın Alma":     { bg: "bg-orange-50/40",      border: "border-l-orange-400",    badge: "bg-orange-100 text-orange-700"      },
  "Pazarlama":      { bg: "bg-rose-50/40",        border: "border-l-rose-400",      badge: "bg-rose-100 text-rose-700"          },
  // AFR-AF import categories (uppercase)
  "ÜRETİM":           { bg: "bg-[#e8f1f4]",      border: "border-l-[#406775]",     badge: "bg-[#deedf4] text-[#406775]"        },
  "SİSTEM":           { bg: "bg-[#e8f3f6]",      border: "border-l-[#5ba5bb]",     badge: "bg-[#daeef5] text-[#3a7a90]"        },
  "OPERASYON":        { bg: "bg-[#f0f4f5]",      border: "border-l-[#5b8fa0]",     badge: "bg-[#e0eff5] text-[#406775]"        },
  "SİPARİŞ":          { bg: "bg-amber-50/40",    border: "border-l-amber-400",     badge: "bg-amber-100 text-amber-700"        },
  "SATIN ALMA":       { bg: "bg-orange-50/40",   border: "border-l-orange-400",    badge: "bg-orange-100 text-orange-700"      },
  "TASARIM":          { bg: "bg-pink-50/40",     border: "border-l-pink-400",      badge: "bg-pink-100 text-pink-700"          },
  "GÖRSEL DÜZENLEME": { bg: "bg-[#f8eff0]",      border: "border-l-[#c07888]",     badge: "bg-[#f5e0e5] text-[#a05060]"        },
  "FİYAT ÇALIŞMA":   { bg: "bg-[#f5f3e8]",      border: "border-l-[#c8c39e]",     badge: "bg-[#eae8d8] text-[#6b6748]"        },
};
// No category: clean white card, no badge shown
const CATEGORY_NONE     = { bg: "bg-white",     border: "border-l-gray-100",  badge: "" };
// Unknown category: subtle slate tint so the card doesn't look broken
const CATEGORY_FALLBACK = { bg: "bg-slate-50/60", border: "border-l-slate-300", badge: "bg-slate-100 text-slate-600" };

function getCategoryStyle(category?: string | null) {
  if (!category) return CATEGORY_NONE;
  return CATEGORY_STYLES[category] ?? CATEGORY_FALLBACK;
}

// ── Week helpers ──────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
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

function isActiveForBoard(task: Task, monday: Date): boolean {
  if (task.status === "archived") return false;
  if (task.status === "done") return isInWeek(task.completed_at, monday);
  return true;
}

function applyViewFilter(tasks: Task[], slug: string, userId: string, monday: Date): Task[] {
  const today = new Date().toISOString().slice(0, 10);
  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = (() => { const d = new Date(monday); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10); })();

  switch (slug) {
    case "mine":
      return tasks.filter((t) => t.assignee_id === userId && isActiveForBoard(t, monday));
    case "this-week":
      return tasks.filter((t) =>
        t.due_date !== null && t.due_date >= mondayStr && t.due_date <= sundayStr,
      );
    case "overdue":
      return tasks.filter((t) =>
        t.status !== "archived" && t.status !== "done" &&
        t.due_date !== null && t.due_date < today,
      );
    case "done":
      return tasks.filter((t) => t.status === "done" && isInWeek(t.completed_at, monday));
    case "waiting-approval":
      return tasks.filter((t) =>
        !t.deleted_at && !t.archived_at && t.status !== "done" && (
          t.approval_required === true ||
          t.waiting_on_member_id != null ||
          t.waiting_on_contact_id != null
        ),
      );
    default: // "all"
      return tasks.filter((t) => isActiveForBoard(t, monday));
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
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  notes: WorkspaceNote[];
  newRulesCount?: number;
  userRole?: WorkspaceRole;
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

function QuickPrioritySelect({ task }: { task: Task }) {
  const [_p, startTransition] = useTransition();
  const [opt, setOpt] = useOptimistic<TaskPriority>(task.priority);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = e.target.value as TaskPriority;
    startTransition(async () => {
      setOpt(p);
      await updateTask({ id: task.id, priority: p });
    });
  }

  return (
    <div className="relative inline-flex items-center">
      <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none pr-3 pointer-events-none", PRIORITY_CHIP[opt])}>
        {PRIORITY_LABELS[opt]}
      </span>
      <select
        value={opt}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer w-full text-[10px]"
        aria-label="Öncelik değiştir"
      >
        <option value="low">Düşük</option>
        <option value="medium">Orta</option>
        <option value="high">Yüksek</option>
        <option value="urgent">Acil</option>
      </select>
    </div>
  );
}

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
        <>
          <Avatar name={currentName} size="xs" />
          <span className="text-[10px] text-gray-500 truncate max-w-14 pointer-events-none">{currentName}</span>
        </>
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
  const today = new Date().toISOString().slice(0, 10);
  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";
  const isOverdue = !!task.due_date && task.due_date < today && !isDone;
  const threeDaysFromNow = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  })();
  const isDueSoon = !!task.due_date && !isOverdue && task.due_date <= threeDaysFromNow;

  const cf = task.custom_fields as Record<string, unknown>;
  const category = cf?.category as string | undefined;
  const collaborators = cf?.collaborators;
  const collabIds = Array.isArray(collaborators) ? collaborators as string[] : [];
  const categoryStyle = getCategoryStyle(category);
  const responsibleName =
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[task.responsible_contact_id ?? ""];

  const waitingOnName =
    responsibleNames[task.waiting_on_member_id ?? ""] ??
    responsibleNames[task.waiting_on_contact_id ?? ""] ??
    null;
  const needsApproval = task.approval_required && task.approval_status !== "approved";

  return (
    <div className="flex-1 min-w-0">
      {/* Top row: category badge + blocked chip + 3-dot menu */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          {category && (
            <span className={cn(
              "text-[9px] rounded px-1.5 py-0.5 leading-none font-medium truncate max-w-28",
              categoryStyle.badge,
            )}>
              {category}
            </span>
          )}
          {isBlocked && !waitingOnName && !needsApproval && (
            <span className="text-[9px] bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 leading-none font-medium">
              Bekliyor
            </span>
          )}
          {waitingOnName && (
            <span className="text-[9px] bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 leading-none font-medium truncate max-w-28">
              ⏳ {waitingOnName}
            </span>
          )}
          {needsApproval && !waitingOnName && (
            <span className="text-[9px] bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5 leading-none font-medium">
              Onay bekleniyor
            </span>
          )}
        </div>
        {interactive && showMenu && onDelete && onArchive && onDuplicate && (
          <CardMenu
            onEdit={() => { window.location.href = `/tasks/${task.id}`; }}
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
        href={`/tasks/${task.id}`}
        className={cn(
          "text-sm font-medium line-clamp-2 block leading-snug",
          isDone
            ? "text-green-800 line-through decoration-green-400/60"
            : "text-gray-900 hover:text-blue-600",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      {/* Description (one line) */}
      {task.description && (
        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 leading-snug">
          {task.description}
        </p>
      )}

      {/* Bottom row: priority + due date + collabs + person */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {interactive ? (
          <QuickPrioritySelect task={task} />
        ) : (
          <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none", PRIORITY_CHIP[task.priority])}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}

        {task.due_date && (
          <span className={cn(
            "text-[10px] flex items-center gap-0.5",
            isOverdue ? "text-red-500 font-medium" : isDueSoon ? "text-amber-600" : "text-gray-400",
          )}>
            {isOverdue && <AlertTriangle size={9} />}
            {formatDate(task.due_date)}
          </span>
        )}

        {collabIds.length > 0 && (
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Users size={9} />
            {collabIds.length}
          </span>
        )}

        {interactive ? (
          <QuickAssigneeSelect
            task={task}
            profiles={profiles}
            contacts={contacts}
            responsibleNames={responsibleNames}
          />
        ) : (
          responsibleName ? (
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <Avatar name={responsibleName} size="xs" />
              <span className="text-[10px] text-gray-400 truncate max-w-16">{responsibleName}</span>
            </div>
          ) : null
        )}
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
  const isDone = task.status === "done";
  const catStyle = getCategoryStyle((task.custom_fields as Record<string, unknown>)?.category as string | undefined);
  // Do NOT use cn() here — tailwind-merge strips border-l-{color} when border-l-4 is present
  const cardCls = isDone
    ? "rounded-lg border border-l-4 p-3 shadow-sm transition-all border-l-green-400 border-green-200 bg-green-50/40"
    : `rounded-lg border border-l-4 p-3 shadow-sm transition-all ${catStyle.border} border-gray-200 ${catStyle.bg}`;
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
  const isDone = task.status === "done";
  const catStyle = getCategoryStyle((task.custom_fields as Record<string, unknown>)?.category as string | undefined);
  // Do NOT use cn() for the outer div — tailwind-merge strips border-l-{color} when border-l-4 is present
  const colorCls = isDone
    ? "border-l-green-400 border-green-200 bg-green-50/40"
    : `${catStyle.border} border-gray-200 ${catStyle.bg}`;
  const stateCls = [
    isDragging ? "opacity-40" : "",
    isDragOverlay ? "shadow-xl rotate-1" : "hover:shadow-md transition-all",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-l-4 p-3 shadow-sm group ${colorCls} ${stateCls}`}
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
}) {
  const taskIds = tasks.map((t) => t.id);
  const { setNodeRef, isOver } = useDroppable({ id: colDef.id });
  const isDoneCol = colDef.id === "tamamlandi";

  return (
    <div className="flex flex-col gap-2 w-80 shrink-0">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <h3 className={cn(
            "text-xs font-bold uppercase tracking-wider",
            isDoneCol ? "text-green-600" : "text-gray-500",
          )}>
            {colDef.label}
          </h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
            {tasks.length}
          </span>
        </div>
        {!disableDrag && (
          <button
            onClick={() => onAddTask(colDef.id)}
            className="p-0.5 text-gray-300 hover:text-blue-500 rounded transition-colors"
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
              disableDrag={disableDrag}
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
  const isDoneCol = colDef.id === "tamamlandi";
  return (
    <div className="flex flex-col gap-2 w-80 shrink-0">
      <div className="flex items-center gap-2 px-0.5">
        <h3 className={cn("text-xs font-bold uppercase tracking-wider", isDoneCol ? "text-green-600" : "text-gray-500")}>
          {colDef.label}
        </h3>
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">{tasks.length}</span>
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
  workspaceId,
  userId,
  profiles,
  contacts,
  notes,
  newRulesCount = 0,
  userRole = "member",
}: Props) {
  const canCreate  = canCreateTask(userRole);
  const canDelete  = canDeleteTask(userRole);
  const canArchive = canArchiveTask(userRole);
  const isViewer   = userRole === "viewer";
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

  // Client-side filters (not URL-persisted; reset on refresh)
  const [personFilter, setPersonFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  // Week selector — default to current week's Monday
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const currentMonday = getMondayOf(new Date());
  const isCurrentWeek = weekStart.toDateString() === currentMonday.toDateString();

  // Rules alert (dismissible per session)
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string }>>([]);
  function showToast(msg: string) {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
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
      const updated = { ...moved, status: action.status };
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

  // Unique category values from all (unfiltered) tasks
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    optimisticTasks.forEach((t) => {
      const cat = (t.custom_fields as Record<string, unknown>)?.category as string | undefined;
      if (cat) seen.add(cat);
    });
    return Array.from(seen).sort();
  }, [optimisticTasks]);

  // Composed filter: saved-view → project → category → person → search
  const filteredTasks = useMemo(() => {
    let tasks = applyViewFilter(optimisticTasks, effectiveSlug, userId, weekStart);
    if (projectFilter) {
      tasks = tasks.filter((t) => {
        const cf = t.custom_fields as Record<string, unknown>;
        return (cf?.project as string | undefined) === projectFilter;
      });
    }
    if (categoryFilter) {
      tasks = tasks.filter((t) => {
        const cf = t.custom_fields as Record<string, unknown>;
        return (cf?.category as string | undefined) === categoryFilter;
      });
    }
    tasks = applyPersonFilter(tasks, personFilter);
    tasks = tasks.filter((t) => matchesSearch(t, search, responsibleNames));
    return tasks;
  }, [optimisticTasks, effectiveSlug, userId, weekStart, projectFilter, categoryFilter, personFilter, search, responsibleNames]);

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
        console.error("Yeniden sıralama hatası:", result.error);
      }
    });
  }, [optimisticTasks, tasksByCol]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActiveFilter = !!personFilter || !!search || !!projectFilter || !!categoryFilter;

  // Person workload summary (computed from raw tasks, not view-filtered)
  const personStats = useMemo(() => {
    if (!personFilter) return null;
    const today = new Date().toISOString().slice(0, 10);
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
  }, [personFilter, optimisticTasks, responsibleNames]);

  return (
    <div className="flex flex-col h-full">

      {/* ── Rules alert ───────────────────────────────────────────────────── */}
      {newRulesCount > 0 && !alertDismissed && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#fdf8e8] border-b border-[#d4cf9e] shrink-0">
          <span className="text-sm text-[#6b6748]">
            <span className="font-semibold">{newRulesCount > 1 ? `${newRulesCount} kural` : "1 kural"}</span>
            {" "}güncellendi veya eklendi.
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/rules"
              className="text-sm font-medium text-[#406775] hover:underline"
            >
              Kuralları görüntüle →
            </Link>
            <button
              onClick={() => setAlertDismissed(true)}
              className="text-gray-400 hover:text-gray-600 p-0.5"
              aria-label="Bildirimi kapat"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Week selector ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-100 shrink-0">
        <button
          onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          aria-label="Önceki hafta"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-32 text-center select-none">
          {formatWeekLabel(weekStart)}
        </span>
        <button
          onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          aria-label="Sonraki hafta"
        >
          <ChevronRight size={14} />
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(getMondayOf(new Date()))}
            className="ml-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
          >
            Bu hafta
          </button>
        )}
        {isCurrentWeek && (
          <span className="ml-1 text-xs text-gray-400 select-none">Bu hafta</span>
        )}
      </div>

      {/* ── Saved-view tab strip ─────────────────────────────────────────── */}
      {savedViews.length > 0 && (
        <div className="flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {savedViews.map((view) => {
            const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
            const isActive = effectiveSlug === slug;
            return (
              <a
                key={view.id}
                href={`/board?view=${slug}`}
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
        {canCreate && (
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet size={14} />
            Excel&apos;den içe aktar
          </button>
        )}

        {/* Right: Proje + Kategori + Kişi + Arama */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Proje filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={cn(
              "text-sm border rounded-lg px-2 py-1.5 bg-white transition-colors cursor-pointer",
              projectFilter ? "border-[#406775] text-[#406775]" : "border-gray-200 text-gray-600",
            )}
            aria-label="Projeye göre filtrele"
          >
            <option value="">Proje</option>
            {PROJECT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Kategori filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={cn(
              "text-sm border rounded-lg px-2 py-1.5 bg-white transition-colors cursor-pointer",
              categoryFilter ? "border-[#406775] text-[#406775]" : "border-gray-200 text-gray-600",
            )}
            aria-label="Kategoriye göre filtrele"
          >
            <option value="">Kategori</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Person filter */}
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
              onClick={() => { setPersonFilter(""); setProjectFilter(""); setCategoryFilter(""); setSearch(""); }}
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

      {/* ── Pre-mount: static (no DnD) ───────────────────────────────────── */}
      {!mounted && (
        <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start">
          <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} />
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
      )}

      {/* ── Post-mount: full DnD board ───────────────────────────────────── */}
      {mounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start">
            <NotesColumn notes={notes} workspaceId={workspaceId} readOnly={isViewer} />
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
              />
            ))}
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

      {/* ── Toast overlay ─────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg"
            >
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <CreateTaskModal
          key={modalDefaultStatus}
          onClose={() => setModalOpen(false)}
          workspaceId={workspaceId}
          defaultStatus={modalDefaultStatus}
          profiles={profiles}
          contacts={contacts}
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
  );
}
