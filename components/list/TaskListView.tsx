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
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, Plus, FileSpreadsheet, Lock, ClipboardList } from "lucide-react";
import { ADMIN_ONLY_CHIP_LABEL } from "@/lib/utils/visibility";
import type { Task, SavedView, TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  CARD_STATUS_OPTIONS,
  SAVED_VIEW_SLUG_MAP,
} from "@/lib/utils/task-constants";
import { ViewTabs, VIEW_META, type ViewTabItem } from "@/components/shared/ViewTabs";
import { FIELD_LABELS } from "@/lib/i18n/tr";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { buildDeptMeta } from "@/lib/utils/departments";
import { resolvePersonDescriptor, resolvePersonName, taskMatchesPerson } from "@/lib/utils/task-person-match";
import { getDepartmentBadge, STATUS_CHIP_TONE, PRIORITY_CHIP } from "@/lib/design/semantics";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { CsvImportModal } from "@/components/task/CsvImportModal";

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
  // View seed from the URL (?view=<slug>) — same vocabulary as the Board.
  initialView?: string;
}

// ── Shared view semantics (mirrors the Board's applyViewFilter) ──────────────
// The List speaks the SAME six views as the Board so switching surfaces never
// changes what a view means. Kept LOCAL (not in the presentational ViewTabs
// helper) so filter logic stays with the surface that owns the data. Weekly
// membership is DUE-DATE-ONLY and applies to EXACTLY "Bu hafta" — every other
// view is week-independent. Unlike the Board there is no week navigator here,
// so "Bu hafta" always means the CURRENT Monday–Sunday range.
function listLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function listMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

const LIST_VIEW_DESCRIPTIONS: Record<string, string> = {
  "all":              "Tüm erişilebilir görevler",
  "mine":             "Üzerinizdeki tüm görevler — haftadan bağımsız",
  "this-week":        "Bu haftanın son tarihli görevleri",
  "overdue":          "Son tarihi geçmiş açık görevler — haftadan bağımsız",
  "done":             "Tamamlanmış tüm görevler — haftadan bağımsız",
  "waiting-approval": "Kontrol/onay bekleyen tüm görevler — haftadan bağımsız",
};

function applyListView(tasks: Task[], slug: string, userId: string): Task[] {
  const today = listLocalISO(new Date());
  const monday = listMondayOf(new Date());
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const mondayStr = listLocalISO(monday);
  const sundayStr = listLocalISO(sunday);
  const dueDay = (t: Task) => (t.due_date ? t.due_date.slice(0, 10) : null);
  const live = (t: Task) => t.status !== "archived" && !t.deleted_at && !t.archived_at;

  switch (slug) {
    case "mine":
      return tasks.filter((t) => live(t) && t.assignee_id === userId);
    case "overdue":
      return tasks.filter((t) => {
        if (!live(t) || t.status === "done") return false;
        const d = dueDay(t);
        return d !== null && d < today;
      });
    case "done":
      return tasks.filter((t) => t.status === "done" && !t.deleted_at && !t.archived_at);
    case "waiting-approval":
      return tasks.filter((t) => {
        if (!live(t) || t.status === "done") return false;
        return (
          t.status === "review" ||
          t.approval_required === true ||
          t.waiting_on_member_id != null ||
          t.waiting_on_contact_id != null
        );
      });
    case "this-week":
      return tasks.filter((t) => {
        if (!live(t)) return false;
        const d = dueDay(t);
        return d !== null && d >= mondayStr && d <= sundayStr;
      });
    case "all":
    default:
      return tasks;
  }
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
    <div className="group/status relative inline-flex items-center">
      <span className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium rounded-full pl-2 pr-1.5 py-0.5 whitespace-nowrap pointer-events-none",
        STATUS_CHIP_TONE[optimisticStatus],
      )}>
        {SIMPLIFIED_STATUS_LABEL[optimisticStatus]}
        <ChevronDown
          size={10}
          strokeWidth={2.5}
          className="shrink-0 opacity-50 transition-opacity duration-150 group-hover/status:opacity-90"
        />
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
      PRIORITY_CHIP[priority],
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
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !!task.due_date && task.due_date < today && task.status !== "done";

  return (
    <Link
      prefetch={false}
      href={`/tasks/${task.id}`}
      className="block rounded-card border border-line bg-surface p-3.5 shadow-card active:bg-surface-hover transition-colors duration-[var(--duration-fast)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink line-clamp-2 leading-snug flex-1 min-w-0">
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
        <p className="text-xs text-subtle mt-1 line-clamp-1">{task.description}</p>
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
          <span className={cn("text-[11px] font-medium whitespace-nowrap", isOverdue ? "text-danger" : "text-muted")}>
            {isOverdue ? "⚠ " : ""}
            {formatDateTR(task.due_date, { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Sorumlu kişi en altta — "görev oluşturan" satırı geri bildirimle kaldırıldı. */}
      {responsible && (
        <p className="mt-2 text-[11px] text-subtle truncate">
          Sorumlu: <span className="font-medium text-muted">{responsible}</span>
        </p>
      )}
    </Link>
  );
}

// ---- Main component ----

export function TaskListView({ tasks, savedViews, workspaceId, userId, profiles, contacts, departments = [], members = [], deptMembers = [], isAdmin = false, initialPerson = "", initialView = "" }: Props) {
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
  // Active view (same six as the Board). Unknown/legacy values fall back to the
  // full "Tüm işler" list so the table never opens filtered to nothing.
  const KNOWN_VIEW_SLUGS = ["all", "mine", "this-week", "overdue", "done", "waiting-approval"];
  const [viewSlug, setViewSlug] = useState<string>(
    KNOWN_VIEW_SLUGS.includes(initialView) ? initialView : "all",
  );
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

  // View lens first (all / mine / this-week / overdue / done / waiting-approval),
  // then the toolbar filters compose on top — mirrors the Board's filter order.
  const viewedTasks = useMemo(
    () => applyListView(tasks, viewSlug, userId),
    [tasks, viewSlug, userId],
  );

  const filteredTasks = useMemo(() => viewedTasks.filter((t) => {
    if (allowedStatuses.length > 0 && !allowedStatuses.includes(t.status)) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (personDescriptor && !taskMatchesPerson(t, personDescriptor)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [viewedTasks, allowedStatuses, filterPriority, personDescriptor, search]);

  // Switch view without a full reload: update local state + the URL (?view=…),
  // preserving the person filter already in the query string.
  const handleViewChange = useCallback((slug: string) => {
    setViewSlug(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug && slug !== "all") params.set("view", slug);
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/list?${qs}` : "/list", { scroll: false });
  }, [router, searchParams]);

  // Build the shared view-tab strip from the workspace saved views, mapped to the
  // canonical slugs. "Bu hafta" is set apart with a divider (as on the Board).
  const viewTabItems = useMemo<ViewTabItem[]>(() => {
    return savedViews
      .map((view): ViewTabItem => {
        const slug = SAVED_VIEW_SLUG_MAP[view.name] ?? view.id;
        return {
          slug,
          label: view.name,
          icon: VIEW_META[slug as keyof typeof VIEW_META]?.icon,
          active: viewSlug === slug,
          dividerBefore: false,
        };
      })
      // "Bu hafta" sekmesi gizlendi — haftalık bölümleme kaldırıldı (geri alınabilir).
      .filter((it) => KNOWN_VIEW_SLUGS.includes(it.slug) && it.slug !== "this-week");
  }, [savedViews, viewSlug]); // eslint-disable-line react-hooks/exhaustive-deps -- KNOWN_VIEW_SLUGS is a stable literal

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
            className="font-medium text-ink hover:text-brand text-sm line-clamp-2 block leading-snug break-words transition-colors duration-[var(--duration-fast)]"
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
                <span key={`${info.row.original.id}-tag-${i}`} className="text-[10px] bg-brand-soft text-brand rounded px-1 py-0.5 leading-none">
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
          ? <span className="text-xs text-subtle italic line-clamp-1">{val}</span>
          : <span className="text-xs text-subtle">—</span>;
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
        if (!meta) return <span className="text-xs text-subtle">—</span>;
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
          : <span className="text-xs text-subtle">—</span>;
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
        if (!val) return <span className="text-xs text-subtle">—</span>;
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = val < today;
        return (
          <span className={cn("text-xs whitespace-nowrap", isOverdue ? "text-danger font-medium" : "text-muted")}>
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
        cell: (info) => <span className="text-xs text-muted">{info.getValue() || "—"}</span>,
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
            ? <span className="text-xs text-muted">{val}</span>
            : <span className="text-xs text-subtle">—</span>;
        },
        enableSorting: false,
      }
    ),
    // "Oluşturan" kolonu geri bildirimle kaldırıldı — sorumlu kişi kolonu (üstte
    // "responsible") görev sahipliğini gösterir.
    columnHelper.accessor("updated_at", {
      id: "updated_at",
      header: FIELD_LABELS.updatedAt,
      cell: (info) => (
        <span className="text-xs text-subtle whitespace-nowrap">
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
      {/* Shared segmented view tabs — identical vocabulary + styling to the Board
          (Tüm işler / Bana atananlar / Bu hafta / Gecikenler / Tamamlananlar /
          Onay bekleyenler). Client-side selection keeps the person filter. */}
      {viewTabItems.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-line bg-surface shrink-0 space-y-1.5">
          <ViewTabs iconsEverywhere items={viewTabItems} onSelect={handleViewChange} />
          <p className="text-xs text-subtle">{LIST_VIEW_DESCRIPTIONS[viewSlug] ?? ""}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-surface border-b border-hairline shrink-0">
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          Görev oluştur
        </Button>
        {/* CSV içe aktar — geri bildirimle şimdilik gizlendi (kod/action korunur). */}
        {false && isAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={14} />
            CSV&apos;den içe aktar
          </Button>
        )}
        <div className="w-px h-5 bg-line mx-1" />
        <Input
          type="search"
          placeholder="Görev ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Görev ara"
          className="h-8 w-52"
        />
        <select
          value={filterStatusKey}
          onChange={(e) => setFilterStatusKey(e.target.value as StatusFilterKey)}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-muted focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 transition-colors"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-muted focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 transition-colors"
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
            "rounded-lg border bg-surface px-2 py-1.5 text-sm focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 transition-colors",
            personFilter ? "border-brand-ring text-brand font-medium" : "border-line text-muted",
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
        <span className="ml-auto text-xs text-subtle self-center">{totalRows} görev</span>
      </div>

      {/* Active person filter banner — makes a deep-link from CRM explicit and
          gives a one-click way to clear it. */}
      {personFilter && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-brand-soft border-b border-brand-ring/30 shrink-0">
          <span className="text-[13px] text-brand-strong">
            <span className="font-semibold">{personDisplayName ?? "Seçili kişi"}</span> ile ilişkili görevler
          </span>
          <button
            onClick={() => handlePersonChange("")}
            className="text-[12px] font-medium text-brand hover:text-brand-strong underline underline-offset-2"
          >
            Filtreyi temizle
          </button>
        </div>
      )}

      {/* Mobile: card list (no horizontal table) — flows into the page scroll */}
      <div className="md:hidden bg-app px-3 py-3">
        {table.getRowModel().rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Görev bulunamadı"
            description="Geçerli filtrelerle eşleşen görev yok."
          />
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
      <div className="hidden md:block flex-1 overflow-auto bg-app">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-surface-muted/90 border-b border-hairline sticky top-0 z-10 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap select-none",
                      header.column.getCanSort() && "cursor-pointer hover:text-ink transition-colors duration-[var(--duration-fast)]"
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
          <tbody className="divide-y divide-hairline bg-surface">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="Görev bulunamadı"
                    description="Geçerli filtrelerle eşleşen görev yok."
                  />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "transition-colors duration-[var(--duration-fast)]",
                    row.original.status === "done" ? "bg-green-50/50 hover:bg-green-50" : "hover:bg-surface-hover"
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
        <CsvImportModal onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
