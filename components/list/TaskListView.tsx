"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useState, useOptimistic, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, Plus, FileSpreadsheet } from "lucide-react";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact } from "@/types";
import { STATUS_LABELS, TASK_STATUSES, TASK_PRIORITIES, PRIORITY_LABELS, PRIORITY_ORDER } from "@/lib/utils/task-constants";
import { FIELD_LABELS } from "@/lib/i18n/tr";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}

const columnHelper = createColumnHelper<Task>();

// ---- Status badge ----
function StatusBadge({ task }: { task: Task }) {
  const [_isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<TaskStatus>(task.status);

  function handleChange(newStatus: TaskStatus) {
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      await updateTaskStatus(task.id, newStatus);
    });
  }

  return (
    <select
      value={optimisticStatus}
      onChange={(e) => handleChange(e.target.value as TaskStatus)}
      className="text-xs bg-gray-100 border-0 rounded-full px-2 py-0.5 text-gray-600 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
      onClick={(e) => e.stopPropagation()}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

// ---- Priority badge ----
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={cn(
      "text-[10px] font-medium rounded px-1.5 py-0.5 leading-none",
      {
        low: "bg-gray-100 text-gray-500",
        medium: "bg-yellow-50 text-yellow-700",
        high: "bg-orange-50 text-orange-700",
        urgent: "bg-red-50 text-red-600",
      }[priority]
    )}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ---- Main component ----

export function TaskListView({ tasks, savedViews, workspaceId, profiles, contacts }: Props) {
  // Sort by updated_at (a visible column) by default — avoids "column not found" error
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // created_at is hidden; kept so TanStack Table can sort on it if needed in future
  const [columnVisibility] = useState<VisibilityState>({ created_at: false });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const columns = [
    columnHelper.accessor("title", {
      header: FIELD_LABELS.title,
      cell: (info) => (
        <div>
          <Link
            href={`/tasks/${info.row.original.id}`}
            className="font-medium text-gray-900 hover:text-blue-600 text-sm line-clamp-1 block"
          >
            {info.getValue()}
          </Link>
          {(info.row.original.tags?.length ?? 0) > 0 && (
            <div className="flex gap-1 mt-1">
              {info.row.original.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[10px] bg-blue-50 text-blue-500 rounded px-1 py-0.5 leading-none">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
      enableSorting: false,
    }),
    columnHelper.accessor("status", {
      header: FIELD_LABELS.status,
      cell: (info) => <StatusBadge task={info.row.original} />,
      sortingFn: (a, b) =>
        TASK_STATUSES.indexOf(a.original.status) - TASK_STATUSES.indexOf(b.original.status),
    }),
    columnHelper.accessor("priority", {
      header: FIELD_LABELS.priority,
      cell: (info) => <PriorityBadge priority={info.getValue()} />,
      sortingFn: (a, b) =>
        PRIORITY_ORDER[a.original.priority] - PRIORITY_ORDER[b.original.priority],
    }),
    columnHelper.accessor("due_date", {
      header: FIELD_LABELS.dueDate,
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <span className="text-xs text-gray-400">—</span>;
        const isOverdue = val < new Date().toISOString().slice(0, 10);
        return (
          <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-gray-500")}>
            {new Date(val).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
          </span>
        );
      },
      sortingFn: (a, b) =>
        (a.original.due_date ?? "9999-12-31") < (b.original.due_date ?? "9999-12-31") ? -1 : 1,
    }),
    columnHelper.accessor("assignee_id", {
      header: FIELD_LABELS.assignee,
      cell: (info) => (
        <span className="text-xs text-gray-400">{info.getValue() ? "Atandı" : "—"}</span>
      ),
      enableSorting: false,
    }),
    columnHelper.accessor("updated_at", {
      header: FIELD_LABELS.updatedAt,
      cell: (info) => (
        <span className="text-xs text-gray-400">
          {new Date(info.getValue()).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
        </span>
      ),
    }),
    // created_at: hidden column — allows sorting by creation date without showing the column
    columnHelper.accessor("created_at", {
      header: "Oluşturuldu",
      cell: (info) => (
        <span className="text-xs text-gray-400">
          {new Date(info.getValue()).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
        </span>
      ),
    }),
  ];

  const table = useReactTable({
    data: filteredTasks,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function SortIcon({ isSorted }: { isSorted: "asc" | "desc" | false }) {
    if (isSorted === "asc") return <ArrowUp size={12} className="ml-1 inline" />;
    if (isSorted === "desc") return <ArrowDown size={12} className="ml-1 inline" />;
    return <ArrowUpDown size={12} className="ml-1 inline opacity-30" />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Saved views tab strip */}
      {savedViews.length > 0 && (
        <div className="flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {savedViews.map((view) => (
            <a
              key={view.id}
              href={`/list?view=${view.id}`}
              className="px-3 py-2 text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 whitespace-nowrap transition-colors"
            >
              {view.name}
            </a>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
        <button
          onClick={() => setModalOpen(true)}
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
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <input
          type="search"
          placeholder="Görev ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Tüm durumlar</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Tüm öncelikler</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400 self-center">
          {table.getFilteredRowModel().rows.length} görev
        </span>
        <span className="text-xs text-gray-300">· çalışma alanı: {workspaceId.slice(0, 8)}…</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "text-left px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap select-none",
                      header.column.getCanSort() && "cursor-pointer hover:text-gray-700"
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <SortIcon isSorted={header.column.getIsSorted()} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-16 text-gray-400 text-sm">
                  Geçerli filtrelerle eşleşen görev yok
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn("px-4 py-2.5", cell.column.id === "title" && "w-full")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <CreateTaskModal
          onClose={() => setModalOpen(false)}
          workspaceId={workspaceId}
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
