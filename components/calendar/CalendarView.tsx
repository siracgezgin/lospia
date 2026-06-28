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
  isToday as dfnsIsToday,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Plus, CalendarDays } from "lucide-react";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { buildDeptMeta } from "@/lib/utils/departments";
import { getDepartmentCardStyle } from "@/lib/design/semantics";

type CalTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
  department_id: string | null;
};

interface Props {
  tasks: CalTask[];
  workspaceId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: { memberId: string; userId: string; name: string }[];
  deptMembers?: { department_id: string; member_id: string }[];
}

const DONE_CLS = "line-through text-gray-400";

export function CalendarView({ tasks, workspaceId, profiles, contacts, departments = [], members = [], deptMembers = [] }: Props) {
  const deptMeta = buildDeptMeta(departments);
  const dotFor = (t: CalTask) => {
    if (t.status === "done") return "bg-[#2e9367]";
    const color = t.department_id ? deptMeta[t.department_id]?.color : null;
    return getDepartmentCardStyle(color).dot;
  };

  const [current, setCurrent] = useState(new Date());
  // Default the agenda to today so the side panel is never empty on load.
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  // Months span 5 or 6 weeks — size rows to the real week count so a 5-week
  // month never leaves an empty 6th row (the old "blank area below the grid").
  const weekCount = days.length / 7;

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => {
      const due = t.due_date ? isSameDay(parseISO(t.due_date), day) : false;
      const start = t.start_date ? isSameDay(parseISO(t.start_date), day) : false;
      return due || start;
    });
  }

  function selectDay(day: Date) {
    setSelectedDay(day);
    setShowMobilePanel(true);
  }

  const selectedDayTasks = getTasksForDay(selectedDay);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Takvim</h1>
          <span className="text-sm font-semibold text-gray-500 capitalize hidden sm:inline">
            {format(current, "MMMM yyyy", { locale: tr })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setCurrent((d) => subMonths(d, 1))}
              className="p-1.5 hover:bg-gray-50 text-gray-500"
              aria-label="Önceki ay"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium text-gray-700 w-28 text-center border-x border-gray-200 py-1.5 capitalize sm:hidden">
              {format(current, "MMM yyyy", { locale: tr })}
            </span>
            <button
              onClick={() => setCurrent((d) => addMonths(d, 1))}
              className="p-1.5 hover:bg-gray-50 text-gray-500"
              aria-label="Sonraki ay"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            onClick={() => { setCurrent(new Date()); setSelectedDay(new Date()); }}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
          >
            Bugün
          </button>
        </div>
      </div>

      {/* Body: calendar grid + agenda side panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Calendar */}
        <div className="flex-1 min-w-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/60 shrink-0">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-2 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          {/* Grid — fills remaining height evenly across the real week count */}
          <div
            className="grid grid-cols-7 flex-1 min-h-0"
            style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
          >
            {days.map((day) => {
              const dayTasks = getTasksForDay(day);
              const isToday = dfnsIsToday(day);
              const inMonth = isSameMonth(day, current);
              const isSelected = isSameDay(day, selectedDay);
              const MAX_SHOWN = 4;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "border-r border-b border-gray-100 p-1.5 text-left transition-colors flex flex-col gap-1 min-h-0 overflow-hidden",
                    !inMonth && "bg-gray-50/60",
                    isSelected ? "ring-2 ring-inset ring-blue-400 bg-blue-50/40" : inMonth && "hover:bg-gray-50",
                  )}
                >
                  <span className={cn(
                    "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full shrink-0",
                    isToday && "bg-blue-600 text-white font-semibold",
                    !isToday && inMonth && "text-gray-700",
                    !isToday && !inMonth && "text-gray-300",
                  )}>
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {dayTasks.slice(0, MAX_SHOWN).map((task) => (
                      <span
                        key={task.id}
                        className={cn(
                          "flex items-center gap-1 text-[11px] leading-tight rounded px-1.5 py-0.5 bg-gray-50 border border-gray-100",
                          task.status === "done" && DONE_CLS,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotFor(task))} />
                        <span className="truncate text-gray-700">{task.title}</span>
                      </span>
                    ))}
                    {dayTasks.length > MAX_SHOWN && (
                      <span className="self-start text-[10px] text-blue-700 font-semibold bg-blue-50 rounded px-1.5 py-0.5 leading-none">
                        +{dayTasks.length - MAX_SHOWN} daha
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Agenda side panel (lg+) */}
        <aside className="w-80 shrink-0 hidden lg:flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
            <CalendarDays size={15} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900 capitalize">
              {format(selectedDay, "d MMMM EEEE", { locale: tr })}
            </h2>
            {dfnsIsToday(selectedDay) && (
              <span className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 font-medium">Bugün</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            {selectedDayTasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-10">
                <CalendarDays size={28} className="text-gray-200" />
                <p className="text-sm text-gray-400">Bu tarihte iş yok.</p>
              </div>
            ) : (
              selectedDayTasks.map((task) => (
                <Link
                  key={task.id}
                  prefetch={false}
                  href={`/tasks/${task.id}`}
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors group",
                    task.status === "done" && "opacity-60",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotFor(task))} />
                  <span className={cn(
                    "text-sm text-gray-800 group-hover:text-blue-600 flex-1 truncate",
                    task.status === "done" && "line-through text-gray-400",
                  )}>
                    {task.title}
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="px-3 py-3 border-t border-gray-100 shrink-0">
            <button
              onClick={() => setCreateModalDate(format(selectedDay, "yyyy-MM-dd"))}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Bu güne görev ekle
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile day panel (modal) — only below lg, where there is no side panel */}
      {showMobilePanel && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 lg:hidden" onClick={() => setShowMobilePanel(false)}>
          <div
            className="bg-white rounded-t-2xl shadow-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 capitalize">
                {format(selectedDay, "d MMMM EEEE", { locale: tr })}
              </h2>
              <button onClick={() => setShowMobilePanel(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {selectedDayTasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Bu tarihte iş yok.</p>
              ) : (
                selectedDayTasks.map((task) => (
                  <Link
                    key={task.id}
                    prefetch={false}
                    href={`/tasks/${task.id}`}
                    onClick={() => setShowMobilePanel(false)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group",
                      task.status === "done" && "opacity-60",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotFor(task))} />
                    <span className={cn("text-sm text-gray-800 group-hover:text-blue-600 flex-1 truncate", task.status === "done" && "line-through")}>
                      {task.title}
                    </span>
                  </Link>
                ))
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setCreateModalDate(format(selectedDay, "yyyy-MM-dd"));
                  setShowMobilePanel(false);
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
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          defaultDueDate={createModalDate}
        />
      )}
    </div>
  );
}
