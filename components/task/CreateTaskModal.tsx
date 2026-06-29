"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";
import { setTaskParticipants } from "@/lib/actions/completions";
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
import { EFFORT_OPTIONS, EFFORT_LABELS, type EffortSize } from "@/lib/points/effort";
import type { TaskStatus, TaskPriority, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

type BoardMember = { memberId: string; userId: string; name: string };

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
}

const SIMPLE_STATUS_OPTIONS = CARD_STATUS_OPTIONS;

export function CreateTaskModal({
  onClose,
  workspaceId,
  defaultStatus = "ready",
  defaultDueDate = "",
  departments = [],
  members = [],
  deptMembers = [],
  isAdmin = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Primary fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [konu, setKonu] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [effort, setEffort] = useState<EffortSize>("medium");

  const topDepts = useMemo(() => departments.filter((d) => d.parent_id === null), [departments]);
  const childDepts = useMemo(() => {
    const m: Record<string, WorkspaceDepartment[]> = {};
    for (const d of departments) if (d.parent_id) (m[d.parent_id] ??= []).push(d);
    return m;
  }, [departments]);

  // Members eligible as responsible people for the selected department: those
  // assigned to the department, its parent, or its direct children. With no
  // department chosen we offer every workspace member.
  const eligibleMembers = useMemo<BoardMember[]>(() => {
    if (!departmentId) return members;
    const self = departments.find((d) => d.id === departmentId);
    const related = new Set<string>([departmentId]);
    if (self?.parent_id) related.add(self.parent_id);
    for (const d of departments) if (d.parent_id === departmentId) related.add(d.id);
    const eligibleIds = new Set(
      deptMembers.filter((dm) => related.has(dm.department_id)).map((dm) => dm.member_id),
    );
    return members.filter((m) => eligibleIds.has(m.memberId));
  }, [departmentId, departments, deptMembers, members]);

  function toggleResponsible(memberId: string) {
    setResponsibleIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  }

  // Drop any previously-selected people who fall outside a newly chosen department.
  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
    if (value) {
      const self = departments.find((d) => d.id === value);
      const related = new Set<string>([value]);
      if (self?.parent_id) related.add(self.parent_id);
      for (const d of departments) if (d.parent_id === value) related.add(d.id);
      const eligibleIds = new Set(
        deptMembers.filter((dm) => related.has(dm.department_id)).map((dm) => dm.member_id),
      );
      setResponsibleIds((prev) => prev.filter((id) => eligibleIds.has(id)));
    }
  }

  const workspaceIdMissing = !workspaceId || workspaceId.length < 10;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || workspaceIdMissing) return;
    setError(null);

    const customFields: Record<string, unknown> = {};
    if (konu.trim()) customFields.category = konu.trim(); // stored under legacy key, shown as "Konu"

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
        tags: [],
        custom_fields: customFields,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Responsible people become tracked participants (completion rows).
      if (responsibleIds.length > 0) {
        await setTaskParticipants(result.id, responsibleIds);
      }
      router.refresh(); // pull the newly created task into the board immediately
      onClose();
    });
  }

  const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectCls = "w-full rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Görev oluştur</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* 1. İş başlığı */}
          <div>
            <label className={labelCls}>İş başlığı <span className="text-red-500">*</span></label>
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

          {/* 4. Konu */}
          <div>
            <label className={labelCls}>Konu</label>
            <input
              type="text"
              value={konu}
              onChange={(e) => setKonu(e.target.value)}
              placeholder="Bu işin konusu / bağlamı…"
              className={inputCls}
            />
          </div>

          {/* 5. Sorumlu kişiler — multi-select, filtered by department */}
          <div>
            <label className={labelCls}>Sorumlu kişiler</label>
            {eligibleMembers.length === 0 ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                {departmentId
                  ? "Bu departmana atanmış üye yok. Ayarlar > Departmanlar'dan üye ekleyin."
                  : "Çalışma alanında üye yok."}
              </p>
            ) : (
              <>
                {!departmentId && (
                  <p className="text-[11px] text-gray-400 mb-1.5">
                    İpucu: Önce departman seçerseniz liste o departmanın üyeleriyle daralır.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {eligibleMembers.map((m) => {
                    const on = responsibleIds.includes(m.memberId);
                    return (
                      <button
                        key={m.memberId}
                        type="button"
                        onClick={() => toggleResponsible(m.memberId)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors",
                          on
                            ? "bg-blue-50 border-blue-300 text-blue-700"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
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

          {/* 6 + 7. Başlangıç tarihi + Teslim tarihi */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Başlangıç tarihi</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={selectCls}
              />
            </div>
            <div>
              <label className={labelCls}>Teslim tarihi</label>
              <input
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                className={selectCls}
              />
            </div>
          </div>

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

          {/* Efor — admin-only. Members never see point values. */}
          {isAdmin && (
            <div>
              <label className={labelCls}>Efor</label>
              <div className="flex gap-2">
                {EFFORT_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEffort(e)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                      effort === e
                        ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {EFFORT_LABELS[e]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Puan yalnızca yönetici onayından sonra kesinleşir.
              </p>
            </div>
          )}

          {workspaceIdMissing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Çalışma alanı bilgisi yüklenemedi. Sayfayı yenileyin.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || workspaceIdMissing}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                isPending || !title.trim() || workspaceIdMissing
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700",
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
