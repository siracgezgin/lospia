"use client";
// Phase 6 — TanStack Table list view (full implementation)
// Placeholder: renders sortable table until Phase 6 is built.

import { useState } from "react";
import type { Task, SavedView, TaskStatus, TaskPriority } from "@/types/database";
import { STATUS_LABELS, TASK_STATUSES, TASK_PRIORITIES, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import Link from "next/link";

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  workspaceId: string;
  userId: string;
}

type SortField = "due_date" | "priority" | "created_at" | "updated_at";

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

export function TaskListView({ tasks, savedViews }: Props) {
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [search, setSearch] = useState("");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = tasks
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => filterPriority === "all" || t.priority === filterPriority)
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === "due_date") {
        cmp = (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1;
      } else if (sortField === "priority") {
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      } else if (sortField === "created_at") {
        cmp = a.created_at < b.created_at ? -1 : 1;
      } else {
        cmp = a.updated_at < b.updated_at ? -1 : 1;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="flex flex-col h-full">
      {/* Saved views tab strip */}
      {savedViews.length > 0 && (
        <div className="flex gap-1 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {savedViews.map((view) => (
            <a
              key={view.id}
              href={`/list?view=${view.id}`}
              className="px-3 py-1.5 text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 whitespace-nowrap"
            >
              {view.name}
            </a>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
        <input
          type="search"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length} tasks</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-full">Task</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort("priority")}
              >
                Priority{sortIndicator("priority")}
              </th>
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort("due_date")}
              >
                Due{sortIndicator("due_date")}
              </th>
              <th
                className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap cursor-pointer hover:text-gray-700"
                onClick={() => toggleSort("updated_at")}
              >
                Updated{sortIndicator("updated_at")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400">No tasks match the current filters</td>
              </tr>
            ) : (
              filtered.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/tasks/${task.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-1">
                      {task.title}
                    </Link>
                    {task.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {task.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="text-[10px] bg-blue-50 text-blue-500 rounded px-1 py-0.5">{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{STATUS_LABELS[task.status]}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap capitalize text-xs text-gray-600">{task.priority}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
                    {task.due_date
                      ? new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-400">
                    {new Date(task.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
