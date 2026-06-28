"use client";

import { useState } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Plus } from "lucide-react";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact } from "@/types";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";

type CalTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
};

interface Props {
  tasks: CalTask[];
  workspaceId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-red-500",
  high:   "bg-orange-400",
  medium: "bg-yellow-400",
  low:    "bg-gray-300",
};

const STATUS_DONE_CLS = "line-through text-gray-400";

export function CalendarView({ tasks, workspaceId, profiles, contacts }: Props) {
  const [current, setCurrent] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => {
      const due = t.due_date ? isSameDay(parseISO(t.due_date), day) : false;
      const start = t.start_date ? isSameDay(parseISO(t.start_date), day) : false;
      return due || start;
    });
  }

  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Takvim</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrent((d) => subMonths(d, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 w-36 text-center">
            {format(current, "MMMM yyyy", { locale: tr })}
          </span>
          <button
            onClick={() => setCurrent((d) => addMonths(d, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setCurrent(new Date())}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Bugün
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-t border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm">
        {days.map((day) => {
          const dayTasks = getTasksForDay(day);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, current);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const MAX_SHOWN = 3;

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={cn(
                "border-r border-b border-gray-200 min-h-20 p-1.5 text-left transition-colors",
                !inMonth && "bg-gray-50",
                isSelected && "bg-blue-50",
                !isSelected && inMonth && "hover:bg-gray-50/70"
              )}
            >
              <p className={cn(
                "text-xs font-medium mb-1 h-5 w-5 flex items-center justify-center rounded-full",
                isToday && "bg-blue-600 text-white",
                !isToday && inMonth && "text-gray-700",
                !isToday && !inMonth && "text-gray-300"
              )}>
                {format(day, "d")}
              </p>
              <div className="space-y-0.5">
                {dayTasks.slice(0, MAX_SHOWN).map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-1 text-[10px] truncate text-gray-600",
                      task.status === "done" && STATUS_DONE_CLS
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
                {dayTasks.length > MAX_SHOWN && (
                  <p className="text-[10px] text-blue-500 font-medium">+{dayTasks.length - MAX_SHOWN} daha</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day panel */}
      {selectedDay && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 bg-black/30" onClick={() => setSelectedDay(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                {format(selectedDay, "d MMMM", { locale: tr })} görevleri
              </h2>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                <X size={16} />
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Bu tarihte görev yok.</p>
              ) : (
                selectedDayTasks.map((task) => (
                  <Link
                    key={task.id}
                    prefetch={false}
                    href={`/tasks/${task.id}`}
                    onClick={() => setSelectedDay(null)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group",
                      task.status === "done" && "opacity-60"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
                    <span className={cn("text-sm text-gray-800 group-hover:text-blue-600 flex-1 truncate", task.status === "done" && "line-through")}>
                      {task.title}
                    </span>
                  </Link>
                ))
              )}
            </div>

            {/* Add task button */}
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setCreateModalDate(format(selectedDay, "yyyy-MM-dd"));
                  setSelectedDay(null);
                }}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                Bu güne görev ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create task modal with prefilled due date */}
      {createModalDate && (
        <CreateTaskModal
          key={createModalDate}
          onClose={() => setCreateModalDate(null)}
          workspaceId={workspaceId}
          profiles={profiles}
          contacts={contacts}
          defaultDueDate={createModalDate}
        />
      )}
    </div>
  );
}
