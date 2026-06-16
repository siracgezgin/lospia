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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useOptimistic, useTransition, useCallback } from "react";
import Link from "next/link";
import { GripVertical, Plus } from "lucide-react";
import { TASK_STATUSES, STATUS_LABELS } from "@/lib/utils/task-constants";
import { reorderTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import type { Task, SavedView, TaskStatus } from "@/types";

// ---- Types ----

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  activeViewId: string | null;
  workspaceId: string;
  userId: string;
}

// ---- Sortable task card ----

function TaskCard({ task, isDragOverlay = false }: { task: Task; isDragOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-white rounded-lg border border-gray-200 p-3 shadow-sm group",
        isDragging && "opacity-40",
        isDragOverlay && "shadow-lg rotate-1 border-blue-300",
        !isDragOverlay && "hover:border-blue-300 hover:shadow-md transition-all"
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <Link
            href={`/tasks/${task.id}`}
            className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-2 block"
            onClick={(e) => e.stopPropagation()}
          >
            {task.title}
          </Link>

          {task.tags.length > 0 && (
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
              <span className={cn(
                "text-[10px]",
                task.due_date < new Date().toISOString().slice(0, 10)
                  ? "text-red-500 font-medium"
                  : "text-gray-400"
              )}>
                {new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Column ----

function KanbanColumn({
  status,
  tasks,
  onAddTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAddTask?: (status: TaskStatus) => void;
}) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className="flex flex-col gap-2 w-64 shrink-0">
      {/* Column header */}
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

      {/* Droppable + sortable area */}
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

export function KanbanBoard({ tasks: initialTasks, savedViews, activeViewId, workspaceId }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [_isPending, startTransition] = useTransition();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Optimistic state: we update locally immediately, then persist via server action
  const [optimisticTasks, setOptimisticTasks] = useOptimistic(
    initialTasks,
    (state: Task[], action: { type: "reorder"; id: string; status: TaskStatus; newIndex: number; fromStatus: TaskStatus }) => {
      if (action.type === "reorder") {
        const moved = state.find((t) => t.id === action.id);
        if (!moved) return state;
        const withoutMoved = state.filter((t) => t.id !== action.id);
        const sameStatus = withoutMoved.filter((t) => t.status === action.status);
        const otherStatus = withoutMoved.filter((t) => t.status !== action.status);
        const newInStatus = [...sameStatus.slice(0, action.newIndex), { ...moved, status: action.status }, ...sameStatus.slice(action.newIndex)];
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

  function findStatus(taskId: string): TaskStatus | null {
    const task = findTask(taskId);
    return task ? task.status : null;
  }

  const onDragStart = useCallback((event: DragStartEvent) => {
    const task = findTask(event.active.id as string);
    if (task) setActiveTask(task);
  }, [optimisticTasks]);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeStatus = findStatus(activeId);
    const overStatus: TaskStatus | null =
      // over could be a task or a column (data-status attribute)
      findStatus(overId) ??
      (TASK_STATUSES.includes(overId as TaskStatus) ? (overId as TaskStatus) : null);

    if (!activeStatus || !overStatus) return;
    if (activeId === overId) return;

    // Cross-column move — update optimistically, persist on dragEnd
  }, [optimisticTasks]);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = findTask(activeId);
    if (!activeTask) return;

    // Determine target status
    const overTask = findTask(overId);
    const targetStatus: TaskStatus = overTask
      ? overTask.status
      : TASK_STATUSES.includes(overId as TaskStatus)
        ? (overId as TaskStatus)
        : activeTask.status;

    const column = tasksByStatus[targetStatus] ?? [];
    const overIndex = overTask ? column.findIndex((t) => t.id === overId) : column.length;

    // Compute fractional index neighbors
    const prevTask = overIndex > 0 ? column[overIndex - 1] : null;
    const nextTask = overIndex < column.length ? column[overIndex] : null;

    const prevIndex = prevTask?.id === activeId ? null : (prevTask?.fractional_index ?? null);
    const nextIndex = nextTask?.id === activeId ? null : (nextTask?.fractional_index ?? null);

    // Apply optimistic update
    startTransition(async () => {
      setOptimisticTasks({
        type: "reorder",
        id: activeId,
        status: targetStatus,
        newIndex: overIndex,
        fromStatus: activeTask.status,
      });

      // Persist to server
      const result = await reorderTask({
        id: activeId,
        newStatus: targetStatus,
        prevIndex,
        nextIndex,
      });

      if ("error" in result) {
        console.error("Reorder failed:", result.error);
        // React will roll back optimistic state automatically on error
      }
    });
  }, [optimisticTasks, tasksByStatus]);

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

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 p-4 overflow-x-auto flex-1 items-start">
          {TASK_STATUSES.filter((s) => s !== "archived").map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status] ?? []}
            />
          ))}
        </div>

        {/* Drag overlay: shows the dragged card floating */}
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <p className="text-center text-xs text-gray-300 py-1">
        workspace: {workspaceId.slice(0, 8)}…
      </p>
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
