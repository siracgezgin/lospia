"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Lock, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { BOARD_COLUMNS, getTaskColId, STATUS_LABELS, PRIORITY_LABELS, type BoardColId } from "@/lib/utils/task-constants";
import {
  getTaskCardStyle,
  getDepartmentCardStyle,
  getTaskStateMarkers,
  PRIORITY_CHIP,
  PRIORITY_SHOW_ON_BOARD,
  STATUS_CHIP_TONE,
  BOARD_COL_HEADER_TONE,
} from "@/lib/design/semantics";
import { buildDeptMeta } from "@/lib/utils/departments";
import { formatDateTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { asVisibility, ADMIN_ONLY_CHIP_LABEL, VISIBILITY_LABELS, type TaskVisibility } from "@/lib/utils/visibility";
import { CreateTaskModal } from "@/components/task/CreateTaskModal";
import { canCreateTask } from "@/lib/auth/permissions";
import type { Task, Profile, WorkspaceContact, WorkspaceDepartment, WorkspaceRole } from "@/types";

type BoardMember = { memberId: string; userId: string; name: string; isAdmin?: boolean };
export type ManagerOption = { userId: string; name: string };

interface Props {
  tasks: Task[];
  // Canonical responsible user_ids per task (participants ∪ assignee fallback).
  responsibleByTask: Record<string, string[]>;
  managers: ManagerOption[];
  workspaceId: string;
  userId: string;
  userRole: WorkspaceRole;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments: WorkspaceDepartment[];
  members: BoardMember[];
  deptMembers: { department_id: string; member_id: string }[];
  initialVisibility: TaskVisibility;
  initialManager: string; // "all" | userId
}

const MANAGER_ALL = "all";

export function AdminBoardView({
  tasks,
  responsibleByTask,
  managers,
  workspaceId,
  userId,
  userRole,
  profiles,
  contacts,
  departments,
  members,
  deptMembers,
  initialVisibility,
  initialManager,
}: Props) {
  const router = useRouter();
  const deptMeta = useMemo(() => buildDeptMeta(departments), [departments]);
  const canCreate = canCreateTask(userRole);

  const [visibility, setVisibility] = useState<TaskVisibility>(initialVisibility);
  const [managerFilter, setManagerFilter] = useState<string>(initialManager);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileCol, setMobileCol] = useState<BoardColId>("yapilacak");

  const managerIds = useMemo(() => new Set(managers.map((m) => m.userId)), [managers]);
  const managerNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mgr of managers) m[mgr.userId] = mgr.name;
    return m;
  }, [managers]);

  // Top-level departments for the filter, plus the parent→{self,children} match set.
  const topDepts = useMemo(
    () => departments.filter((d) => d.parent_id === null).map((d) => ({ id: d.id, name: d.name })),
    [departments],
  );
  const deptMatchIds = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const d of departments.filter((x) => x.parent_id === null)) {
      const set = new Set<string>([d.id]);
      for (const c of departments.filter((x) => x.parent_id === d.id)) set.add(c.id);
      map[d.id] = set;
    }
    return map;
  }, [departments]);

  // Keep URL in sync so a Yönetici Pano state is shareable/bookmarkable.
  const syncUrl = useCallback(
    (vis: TaskVisibility, mgr: string) => {
      const params = new URLSearchParams();
      params.set("visibility", vis);
      if (mgr !== MANAGER_ALL) params.set("manager", mgr);
      router.replace(`/admin-board?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  function changeVisibility(vis: TaskVisibility) {
    setVisibility(vis);
    syncUrl(vis, managerFilter);
  }
  function changeManager(mgr: string) {
    setManagerFilter(mgr);
    syncUrl(visibility, mgr);
  }

  // ── Filter pipeline: visibility tab → manager → department → search ─────────
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (asVisibility(t.visibility) !== visibility) return false;

      const resp = responsibleByTask[t.id] ?? [];
      if (managerFilter === MANAGER_ALL) {
        // "Tüm yöneticiler": admin_only tasks are managers-only by construction,
        // so show them all; the workspace tab keeps only manager-owned work.
        if (visibility === "workspace" && !resp.some((uid) => managerIds.has(uid))) {
          return false;
        }
      } else if (!resp.includes(managerFilter)) {
        return false;
      }

      if (departmentFilter) {
        const allowed = deptMatchIds[departmentFilter] ?? new Set([departmentFilter]);
        if (t.department_id == null || !allowed.has(t.department_id)) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        const cf = (t.custom_fields ?? {}) as Record<string, unknown>;
        const konu = String(cf?.category ?? "").toLowerCase();
        const deptName = (t.department_id ? deptMeta[t.department_id]?.name ?? "" : "").toLowerCase();
        const respNames = (responsibleByTask[t.id] ?? [])
          .map((uid) => (managerNameById[uid] ?? "").toLowerCase())
          .join(" ");
        const hay =
          t.title.toLowerCase() +
          " " +
          (t.description ?? "").toLowerCase() +
          " " +
          konu +
          " " +
          deptName +
          " " +
          respNames;
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    tasks,
    visibility,
    managerFilter,
    managerIds,
    responsibleByTask,
    departmentFilter,
    deptMatchIds,
    search,
    deptMeta,
    managerNameById,
  ]);

  // Distribute into the four operational columns (no Notes column).
  const columns = useMemo(() => {
    const map: Record<BoardColId, Task[]> = {
      yapilacak: [],
      devam_ediyor: [],
      kontrol_onay: [],
      tamamlandi: [],
    };
    for (const t of filtered) map[getTaskColId(t.status)].push(t);
    return map;
  }, [filtered]);

  const hasFilter = !!departmentFilter || !!search || managerFilter !== MANAGER_ALL;

  function clearFilters() {
    setDepartmentFilter("");
    setSearch("");
    changeManager(MANAGER_ALL);
  }

  const inputCls =
    "rounded-lg border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-line bg-surface px-4 pt-4 pb-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} className="text-brand shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-ink truncate">Yönetici Pano</h1>
              <p className="text-[11px] text-subtle hidden sm:block">
                Yalnızca yöneticilere ait işlerin operasyon takibi.
              </p>
            </div>
          </div>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus size={15} /> <span className="hidden sm:inline">Görev oluştur</span>
            </button>
          )}
        </div>

        {/* Visibility tabs */}
        <div className="mt-3 inline-flex rounded-lg border border-line bg-surface-muted p-0.5">
          {(["admin_only", "workspace"] as TaskVisibility[]).map((v) => {
            const on = visibility === v;
            return (
              <button
                key={v}
                onClick={() => changeVisibility(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {v === "admin_only" && <Lock size={12} />}
                {VISIBILITY_LABELS[v]}
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Department */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={cn(
              inputCls,
              departmentFilter ? "border-[#406775] text-[#406775]" : "border-gray-200 text-gray-600",
            )}
          >
            <option value="">Tüm departmanlar</option>
            {topDepts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Manager — only owner/admin people */}
          <select
            value={managerFilter}
            onChange={(e) => changeManager(e.target.value)}
            className={cn(
              inputCls,
              managerFilter !== MANAGER_ALL ? "border-blue-400 text-blue-700" : "border-gray-200 text-gray-600",
            )}
          >
            <option value={MANAGER_ALL}>Tüm yöneticiler</option>
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {getPersonDisplayName(m.name)}
              </option>
            ))}
          </select>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara…"
              className={cn(inputCls, "border-gray-200 pl-8 w-40")}
            />
          </div>

          {hasFilter && (
            <button
              onClick={clearFilters}
              className="text-[12px] text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Filtreleri temizle
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile column switcher ──────────────────────────────────────── */}
      <div className="md:hidden shrink-0 flex border-b border-line bg-surface">
        {BOARD_COLUMNS.map((col) => {
          const on = mobileCol === col.id;
          return (
            <button
              key={col.id}
              onClick={() => setMobileCol(col.id)}
              className={cn(
                "relative flex-1 px-1 py-2 text-[11px] font-medium transition-colors",
                on ? "text-brand" : "text-muted",
              )}
            >
              {col.label}
              <span className="ml-1 tabular-nums text-[10px] text-subtle">{columns[col.id].length}</span>
              {on && <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-t bg-brand" />}
            </button>
          );
        })}
      </div>

      {/* ── Board ───────────────────────────────────────────────────────── */}
      {/* Desktop: 4 columns */}
      <div className="hidden md:flex flex-1 gap-3 overflow-x-auto p-4 md:p-6">
        {BOARD_COLUMNS.map((col) => (
          <AdminColumn
            key={col.id}
            label={col.label}
            colId={col.id}
            tasks={columns[col.id]}
            deptMeta={deptMeta}
            managerIds={managerIds}
            managerNameById={managerNameById}
            responsibleByTask={responsibleByTask}
            showVisibilityChip={visibility === "admin_only"}
          />
        ))}
      </div>

      {/* Mobile: single active column, full width */}
      <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2">
        {columns[mobileCol].length === 0 ? (
          <EmptyState />
        ) : (
          columns[mobileCol].map((t) => (
            <AdminCard
              key={t.id}
              task={t}
              deptMeta={deptMeta}
              managerIds={managerIds}
              managerNameById={managerNameById}
              responsibleByTask={responsibleByTask}
              showVisibilityChip={visibility === "admin_only"}
            />
          ))
        )}
      </div>

      {createOpen && (
        <CreateTaskModal
          onClose={() => setCreateOpen(false)}
          workspaceId={workspaceId}
          profiles={profiles}
          contacts={contacts}
          departments={departments}
          members={members}
          deptMembers={deptMembers}
          isAdmin
          defaultVisibility={visibility}
          lockResponsibleToAdmins
        />
      )}
    </div>
  );
}

// ── Column ──────────────────────────────────────────────────────────────────

function AdminColumn({
  label,
  colId,
  tasks,
  deptMeta,
  managerIds,
  managerNameById,
  responsibleByTask,
  showVisibilityChip,
}: {
  label: string;
  colId: BoardColId;
  tasks: Task[];
  deptMeta: ReturnType<typeof buildDeptMeta>;
  managerIds: Set<string>;
  managerNameById: Record<string, string>;
  responsibleByTask: Record<string, string[]>;
  showVisibilityChip: boolean;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-surface-muted/60">
      <div
        className={cn(
          "flex items-center justify-between rounded-t-xl px-3 py-2 text-[12px] font-semibold",
          BOARD_COL_HEADER_TONE[colId] ?? "text-ink",
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums text-subtle">{tasks.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] text-subtle">Görev yok</p>
        ) : (
          tasks.map((t) => (
            <AdminCard
              key={t.id}
              task={t}
              deptMeta={deptMeta}
              managerIds={managerIds}
              managerNameById={managerNameById}
              responsibleByTask={responsibleByTask}
              showVisibilityChip={showVisibilityChip}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Card (read-focused; click → task detail) ─────────────────────────────────

function AdminCard({
  task,
  deptMeta,
  managerIds,
  managerNameById,
  responsibleByTask,
  showVisibilityChip,
}: {
  task: Task;
  deptMeta: ReturnType<typeof buildDeptMeta>;
  managerIds: Set<string>;
  managerNameById: Record<string, string>;
  responsibleByTask: Record<string, string[]>;
  showVisibilityChip: boolean;
}) {
  const dept = task.department_id ? deptMeta[task.department_id] : undefined;
  const style = getTaskCardStyle(task.status, dept?.color);
  const deptStyle = getDepartmentCardStyle(dept?.color);
  const markers = getTaskStateMarkers(task);
  const showPriority = PRIORITY_SHOW_ON_BOARD[task.priority];
  const cf = (task.custom_fields ?? {}) as Record<string, unknown>;
  const konu = cf?.category as string | undefined;

  // Only the manager responsibles get avatars here — this is a manager board.
  const managerNames = (responsibleByTask[task.id] ?? [])
    .filter((uid) => managerIds.has(uid))
    .map((uid) => managerNameById[uid] ?? "")
    .filter(Boolean);

  // No cn() on the colour classes — tailwind-merge strips border-l-*.
  const colorCls = `${style.surface} ${style.border} ${style.accent}`;

  return (
    <Link
      prefetch={false}
      href={`/tasks/${task.id}`}
      className={`block rounded-lg border border-l-[3px] p-3 shadow-card hover:shadow-pop transition-shadow ${colorCls}`}
    >
      {/* Chips row */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {dept && (
          <Badge size="xs" dot={deptStyle.dot} className={cn("max-w-36 truncate", deptStyle.chip)}>
            {dept.name}
          </Badge>
        )}
        {markers.chip && (
          <Badge size="xs" className={cn("max-w-32 truncate", markers.chip.className)}>
            {markers.chip.label}
          </Badge>
        )}
        {showPriority && (
          <Badge size="xs" className={cn("shrink-0", PRIORITY_CHIP[task.priority])}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
        )}
        {showVisibilityChip && asVisibility(task.visibility) === "admin_only" && (
          <Badge size="xs" className="shrink-0 border border-amber-200 bg-amber-50 text-amber-700">
            <Lock size={9} className="mr-0.5" /> {ADMIN_ONLY_CHIP_LABEL}
          </Badge>
        )}
      </div>

      {/* Title */}
      <p
        className={cn(
          "block text-[13px] font-medium leading-snug tracking-[-0.005em] line-clamp-2",
          markers.shouldStrike ? "text-success/90 line-through decoration-success/40" : "text-ink",
        )}
      >
        {task.title}
      </p>

      {konu && <p className="mt-0.5 truncate text-[10px] text-subtle/90">Konu: {konu}</p>}
      {task.description && (
        <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-subtle">{task.description}</p>
      )}

      {/* Bottom row: status + due + responsible managers */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
            STATUS_CHIP_TONE[task.status] ?? "bg-gray-100 text-gray-600",
          )}
        >
          {STATUS_LABELS[task.status]}
        </span>
        {task.due_date && (
          <span className={cn("flex items-center gap-0.5 text-[10px]", markers.dueDateClass)}>
            {markers.overdue && <AlertTriangle size={9} />}
            {formatDateTR(task.due_date, { day: "numeric", month: "short" })}
          </span>
        )}
        {managerNames.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {managerNames.slice(0, 3).map((name, i) => (
              <Avatar key={`${name}-${i}`} name={name} size="xs" className="ring-1 ring-white" />
            ))}
            {managerNames.length > 3 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[8px] font-medium text-gray-600 ring-1 ring-white">
                +{managerNames.length - 3}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-subtle">Bu görünümde görev yok.</p>
    </div>
  );
}
