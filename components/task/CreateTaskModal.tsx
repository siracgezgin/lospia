"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CARD_STATUS_OPTIONS,
} from "@/lib/utils/task-constants";
import { Avatar } from "@/components/ui/Avatar";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { cn } from "@/lib/utils/cn";
import { EFFORT_OPTIONS, EFFORT_LABELS, POINTS_UI_ENABLED, type EffortSize } from "@/lib/points/effort";
import {
  TASK_VISIBILITIES, VISIBILITY_LABELS, VISIBILITY_DESCRIPTIONS,
  DEFAULT_VISIBILITY, type TaskVisibility,
} from "@/lib/utils/visibility";
import { Lock } from "lucide-react";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

type BoardMember = { memberId: string; userId: string; name: string; isAdmin?: boolean };

interface Props {
  onClose: () => void;
  workspaceId: string;
  defaultStatus?: TaskStatus;
  defaultDueDate?: string;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
  departments?: WorkspaceDepartment[];
  members?: BoardMember[];
  deptMembers?: { department_id: string; member_id: string }[];
  // Effort is an admin-only lever; members never see or set it.
  isAdmin?: boolean;
  // Pre-select a visibility (e.g. the Yönetici Pano tab decides this).
  defaultVisibility?: TaskVisibility;
  // Restrict the responsible picker to owner/admin people regardless of
  // visibility — used by Yönetici Pano so manager work stays with managers.
  lockResponsibleToAdmins?: boolean;
  // Pre-select responsible people (workspace_members ids). Yönetici Pano seeds
  // this with the active manager (or the creating admin) so a new task lands in
  // the current filter immediately.
  defaultResponsibleIds?: string[];
}

const SIMPLE_STATUS_OPTIONS = CARD_STATUS_OPTIONS;

export function CreateTaskModal({
  onClose,
  workspaceId,
  defaultStatus = "ready",
  defaultDueDate = "",
  departments = [],
  members = [],
  isAdmin = false,
  defaultVisibility = DEFAULT_VISIBILITY,
  lockResponsibleToAdmins = false,
  defaultResponsibleIds = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Primary fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>(defaultResponsibleIds);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [effort, setEffort] = useState<EffortSize>("medium");
  // Visibility is admin-only; members always create 'workspace' tasks. Yönetici
  // Pano pre-selects the visibility that matches the active tab.
  const [visibility, setVisibility] = useState<TaskVisibility>(
    isAdmin ? defaultVisibility : "workspace",
  );

  const topDepts = useMemo(() => departments.filter((d) => d.parent_id === null), [departments]);
  const childDepts = useMemo(() => {
    const m: Record<string, WorkspaceDepartment[]> = {};
    for (const d of departments) if (d.parent_id) (m[d.parent_id] ??= []).push(d);
    return m;
  }, [departments]);

  // Everyone in the workspace can be responsible for any task — department
  // membership is organisational info only, never an assignment constraint.
  // The only narrowing is admin_only visibility (owner/admin people only).
  const eligibleMembers = useMemo<BoardMember[]>(() => {
    const adminsOnly = visibility === "admin_only" || lockResponsibleToAdmins;
    return adminsOnly ? members.filter((m) => m.isAdmin) : members;
  }, [members, visibility, lockResponsibleToAdmins]);

  // Switching to admin_only drops any already-picked non-admin responsibles.
  function handleVisibilityChange(value: TaskVisibility) {
    setVisibility(value);
    if (value === "admin_only") {
      const adminIds = new Set(members.filter((m) => m.isAdmin).map((m) => m.memberId));
      setResponsibleIds((prev) => prev.filter((id) => adminIds.has(id)));
    }
  }

  function toggleResponsible(memberId: string) {
    setResponsibleIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  // Department is informational — changing it never drops selected people.
  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
  }

  const workspaceIdMissing = !workspaceId || workspaceId.length < 10;

  // Start + due date are both mandatory for a manually created task.
  const datesMissing = !startDate || !dueDate;
  const dateOrderInvalid = !!startDate && !!dueDate && startDate > dueDate;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || workspaceIdMissing) return;
    setError(null);

    if (!startDate) { setError("Başlangıç tarihi zorunludur."); return; }
    if (!dueDate) { setError("Teslim tarihi zorunludur."); return; }
    if (dateOrderInvalid) { setError("Başlangıç tarihi teslim tarihinden sonra olamaz."); return; }

    startTransition(async () => {
      const result = await createTask({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        assignee_id: null,
        responsible_contact_id: null,
        department_id: departmentId || null,
        due_date: dueDate || null,
        start_date: startDate || null,
        effort_size: isAdmin ? effort : undefined,
        visibility: isAdmin ? visibility : undefined,
        require_schedule: true,
        tags: [],
        custom_fields: {},
        // Responsible people become tracked participants (completion rows) —
        // persisted server-side inside createTask so a failed write surfaces
        // here as an error instead of silently losing the selection.
        participant_member_ids: responsibleIds,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh(); // pull the newly created task into the board immediately
      onClose();
    });
  }

  const inputCls =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle " +
    "transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard " +
    "hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";
  const selectCls =
    "w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink " +
    "transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard " +
    "hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";
  const labelCls = "block text-[12px] font-medium text-muted mb-1";

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        className="anim-scale-in bg-surface rounded-modal border border-line shadow-drawer w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline sticky top-0 bg-surface z-10">
          <h2 className="text-base font-semibold tracking-tight text-ink">Görev oluştur</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="text-subtle hover:text-ink hover:bg-surface-muted active:scale-[0.98] rounded-lg p-1.5 transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* 1. İş başlığı */}
          <div>
            <label className={labelCls}>İş başlığı <span className="text-danger">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Görev / iş başlığı"
              required
              autoFocus
              className={inputCls}
            />
          </div>

          {/* 2. Açıklama / Stratejik adım */}
          <div>
            <label className={labelCls}>Açıklama / Stratejik adım</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Açıklama, hedef veya stratejik adım…"
              className={cn(inputCls, "resize-none")}
            />
          </div>

          {/* 3. Departman */}
          <div>
            <label className={labelCls}>Departman</label>
            <select
              value={departmentId}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className={selectCls}
            >
              <option value="">— Departman seçin</option>
              {topDepts.map((d) => (
                <optgroup key={d.id} label={d.name}>
                  <option value={d.id}>{d.name} (genel)</option>
                  {(childDepts[d.id] ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 4. Sorumlu kişiler — multi-select over ALL workspace members
              (department never filters assignment) */}
          <div>
            <label className={labelCls}>Sorumlu kişiler</label>
            {eligibleMembers.length === 0 ? (
              <p className="text-xs text-subtle bg-surface-muted border border-hairline rounded-lg px-3 py-2">
                Çalışma alanında üye yok.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {eligibleMembers.map((m) => {
                    const on = responsibleIds.includes(m.memberId);
                    return (
                      <button
                        key={m.memberId}
                        type="button"
                        onClick={() => toggleResponsible(m.memberId)}
                        aria-pressed={on}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors duration-150 active:scale-[0.98]",
                          on
                            ? "bg-brand-soft border-brand-ring text-brand-strong font-medium"
                            : "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong",
                        )}
                      >
                        <Avatar name={m.name} size="xs" />
                        {getPersonDisplayName(m.name)}
                        {on && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 6 + 7. Başlangıç tarihi + Teslim tarihi — both mandatory */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Başlangıç tarihi <span className="text-danger">*</span></label>
              <input
                type="date"
                value={startDate}
                required
                onChange={(e) => setStartDate(e.target.value)}
                className={cn(selectCls, "tabular-nums")}
              />
            </div>
            <div>
              <label className={labelCls}>Teslim tarihi <span className="text-danger">*</span></label>
              <input
                type="date"
                value={dueDate}
                min={startDate || undefined}
                required
                onChange={(e) => setDueDate(e.target.value)}
                className={cn(selectCls, "tabular-nums")}
              />
            </div>
          </div>
          {dateOrderInvalid && (
            <p className="anim-fade-down text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Başlangıç tarihi teslim tarihinden sonra olamaz.
            </p>
          )}

          {/* 8 + 9. Durum + Öncelik */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durum</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={selectCls}
              >
                {SIMPLE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Öncelik</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={selectCls}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Efor — Puan & Motivasyon kapalıyken çizilmez (POINTS_UI_ENABLED). */}
          {POINTS_UI_ENABLED && isAdmin && (
            <div>
              <label className={labelCls}>Efor</label>
              <div className="flex gap-2">
                {EFFORT_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEffort(e)}
                    aria-pressed={effort === e}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors duration-150 active:scale-[0.98]",
                      effort === e
                        ? "bg-brand-soft border-brand-ring text-brand-strong font-medium"
                        : "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong",
                    )}
                  >
                    {EFFORT_LABELS[e]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-subtle mt-1.5">
                Puan yalnızca yönetici onayından sonra kesinleşir.
              </p>
            </div>
          )}

          {/* Görünürlük — admin-only. Members always create 'workspace' tasks. */}
          {isAdmin && (
            <div>
              <label className={labelCls}>Görünürlük</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TASK_VISIBILITIES.map((v) => {
                  const on = visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleVisibilityChange(v)}
                      aria-pressed={on}
                      className={cn(
                        "text-left rounded-lg border px-3 py-2 transition-colors duration-150",
                        on
                          ? "bg-amber-50 border-amber-300"
                          : "bg-surface border-line hover:bg-surface-hover hover:border-line-strong",
                      )}
                    >
                      <span className={cn("flex items-center gap-1.5 text-sm font-medium", on ? "text-amber-800" : "text-ink")}>
                        {v === "admin_only" && <Lock size={12} />}
                        {VISIBILITY_LABELS[v]}
                      </span>
                      <span className="block text-[11px] text-muted mt-0.5 leading-snug">
                        {VISIBILITY_DESCRIPTIONS[v]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visibility === "admin_only" && (
                <p className="anim-fade-down text-[11px] text-amber-700 mt-1.5">
                  Bu görevde yalnızca yönetici kişiler sorumlu olarak seçilebilir.
                </p>
              )}
            </div>
          )}

          {workspaceIdMissing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Çalışma alanı bilgisi yüklenemedi. Sayfayı yenileyin.
            </p>
          )}

          {error && (
            <p role="alert" className="anim-fade-down text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-surface-muted active:scale-[0.98] rounded-lg transition-colors duration-150"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || workspaceIdMissing || datesMissing || dateOrderInvalid}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150",
                isPending || !title.trim() || workspaceIdMissing || datesMissing || dateOrderInvalid
                  ? "bg-surface-sunken text-subtle cursor-not-allowed"
                  : "bg-brand text-white shadow-xs hover:bg-brand-strong active:scale-[0.98]",
              )}
            >
              {isPending ? "Oluşturuluyor…" : "Görev oluştur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keep STATUS_LABELS exported for compatibility with other components that may import from here
export { STATUS_LABELS, TASK_STATUSES };
