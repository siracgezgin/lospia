"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useOptimistic, useTransition, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { GripVertical, Plus, FileSpreadsheet } from "lucide-react";
import { TASK_STATUSES, STATUS_LABELS } from "@/lib/utils/task-constants";
import { reorderTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";
import type { Task, SavedView, TaskStatus, Profile, WorkspaceContact } from "@/types";

// ---- Types ----

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  activeViewId: string | null;
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}

// ---- Shared card body (no drag chrome) ----

function CardContent({ task }: { task: Task }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex-1 min-w-0">
      <Link
        href={`/tasks/${task.id}`}
        className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2 block"
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      {(task.tags?.length ?? 0) > 0 && (
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 leading-none">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className={cn("text-[10px] font-medium rounded px-1.5 py-0.5 leading-none", PRIORITY_COLORS[task.priority])}>
          {task.priority}
        </span>
        {task.due_date && (
          <span className={cn("text-[10px]", task.due_date < today ? "text-red-500 font-medium" : "text-gray-400")}>
            {new Date(task.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Static task card (pre-mount, no DnD, no aria-describedby) ----

function StaticTaskCard({ task }: { task: Task }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm group hover:border-blue-300 hover:shadow-md transition-all">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 p-0.5 shrink-0 text-gray-300">
          <GripVertical size={14} />
        </span>
        <CardContent task={task} />
      </div>
    </div>
  );
}

// ---- Sortable task card (post-mount, inside DndContext) ----

function TaskCard({ task, isDragOverlay = false }: { task: Task; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-white rounded-lg border border-gray-200 p-3 shadow-sm group",
        isDragging && "opacity-40",
        isDragOverlay && "shadow-lg rotate-1 border-blue-300",
        !isDragOverlay && "hover:border-blue-300 hover:shadow-md transition-all"
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
        <CardContent task={task} />
      </div>
    </div>
  );
}

// ---- Shared column header ----

function ColumnHeader({ status, count }: { status: TaskStatus; count: number }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {STATUS_LABELS[status]}
        </h3>
        <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
          {count}
        </span>
      </div>
    </div>
  );
}

// ---- Static column (pre-mount) ----

function StaticKanbanColumn({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  return (
    <div className="flex flex-col gap-2 w-64 shrink-0">
      <ColumnHeader status={status} count={tasks.length} />
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg p-1 min-h-16",
          tasks.length === 0 && "border-2 border-dashed border-gray-100"
        )}
      >
        {tasks.map((task) => (
          <StaticTaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ---- Sortable column (post-mount, inside DndContext) ----

function KanbanColumn({
  status,
  tasks,
  onAddTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAddTask?: (_status: TaskStatus) => void;
}) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className="flex flex-col gap-2 w-64 shrink-0">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {STATUS_LABELS[status]}
          </h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 leading-none">
            {tasks.length}
          </span>
        </div>
        {onAddTask && (
          <button
            onClick={() => onAddTask(status)}
            className="p-0.5 text-gray-300 hover:text-blue-500 rounded transition-colors"
            aria-label={`Add task to ${STATUS_LABELS[status]}`}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg p-1 min-h-16 transition-colors",
            tasks.length === 0 && "border-2 border-dashed border-gray-100"
          )}
          data-status={status}
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ---- Main board ----

// Server snapshot → false; client snapshot → true.
// useSyncExternalStore is the React-recommended way to detect client-only rendering
// without triggering the react-hooks/set-state-in-effect lint rule.
const subscribeMounted = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

export function KanbanBoard({ tasks: initialTasks, savedViews, activeViewId, workspaceId, profiles, contacts }: Props) {
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [_isPending, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>("backlog");

  function handleAddTask(status: TaskStatus) {
    setModalDefaultStatus(status);
    setModalOpen(true);
  }

  const [optimisticTasks, setOptimisticTasks] = useOptimistic(
    initialTasks,
    (state: Task[], action: { type: "reorder"; id: string; status: TaskStatus; newIndex: number; fromStatus: TaskStatus }) => {
      if (action.type === "reorder") {
        const moved = state.find((t) => t.id === action.id);
        if (!moved) return state;
        const withoutMoved = state.filter((t) => t.id !== action.id);
        const sameStatus = withoutMoved.filter((t) => t.status === action.status);
        const otherStatus = withoutMoved.filter((t) => t.status !== action.status);
        const newInStatus = [
          ...sameStatus.slice(0, action.newIndex),
          { ...moved, status: action.status },
          ...sameStatus.slice(action.newIndex),
        ];
        return [...otherStatus, ...newInStatus];
      }
      return state;
    }
  );

  const tasksByStatus = TASK_STATUSES.reduce<Record<string, Task[]>>((acc, status) => {
    acc[status] = optimisticTasks.filter((t) => t.status === status);
    return acc;
  }, {});

  function findTask(id: string) {
    return optimisticTasks.find((t) => t.id === id);
  }

  const onDragStart = useCallback((event: DragStartEvent) => {
    const task = findTask(event.active.id as string);
    if (task) setActiveTask(task);
  }, [optimisticTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragOver = useCallback((_event: DragOverEvent) => {
    // Cross-column move is committed on dragEnd; nothing to update optimistically here
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = findTask(activeId);
    if (!activeTask) return;

    const overTask = findTask(overId);
    const targetStatus: TaskStatus = overTask
      ? overTask.status
      : TASK_STATUSES.includes(overId as TaskStatus)
        ? (overId as TaskStatus)
        : activeTask.status;

    const column = tasksByStatus[targetStatus] ?? [];
    const overIndex = overTask ? column.findIndex((t) => t.id === overId) : column.length;

    const prevTask = overIndex > 0 ? column[overIndex - 1] : null;
    const nextTask = overIndex < column.length ? column[overIndex] : null;

    const prevIndex = prevTask?.id === activeId ? null : (prevTask?.fractional_index ?? null);
    const nextIndex = nextTask?.id === activeId ? null : (nextTask?.fractional_index ?? null);

    startTransition(async () => {
      setOptimisticTasks({
        type: "reorder",
        id: activeId,
        status: targetStatus,
        newIndex: overIndex,
        fromStatus: activeTask.status,
      });

      const result = await reorderTask({
        id: activeId,
        newStatus: targetStatus,
        prevIndex,
        nextIndex,
      });

      if ("error" in result) {
        console.error("Reorder failed:", result.error);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticTasks, tasksByStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleStatuses = TASK_STATUSES.filter((s) => s !== "archived");

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

      {/* Action toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => { setModalDefaultStatus("backlog"); setModalOpen(true); }}
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

      {/* Pre-mount: static columns (stable HTML, no dnd-kit aria IDs) */}
      {!mounted && (
        <div className="flex gap-3 p-4 overflow-x-auto flex-1 items-start">
          {visibleStatuses.map((status) => (
            <StaticKanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status] ?? []}
            />
          ))}
        </div>
      )}

      {/* Post-mount: full DnD board (rendered only client-side, avoids aria ID mismatch) */}
      {mounted && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 p-4 overflow-x-auto flex-1 items-start">
            {visibleStatuses.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={tasksByStatus[status] ?? []}
                onAddTask={handleAddTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <p className="text-center text-xs text-gray-300 py-1">
        workspace: {workspaceId.slice(0, 8)}…
      </p>

      {modalOpen && (
        <CreateTaskModal
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

// ---- Constants ----

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-yellow-50 text-yellow-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-600",
};
