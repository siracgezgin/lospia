"use client";
// Phase 11 — Calendar View
// Lightweight month grid with tasks plotted by start_date/due_date.

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
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TaskStatus, TaskPriority } from "@/types";
import { cn } from "@/lib/utils/cn";

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
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-gray-300",
};

export function CalendarView({ tasks }: Props) {
  const [current, setCurrent] = useState(new Date());

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => {
      const due = t.due_date ? isSameDay(parseISO(t.due_date), day) : false;
      const start = t.start_date ? isSameDay(parseISO(t.start_date), day) : false;
      return due || start;
    });
  }

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
            {format(current, "MMMM yyyy")}
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
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-t border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm">
        {days.map((day) => {
          const dayTasks = getTasksForDay(day);
          const isToday = isSameDay(day, new Date());
          const inMonth = isSameMonth(day, current);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-r border-b border-gray-200 min-h-20 p-1.5",
                !inMonth && "bg-gray-50"
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium mb-1 h-5 w-5 flex items-center justify-center rounded-full",
                  isToday && "bg-blue-600 text-white",
                  !isToday && inMonth && "text-gray-700",
                  !isToday && !inMonth && "text-gray-300"
                )}
              >
                {format(day, "d")}
              </p>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-1 text-[10px] truncate text-gray-600 hover:text-blue-600 group"
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
                    <span className="truncate">{task.title}</span>
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[10px] text-gray-400">+{dayTasks.length - 3} daha</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
