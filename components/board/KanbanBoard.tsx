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
} from "react";
import Link from "next/link";
import { GripVertical, Plus, FileSpreadsheet, Users } from "lucide-react";
import {
  BOARD_COLUMNS,
  CARD_STATUS_OPTIONS,
  getTaskColId,
  type BoardColId,
} from "@/lib/utils/task-constants";
import { PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { reorderTask, updateTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";
import { NotesColumn } from "@/components/board/NotesColumn";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceNote } from "@/types";

// ---- Priority chip styles ----

const PRIORITY_CHIP: Record<TaskPriority, string> = {
  low:    "bg-gray-100 text-gray-500",
  medium: "bg-amber-50 text-amber-700",
  high:   "bg-red-100 text-red-700",
  urgent: "bg-red-200 text-red-900 font-semibold",
};

// ---- Types ----

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  activeViewId: string | null;
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  notes: WorkspaceNote[];
}

// ---- Helpers ----

function encodeResponsible(task: Task) {
  if (task.assignee_id) return `member:${task.assignee_id}`;
  if (task.responsible_contact_id) return `contact:${task.responsible_contact_id}`;
  return "";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

// ---- Quick-edit: Status ----

function QuickStatusSelect({ task }: { task: Task }) {
  const [_p, startTransition] = useTransition();
  const [opt, setOpt] = useOptimistic<TaskStatus>(task.status);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const s = e.target.value as TaskStatus;
    startTransition(async () => {
      setOpt(s);
      await updateTask({ id: task.id, status: s });
    });
  }

  const currentLabel =
    CARD_STATUS_OPTIONS.find((o) => o.value === opt)?.label ??
    (opt === "review" ? "Devam ediyor" : opt === "backlog" ? "Yapılacak" : opt);

  return (
    <div className="relative inline-flex items-center">
      <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 leading-none pr-3 pointer-events-none">
        {currentLabel}
      </span>
      <select
        value={opt}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer w-full text-[10px]"
        aria-label="Durum değiştir"
      >
        {CARD_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---- Quick-edit: Priority ----

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

// ---- Quick-edit: Responsible ----

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
    <div className="relative inline-flex items-center ml-auto shrink-0">
      <span className="text-[10px] text-gray-400 whitespace-nowrap pr-2 pointer-events-none">
        {currentName ?? "Atanmamış"}
      </span>
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

// ---- Card body (shared between static + sortable) ----

function CardContent({
  task,
  profiles,
  contacts,
  responsibleNames,
  interactive,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  interactive: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";
  const isOverdue = !!task.due_date && task.due_date < today && !isDone;
  const threeDaysFromNow = (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
  const isDueSoon = !!task.due_date && !isOverdue && task.due_date <= threeDaysFromNow;

  const category = (task.custom_fields as Record<string, unknown>)?.category as string | undefined;
  const collaborators = (task.custom_fields as Record<string, unknown>)?.collaborators;
  const collabCount = Array.isArray(collaborators) ? collaborators.length : 0;

  return (
    <div className="flex-1 min-w-0">
      {/* Chips row */}
      {(category || isBlocked) && (
        <div className="flex items-center gap-1 mb-1 flex-wrap">
          {category && (
            <span className="text-[9px] bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5 leading-none font-medium truncate max-w-24">
              {category}
            </span>
          )}
          {isBlocked && (
            <span className="text-[9px] bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 leading-none font-medium">
              Bekliyor
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <Link
        href={`/tasks/${task.id}`}
        className={cn(
          "text-sm font-medium line-clamp-2 block leading-snug",
          isDone
            ? "text-green-800 line-through decoration-green-400/60"
            : "text-gray-900 hover:text-blue-600"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      {/* Tags */}
      {(task.tags?.length ?? 0) > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {[...new Set(task.tags)].slice(0, 2).map((tag, i) => (
            <span key={`${task.id}-t-${i}`} className="text-[9px] bg-blue-50 text-blue-500 rounded px-1 py-0.5 leading-none">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {interactive ? (
          <>
            <QuickStatusSelect task={task} />
            <QuickPrioritySelect task={task} />
          </>
        ) : (
          <>
            <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 leading-none">
              {CARD_STATUS_OPTIONS.find((o) => o.value === task.status)?.label ?? task.status}
            </span>
            <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none", PRIORITY_CHIP[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </>
        )}

        {task.due_date && (
          <span className={cn(
            "text-[10px]",
            isOverdue ? "text-red-500 font-medium" : isDueSoon ? "text-amber-600" : "text-gray-400"
          )}>
            {isOverdue ? "⚠ " : ""}
            {formatDate(task.due_date)}
          </span>
        )}

        {collabCount > 0 && (
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Users size={9} />
            {collabCount}
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
          (() => {
            const name =
              responsibleNames[task.assignee_id ?? ""] ??
              responsibleNames[task.responsible_contact_id ?? ""];
            return name ? (
              <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap truncate max-w-20">{name}</span>
            ) : null;
          })()
        )}
      </div>
    </div>
  );
}

// ---- Static card (pre-mount) ----

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
  return (
    <div className={cn(
      "rounded-lg border p-3 shadow-sm transition-all",
      isDone ? "border-l-4 border-l-green-400 border-green-200 bg-green-50/40" : "bg-white border-gray-200"
    )}>
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 p-0.5 shrink-0 text-gray-200"><GripVertical size={13} /></span>
        <CardContent task={task} profiles={profiles} contacts={contacts} responsibleNames={responsibleNames} interactive={false} />
      </div>
    </div>
  );
}

// ---- Sortable card (post-mount) ----

function TaskCard({
  task,
  profiles,
  contacts,
  responsibleNames,
  isDragOverlay = false,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const isDone = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border p-3 shadow-sm group",
        isDone ? "border-l-4 border-l-green-400 border-green-200 bg-green-50/40" : "bg-white border-gray-200",
        isDragging && "opacity-40",
        isDragOverlay && "shadow-xl rotate-1 border-blue-400",
        !isDragOverlay && !isDone && "hover:border-blue-300 hover:shadow-md transition-all",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-label="Sürükle"
          tabIndex={-1}
        >
          <GripVertical size={13} />
        </button>
        <CardContent
          task={task}
          profiles={profiles}
          contacts={contacts}
          responsibleNames={responsibleNames}
          interactive={!isDragOverlay}
        />
      </div>
    </div>
  );
}

// ---- Column (post-mount) ----

function KanbanColumn({
  colDef,
  tasks,
  profiles,
  contacts,
  responsibleNames,
  onAddTask,
}: {
  colDef: typeof BOARD_COLUMNS[number];
  tasks: Task[];
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  responsibleNames: Record<string, string>;
  onAddTask: (_colId: BoardColId) => void;
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
            isDoneCol ? "text-green-600" : "text-gray-500"
          )}>
            {colDef.label}
          </h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(colDef.id)}
          className="p-0.5 text-gray-300 hover:text-blue-500 rounded transition-colors"
          aria-label={`${colDef.label} sütununa görev ekle`}
        >
          <Plus size={14} />
        </button>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-col gap-2 rounded-lg p-1 min-h-20 transition-colors",
            tasks.length === 0 && "border-2 border-dashed border-gray-100",
            isOver && "bg-blue-50/50 border-blue-200"
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
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ---- Static column (pre-mount) ----

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

// ---- Mounted guard ----
const subscribeMounted = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

// ---- Main board ----

export function KanbanBoard({ tasks: initialTasks, savedViews, activeViewId, workspaceId, profiles, contacts, notes }: Props) {
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [_isPending, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>("ready");

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
      action: { type: "reorder"; id: string; status: TaskStatus; afterId: string | null }
    ) => {
      if (action.type !== "reorder") return state;
      const moved = state.find((t) => t.id === action.id);
      if (!moved) return state;
      const updated = { ...moved, status: action.status };
      const rest = state.filter((t) => t.id !== action.id);
      if (!action.afterId) return [...rest, updated];
      const idx = rest.findIndex((t) => t.id === action.afterId);
      if (idx === -1) return [...rest, updated];
      return [...rest.slice(0, idx + 1), updated, ...rest.slice(idx + 1)];
    }
  );

  // Group tasks into 3 visual columns (archived hidden), sorted by fractional_index
  const tasksByCol = useMemo(() => {
    const visible = optimisticTasks.filter((t) => t.status !== "archived");
    return BOARD_COLUMNS.reduce<Record<BoardColId, Task[]>>((acc, col) => {
      acc[col.id] = visible
        .filter((t) => (col.statuses as TaskStatus[]).includes(t.status))
        .sort((a, b) => (a.fractional_index ?? "").localeCompare(b.fractional_index ?? ""));
      return acc;
    }, {} as Record<BoardColId, Task[]>);
  }, [optimisticTasks]);

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

    // Determine target column
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

    // Same visual column → keep status; cross-column → use targetStatus
    const newStatus: TaskStatus = srcColId === tgtColId ? srcTask.status : tgtCol.targetStatus;

    // Position within merged target column
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

      const result = await reorderTask({
        id: activeId,
        newStatus,
        prevIndex,
        nextIndex,
      });

      if ("error" in result) {
        console.error("Yeniden sıralama hatası:", result.error);
      }
    });
  }, [optimisticTasks, tasksByCol]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Saved views tab strip */}
      {savedViews.length > 0 && (
        <div className="flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {savedViews.map((view) => (
            <a
              key={view.id}
              href={`/board?view=${view.id}`}
              className={cn(
                "px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                activeViewId === view.id
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {view.name}
            </a>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => { setModalDefaultStatus("ready"); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Görev oluştur
        </button>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileSpreadsheet size={14} />
          Excel&apos;den içe aktar
        </button>
      </div>

      {/* Pre-mount: static (no DnD) */}
      {!mounted && (
        <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start">
          <NotesColumn notes={notes} workspaceId={workspaceId} />
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

      {/* Post-mount: full DnD board */}
      {mounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 p-4 overflow-x-auto flex-1 items-start">
            <NotesColumn notes={notes} workspaceId={workspaceId} />
            {BOARD_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                colDef={col}
                tasks={tasksByCol[col.id] ?? []}
                profiles={profiles}
                contacts={contacts}
                responsibleNames={responsibleNames}
                onAddTask={handleAddTask}
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

      {/* Modals */}
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
