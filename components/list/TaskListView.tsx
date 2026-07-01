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
import { useState, useOptimistic, useTransition, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowUpDown, Plus, FileSpreadsheet, Lock } from "lucide-react";
import { ADMIN_ONLY_CHIP_LABEL } from "@/lib/utils/visibility";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  CARD_STATUS_OPTIONS,
} from "@/lib/utils/task-constants";
import { FIELD_LABELS } from "@/lib/i18n/tr";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { buildDeptMeta } from "@/lib/utils/departments";
import { resolvePersonDescriptor, resolvePersonName, taskMatchesPerson } from "@/lib/utils/task-person-match";
import { getDepartmentBadge, STATUS_CHIP_TONE } from "@/lib/design/semantics";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { ExcelImportModal } from "@/components/task/ExcelImportModal";

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  workspaceId: string;
  userId: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: { memberId: string; userId: string; name: string }[];
  deptMembers?: { department_id: string; member_id: string }[];
  isAdmin?: boolean;
  // Person filter seed from the URL (?person=<member userId | contact id>).
  initialPerson?: string;
}

// Person matching (assignee / responsible contact / collaborators / original
// owner, by id or name) lives in a shared helper so the List filter and the CRM
// "X görev" counts always agree. See lib/utils/task-person-match.

// ---- Status display — simplified user-facing labels ----

const SIMPLIFIED_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog:     "Yapılacak",
  ready:       "Yapılacak",
  in_progress: "Devam ediyor",
  review:      "Kontrol / Onay",
  blocked:     "Bekliyor",
  done:        "Tamamlandı",
  archived:    "Arşivlendi",
};

// Status filter options (user-facing groups → internal status arrays).
// Mirrors the board's columns so Kontrol / Onay is its own filterable stage.
type StatusFilterKey = "all" | "yapilacak" | "devam_ediyor" | "kontrol_onay" | "bekliyor" | "tamamlandi";

const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string; statuses: TaskStatus[] }[] = [
  { key: "all",          label: "Tüm durumlar",   statuses: [] },
  { key: "yapilacak",    label: "Yapılacak",       statuses: ["backlog", "ready"] },
  { key: "devam_ediyor", label: "Devam ediyor",    statuses: ["in_progress"] },
  { key: "kontrol_onay", label: "Kontrol / Onay",  statuses: ["review"] },
  { key: "bekliyor",     label: "Bekliyor",        statuses: ["blocked"] },
  { key: "tamamlandi",   label: "Tamamlandı",      statuses: ["done"] },
];

// ---- Safe category extractor ----

function safeCategory(task: Task): string {
  try {
    const cf = task.custom_fields;
    if (!cf || typeof cf !== "object" || Array.isArray(cf)) return "";
    const cat = (cf as Record<string, unknown>).category;
    if (typeof cat === "string") return cat;
    // Fallback: first tag
    const tags = task.tags;
    if (Array.isArray(tags) && tags.length > 0) return String(tags[0]);
    return "";
  } catch {
    return "";
  }
}

const columnHelper = createColumnHelper<Task>();

// ---- Status badge (inline editable) ----
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
    <div className="relative inline-flex items-center">
      <span className={cn(
        "text-[11px] font-medium rounded-full px-2 py-0.5 pr-5 whitespace-nowrap pointer-events-none",
        STATUS_CHIP_TONE[optimisticStatus],
      )}>
        {SIMPLIFIED_STATUS_LABEL[optimisticStatus]}
      </span>
      <select
        value={optimisticStatus}
        onChange={(e) => handleChange(e.target.value as TaskStatus)}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        aria-label="Durum değiştir"
      >
        {CARD_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---- Priority badge ----
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={cn(
      "text-[10px] font-medium rounded px-1.5 py-0.5 leading-none whitespace-nowrap",
      {
        low:    "bg-gray-100 text-gray-500",
        medium: "bg-amber-50 text-amber-700",
        high:   "bg-red-100 text-red-700",
        urgent: "bg-red-200 text-red-900 font-semibold",
      }[priority]
    )}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ---- Mobile task card (replaces the wide table below md) ----
function MobileTaskCard({
  task,
  deptMeta,
  responsibleNames,
}: {
  task: Task;
  deptMeta: ReturnType<typeof buildDeptMeta>;
  responsibleNames: Record<string, string>;
}) {
  const meta = task.department_id ? deptMeta[task.department_id] : undefined;
  const badge = meta ? getDepartmentBadge(meta.color) : null;
  const responsible =
    responsibleNames[task.assignee_id ?? ""] ??
    responsibleNames[(task as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ??
    "";
  const creatorName = task.created_by ? responsibleNames[task.created_by] : null;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !!task.due_date && task.due_date < today && task.status !== "done";

  return (
    <Link
      prefetch={false}
      href={`/tasks/${task.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-3.5 shadow-card active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug flex-1 min-w-0">
          {task.title}
        </p>
        <span className={cn(
          "text-[10px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap shrink-0",
          STATUS_CHIP_TONE[task.status],
        )}>
          {SIMPLIFIED_STATUS_LABEL[task.status]}
        </span>
      </div>

      {task.description && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</p>
      )}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {meta && badge && (
          <span className={cn(
            "inline-flex items-center gap-1 max-w-[60%] rounded-lg py-0.5 px-2 text-[11px] font-medium ring-1",
            badge.chip, badge.ring,
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
            <span className="truncate">{meta.name}</span>
          </span>
        )}
        <PriorityBadge priority={task.priority} />
        {task.due_date && (
          <span className={cn("text-[11px] font-medium whitespace-nowrap", isOverdue ? "text-red-500" : "text-gray-500")}>
            {isOverdue ? "⚠ " : ""}
            {formatDateTR(task.due_date, { day: "numeric", month: "short" })}
          </span>
        )}
        {responsible && (
          <span className="ml-auto text-[11px] text-gray-500 truncate max-w-[40%]">{responsible}</span>
        )}
      </div>

      {(creatorName || task.created_at) && (
        <p className="mt-2 text-[10px] text-gray-400 truncate">
          {creatorName && <span className="font-medium text-gray-500">{creatorName}</span>}
          {creatorName && task.created_at && " · "}
          {task.created_at && formatDateTR(task.created_at, { day: "numeric", month: "short" })}
        </p>
      )}
    </Link>
  );
}

// ---- Main component ----

export function TaskListView({ tasks, savedViews, workspaceId, profiles, contacts, departments = [], members = [], deptMembers = [], isAdmin = false, initialPerson = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deptMeta = useMemo(() => buildDeptMeta(departments), [departments]);
  const responsibleNames = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p) => { map[p.id] = p.full_name ?? p.email ?? "?"; });
    contacts.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [profiles, contacts]);

  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    created_at: false,
    updated_at: false,
    priority: false,
  });

  const [search, setSearch] = useState("");
  const [filterStatusKey, setFilterStatusKey] = useState<StatusFilterKey>("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [personFilter, setPersonFilter] = useState(initialPerson);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Person dropdown options — same data source as the board's Kişi filter:
  // workspace members first, then contacts. Value is the bare id.
  const personOptions = useMemo(() => ({
    members: profiles.map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? "—" })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name })),
  }), [profiles, contacts]);

  // Keep the selection in the URL (?person=…) so a refresh preserves the filter.
  const handlePersonChange = useCallback((value: string) => {
    setPersonFilter(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("person", value);
    else params.delete("person");
    const qs = params.toString();
    router.replace(qs ? `/list?${qs}` : "/list", { scroll: false });
  }, [router, searchParams]);

  const allowedStatuses = STATUS_FILTER_OPTIONS.find((o) => o.key === filterStatusKey)?.statuses ?? [];

  // Resolve the selected person (?person=<contact id | member user id>) into a
  // full descriptor + display name for matching and the filter banner.
  const personDescriptor = useMemo(
    () => (personFilter ? resolvePersonDescriptor(personFilter, { contacts, profiles }) : null),
    [personFilter, contacts, profiles],
  );
  const personDisplayName = useMemo(
    () => (personFilter ? resolvePersonName(personFilter, { contacts, profiles }) : null),
    [personFilter, contacts, profiles],
  );

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(t.status)) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (personDescriptor && !taskMatchesPerson(t, personDescriptor)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, allowedStatuses, filterPriority, personDescriptor, search]);

  // Columns MUST be memoized — recreating the array every render causes TanStack Table
  // to re-derive its internal model on every keystroke/sort click, which freezes the UI.
  const columns = useMemo(() => [
    columnHelper.accessor("title", {
      id: "title",
      header: FIELD_LABELS.title,
      cell: (info) => (
        <div>
          <Link
            prefetch={false}
            href={`/tasks/${info.row.original.id}`}
            title={info.getValue()}
            className="font-medium text-gray-900 hover:text-blue-600 text-sm line-clamp-2 block leading-snug break-words"
          >
            {info.getValue()}
          </Link>
          {(info.row.original as unknown as { visibility?: string }).visibility === "admin_only" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 leading-none mt-1">
              <Lock size={9} /> {ADMIN_ONLY_CHIP_LABEL}
            </span>
          )}
          {(info.row.original.tags?.length ?? 0) > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {[...new Set(info.row.original.tags)].slice(0, 3).map((tag, i) => (
                <span key={`${info.row.original.id}-tag-${i}`} className="text-[10px] bg-blue-50 text-blue-500 rounded px-1 py-0.5 leading-none">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
      enableSorting: false,
    }),
    // Description column
    columnHelper.accessor("description", {
      id: "description",
      header: "Açıklama",
      cell: (info) => {
        const val = info.getValue();
        return val
          ? <span className="text-xs text-gray-400 italic line-clamp-1">{val}</span>
          : <span className="text-xs text-gray-300">—</span>;
      },
      enableSorting: false,
    }),
    // Departman column — colored chip from the task's department
    columnHelper.accessor((row) => (row.department_id ? deptMeta[row.department_id]?.name ?? "" : ""), {
      id: "department",
      header: "Departman",
      cell: (info) => {
        const row = info.row.original;
        const meta = row.department_id ? deptMeta[row.department_id] : undefined;
        if (!meta) return <span className="text-xs text-gray-300">—</span>;
        const badge = getDepartmentBadge(meta.color);
        // Soft, ringed pill in the department colour. Long names wrap to a
        // controlled 2 lines instead of clipping mid-word.
        return (
          <span
            className={cn(
              "inline-flex items-start gap-1.5 max-w-[15rem] rounded-xl py-1 pl-2 pr-2.5 text-[11px] font-medium ring-1",
              badge.chip,
              badge.ring,
            )}
            title={meta.name}
          >
            <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
            <span className="line-clamp-2 leading-snug text-left">{meta.name}</span>
          </span>
        );
      },
      sortingFn: (a, b) => {
        const na = a.original.department_id ? deptMeta[a.original.department_id]?.name ?? "" : "";
        const nb = b.original.department_id ? deptMeta[b.original.department_id]?.name ?? "" : "";
        return na.localeCompare(nb, "tr", { sensitivity: "base" });
      },
    }),
    // Konu column (changing topic; stored under legacy custom_fields.category)
    columnHelper.accessor((row) => safeCategory(row), {
      id: "konu",
      header: "Konu",
      cell: (info) => {
        const val = info.getValue();
        return val
          ? <span className="inline-block text-[11px] bg-[#eef0fb] text-[#4a4d9c] rounded-md px-2 py-0.5 max-w-[12rem] truncate align-middle" title={val}>{val}</span>
          : <span className="text-xs text-gray-300">—</span>;
      },
      sortingFn: (a, b) => {
        const ca = safeCategory(a.original);
        const cb = safeCategory(b.original);
        return ca.localeCompare(cb, "tr", { sensitivity: "base" });
      },
    }),
    columnHelper.accessor("status", {
      id: "status",
      header: FIELD_LABELS.status,
      cell: (info) => <StatusBadge task={info.row.original} />,
      sortingFn: (a, b) => {
        const order: TaskStatus[] = ["backlog", "ready", "in_progress", "review", "blocked", "done", "archived"];
        return order.indexOf(a.original.status) - order.indexOf(b.original.status);
      },
    }),
    columnHelper.accessor("priority", {
      id: "priority",
      header: FIELD_LABELS.priority,
      cell: (info) => <PriorityBadge priority={info.getValue()} />,
      sortingFn: (a, b) =>
        PRIORITY_ORDER[a.original.priority] - PRIORITY_ORDER[b.original.priority],
    }),
    columnHelper.accessor("due_date", {
      id: "due_date",
      header: FIELD_LABELS.dueDate,
      cell: (info) => {
        const val = info.getValue();
        if (!val) return <span className="text-xs text-gray-300">—</span>;
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = val < today;
        return (
          <span className={cn("text-xs whitespace-nowrap", isOverdue ? "text-red-500 font-medium" : "text-gray-500")}>
            {isOverdue ? "⚠ " : ""}
            {formatDateTR(val as string, { day: "numeric", month: "short" })}
          </span>
        );
      },
      sortingFn: (a, b) => {
        const da = a.original.due_date ?? "9999-12-31";
        const db = b.original.due_date ?? "9999-12-31";
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
    // Responsible column — reads assignee_id or responsible_contact_id
    columnHelper.accessor(
      (row) => responsibleNames[row.assignee_id ?? ""] ?? responsibleNames[(row as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "",
      {
        id: "responsible",
        header: FIELD_LABELS.assignee,
        cell: (info) => <span className="text-xs text-gray-500">{info.getValue() || "—"}</span>,
        sortingFn: (a, b) => {
          const na = responsibleNames[a.original.assignee_id ?? ""] ?? responsibleNames[(a.original as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "";
          const nb = responsibleNames[b.original.assignee_id ?? ""] ?? responsibleNames[(b.original as { responsible_contact_id?: string | null }).responsible_contact_id ?? ""] ?? "";
          return na.localeCompare(nb, "tr", { sensitivity: "base" });
        },
      }
    ),
    // Collaborators — reads custom_fields.collaborators (string[])
    columnHelper.accessor(
      (row) => {
        try {
          const cf = row.custom_fields;
          if (!cf || typeof cf !== "object" || Array.isArray(cf)) return "";
          const c = (cf as Record<string, unknown>).collaborators;
          if (Array.isArray(c)) return c.join(", ");
          if (typeof c === "string") return c;
          return "";
        } catch { return ""; }
      },
      {
        id: "collaborators",
        header: "İş birliği",
        cell: (info) => {
          const val = info.getValue();
          return val
            ? <span className="text-xs text-gray-500">{val}</span>
            : <span className="text-xs text-gray-300">—</span>;
        },
        enableSorting: false,
      }
    ),
    // Oluşturan — who created the task + when (mirrors the note/card metadata).
    columnHelper.accessor(
      (row) => (row.created_by ? responsibleNames[row.created_by] ?? "" : ""),
      {
        id: "creator",
        header: "Oluşturan",
        cell: (info) => {
          const name = info.getValue();
          const created = info.row.original.created_at;
          if (!name && !created) return <span className="text-xs text-gray-300">—</span>;
          return (
            <div className="leading-tight">
              {name && <span className="text-xs text-gray-600 block">{name}</span>}
              {created && (
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {formatDateTR(created as string, { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          );
        },
        sortingFn: (a, b) => {
          const na = a.original.created_by ? responsibleNames[a.original.created_by] ?? "" : "";
          const nb = b.original.created_by ? responsibleNames[b.original.created_by] ?? "" : "";
          return na.localeCompare(nb, "tr", { sensitivity: "base" });
        },
      }
    ),
    columnHelper.accessor("updated_at", {
      id: "updated_at",
      header: FIELD_LABELS.updatedAt,
      cell: (info) => (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {formatDateTR(info.getValue() as string, { day: "numeric", month: "short" })}
        </span>
      ),
      sortingFn: (a, b) => {
        const da = a.original.updated_at;
        const db = b.original.updated_at;
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
    // Hidden: created_at — present so TanStack can sort on it without crashing
    columnHelper.accessor("created_at", {
      id: "created_at",
      header: "Oluşturuldu",
      cell: () => null,
      sortingFn: (a, b) => {
        const da = a.original.created_at;
        const db = b.original.created_at;
        return da < db ? -1 : da > db ? 1 : 0;
      },
    }),
  ], [responsibleNames, deptMeta]); // closure deps

  const table = useReactTable({
    data: filteredTasks,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function SortIcon({ isSorted }: { isSorted: "asc" | "desc" | false }) {
    if (isSorted === "asc") return <ArrowUp size={12} className="ml-1 inline" />;
    if (isSorted === "desc") return <ArrowDown size={12} className="ml-1 inline" />;
    return <ArrowUpDown size={12} className="ml-1 inline opacity-30" />;
  }

  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    // Desktop: fixed-height shell, table scrolls internally. Mobile (max-md):
    // natural height so tabs + filters scroll away and the card list flows.
    <div className="flex flex-col h-full max-md:h-auto max-md:min-h-full">
      {/* Saved views tab strip */}
      {savedViews.length > 0 && (
        <div className="flex gap-0 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto no-scrollbar shrink-0">
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
          value={filterStatusKey}
          onChange={(e) => setFilterStatusKey(e.target.value as StatusFilterKey)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
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
        {/* Kişi filtresi — seçilen kişinin (üye veya kişi) görevlerini gösterir. */}
        <select
          value={personFilter}
          onChange={(e) => handlePersonChange(e.target.value)}
          aria-label="Kişiye göre filtrele"
          className={cn(
            "rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors",
            personFilter ? "border-blue-400 text-blue-700" : "border-gray-200 text-gray-600",
          )}
        >
          <option value="">Tüm kişiler</option>
          {personOptions.members.length > 0 && (
            <optgroup label="Üyeler">
              {personOptions.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </optgroup>
          )}
          {personOptions.contacts.length > 0 && (
            <optgroup label="Kişiler">
              {personOptions.contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="ml-auto text-xs text-gray-400 self-center">{totalRows} görev</span>
      </div>

      {/* Active person filter banner — makes a deep-link from CRM explicit and
          gives a one-click way to clear it. */}
      {personFilter && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-blue-50/70 border-b border-blue-100 shrink-0">
          <span className="text-[13px] text-blue-800">
            <span className="font-semibold">{personDisplayName ?? "Seçili kişi"}</span> ile ilişkili görevler
          </span>
          <button
            onClick={() => handlePersonChange("")}
            className="text-[12px] font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            Filtreyi temizle
          </button>
        </div>
      )}

      {/* Mobile: card list (no horizontal table) — flows into the page scroll */}
      <div className="md:hidden bg-gray-50/40 px-3 py-3">
        {table.getRowModel().rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            Geçerli filtrelerle eşleşen görev yok
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {table.getRowModel().rows.map((row) => (
              <MobileTaskCard
                key={row.id}
                task={row.original}
                deptMeta={deptMeta}
                responsibleNames={responsibleNames}
              />
            ))}
          </div>
        )}
      </div>

      {/* Table — desktop / tablet */}
      <div className="hidden md:block flex-1 overflow-auto bg-gray-50/40">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap select-none",
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
                <tr
                  key={row.id}
                  className={cn(
                    "transition-colors",
                    row.original.status === "done" ? "bg-green-50/50 hover:bg-green-50" : "hover:bg-gray-50"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 align-middle",
                        cell.column.id === "title" && "w-full min-w-[14rem]",
                        cell.column.id === "department" && "min-w-[11rem]",
                      )}
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
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          isAdmin={isAdmin}
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
