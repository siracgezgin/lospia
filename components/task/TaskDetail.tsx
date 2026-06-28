"use client";

import { useState, useEffect, useTransition, useOptimistic, useMemo } from "react";
import { formatDateTimeTR } from "@/lib/utils/format-date";
import Link from "next/link";
import { ArrowLeft, Clock, Play, Square } from "lucide-react";
import type {
  Task,
  TaskActivity,
  TaskActivityLogWithActor,
  TimeEntry,
  CustomFieldDefinition,
  Profile,
  WorkspaceContact,
  WorkspaceDepartment,
  TaskStatus,
  TaskPriority,
} from "@/types";
import { USER_STATUS_OPTIONS, TASK_PRIORITIES, PRIORITY_LABELS, PROJECT_OPTIONS } from "@/lib/utils/task-constants";
import { updateTask } from "@/lib/actions/tasks";
import { getPersonInitials } from "@/lib/utils/person-display";
import { activityMessage } from "@/components/task/activity-messages";
import { History } from "lucide-react";
import { startTimer, stopTimer } from "@/lib/actions/time";
import { featureFlags } from "@/lib/utils/feature-flags";
import { cn } from "@/lib/utils/cn";

interface Props {
  task: Task;
  activity: TaskActivity[];
  activityLogs: TaskActivityLogWithActor[];
  activeTimer: TimeEntry | null;
  customFields: CustomFieldDefinition[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
  departments: WorkspaceDepartment[];
  userId: string;
  canComplete?: boolean;
}

// ---- Editable field components ----

function EditableTitle({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  const [_pending, startTransition] = useTransition();

  function save() {
    setEditing(false);
    if (value.trim() === task.title) return;
    startTransition(async () => { await updateTask({ id: task.id, title: value.trim() || task.title }); });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(task.title); setEditing(false); } }}
        className="text-2xl font-bold text-gray-900 w-full border-b-2 border-blue-500 outline-none bg-transparent"
      />
    );
  }

  return (
    <h1
      className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors"
      onClick={() => setEditing(true)}
      title="Düzenlemek için tıklayın"
    >
      {task.title}
    </h1>
  );
}

function EditableDescription({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.description ?? "");
  const [_pending, startTransition] = useTransition();

  function save() {
    setEditing(false);
    startTransition(async () => { await updateTask({ id: task.id, description: value || null }); });
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={4}
        className="w-full text-sm text-gray-600 border border-blue-400 rounded-lg px-3 py-2 outline-none resize-y"
        placeholder="Açıklama ekle…"
      />
    );
  }

  return (
    <p
      className={cn(
        "text-sm cursor-pointer rounded-lg px-0 py-1 hover:bg-gray-50 transition-colors",
        task.description ? "text-gray-600 whitespace-pre-wrap" : "text-gray-400 italic"
      )}
      onClick={() => setEditing(true)}
    >
      {task.description ?? "Açıklama eklemek için tıklayın…"}
    </p>
  );
}

// ---- Field select row ----

function StatusSelect({ task, canComplete = false }: { task: Task; canComplete?: boolean }) {
  const [_p, startTransition] = useTransition();
  const [opt, setOpt] = useOptimistic<TaskStatus>(task.status);
  const [err, setErr] = useState<string | null>(null);
  // Map current value to the nearest USER_STATUS_OPTIONS value for display
  const displayVal = USER_STATUS_OPTIONS.find((o) => o.value === opt)?.value ?? "ready";
  // Non-admins cannot set final "done"; they route through Kontrol / Onay.
  const options = canComplete || task.status === "done"
    ? USER_STATUS_OPTIONS
    : USER_STATUS_OPTIONS.filter((o) => o.value !== "done");
  return (
    <div>
      <select
        value={displayVal}
        onChange={(e) => {
          const s = e.target.value as TaskStatus;
          setErr(null);
          startTransition(async () => {
            setOpt(s);
            const res = await updateTask({ id: task.id, status: s });
            if (res && "error" in res) setErr(res.error);
          });
        }}
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#406775]"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

function PrioritySelect({ task }: { task: Task }) {
  const [_p, startTransition] = useTransition();
  const [opt, setOpt] = useOptimistic<TaskPriority>(task.priority);
  return (
    <select
      value={opt}
      onChange={(e) => {
        const p = e.target.value as TaskPriority;
        startTransition(async () => { setOpt(p); await updateTask({ id: task.id, priority: p }); });
      }}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
    </select>
  );
}

function DueDateInput({ task, field }: { task: Task; field: "due_date" | "start_date" }) {
  const [_p, startTransition] = useTransition();
  const value = task[field];
  return (
    <input
      type="date"
      defaultValue={value ?? ""}
      onChange={(e) => {
        const val = e.target.value || null;
        startTransition(async () => { await updateTask({ id: task.id, [field]: val }); });
      }}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function TagsInput({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.tags.join(", "));
  const [_p, startTransition] = useTransition();

  function save() {
    setEditing(false);
    const raw = value.split(",").map((t) => t.trim()).filter(Boolean);
    const seen = new Set<string>();
    const tags = raw.filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 10);
    startTransition(async () => { await updateTask({ id: task.id, tags }); });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1.5 focus:outline-none"
        placeholder="tag1, tag2, tag3"
      />
    );
  }

  return (
    <div
      className="flex flex-wrap gap-1 cursor-pointer min-h-8 items-center"
      onClick={() => setEditing(true)}
    >
      {task.tags.length > 0
        ? [...new Set(task.tags)].map((tag, i) => (
            <span key={`${task.id}-tag-${i}`} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">{tag}</span>
          ))
        : <span className="text-xs text-gray-400 italic">Etiket eklemek için tıklayın…</span>
      }
    </div>
  );
}

// ---- Responsible person select ----

function AssigneeSelect({
  task,
  profiles,
  contacts,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
}) {
  const [_p, startTransition] = useTransition();
  const currentValue = task.assignee_id
    ? `member:${task.assignee_id}`
    : (task as { responsible_contact_id?: string | null }).responsible_contact_id
    ? `contact:${(task as { responsible_contact_id: string }).responsible_contact_id}`
    : "";
  const [opt, setOpt] = useOptimistic<string>(currentValue);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const assignee_id = val.startsWith("member:") ? val.slice(7) : null;
    const responsible_contact_id = val.startsWith("contact:") ? val.slice(8) : null;
    startTransition(async () => {
      setOpt(val);
      await updateTask({ id: task.id, assignee_id, responsible_contact_id });
    });
  }

  return (
    <select
      value={opt}
      onChange={handleChange}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">— Atanmamış</option>
      {profiles.length > 0 && (
        <optgroup label="Üyeler">
          {profiles.map((p) => (
            <option key={p.id} value={`member:${p.id}`}>{p.full_name ?? p.email}</option>
          ))}
        </optgroup>
      )}
      {contacts.length > 0 && (
        <optgroup label="Kişiler">
          {contacts.map((c) => (
            <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ---- Category / Konu ----

function CategoryInput({ task }: { task: Task }) {
  const currentVal = ((task.custom_fields as Record<string, unknown>)?.category as string) ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentVal);
  const [_p, startTransition] = useTransition();

  function save() {
    setEditing(false);
    const fields = { ...(task.custom_fields as Record<string, unknown>) };
    if (value.trim()) fields.category = value.trim();
    else delete fields.category;
    startTransition(async () => { await updateTask({ id: task.id, custom_fields: fields }); });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(currentVal); setEditing(false); } }}
        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1.5 focus:outline-none"
        placeholder="Bu işin konusu / bağlamı…"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="text-sm text-gray-600 cursor-pointer hover:text-blue-600 transition-colors"
      title="Düzenlemek için tıklayın"
    >
      {currentVal || <span className="text-gray-400 italic">Eklemek için tıklayın…</span>}
    </span>
  );
}

// ---- Project field ----

function ProjectInput({ task }: { task: Task }) {
  const currentVal = ((task.custom_fields as Record<string, unknown>)?.project as string) ?? "";
  const [_p, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    startTransition(async () => {
      const fields = { ...(task.custom_fields as Record<string, unknown>) };
      if (val) fields.project = val;
      else delete fields.project;
      await updateTask({ id: task.id, custom_fields: fields });
    });
  }

  return (
    <select
      defaultValue={currentVal}
      onChange={handleChange}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#406775]"
    >
      <option value="">— Proje seçin</option>
      {PROJECT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

// ---- Collaborators multi-select ----

function CollaboratorsInput({
  task,
  profiles,
  contacts,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
}) {
  const cf = task.custom_fields as Record<string, unknown>;
  const existing = (Array.isArray(cf?.collaborators) ? cf.collaborators as string[] : []);
  const [selected, setSelected] = useState<string[]>(existing);
  const [search, setSearch] = useState("");
  const [_p, startTransition] = useTransition();

  const allPeople = useMemo(() => [
    ...profiles.map((p) => ({ key: p.id, name: p.full_name ?? p.email ?? "—" })),
    ...contacts.map((c) => ({ key: c.id, name: c.name })),
  ], [profiles, contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allPeople.filter((p) => p.name.toLowerCase().includes(q)) : allPeople;
  }, [allPeople, search]);

  function toggle(name: string) {
    const next = selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name];
    setSelected(next);
    startTransition(async () => {
      const fields = { ...(task.custom_fields as Record<string, unknown>) };
      if (next.length > 0) fields.collaborators = next;
      else delete fields.collaborators;
      await updateTask({ id: task.id, custom_fields: fields });
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Kişi ara…"
        className="w-full px-3 py-1.5 text-sm border-b border-gray-100 focus:outline-none"
      />
      <div className="max-h-28 overflow-y-auto p-2 flex flex-wrap gap-x-4 gap-y-2">
        {filtered.map((p) => (
          <label key={p.key} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={selected.includes(p.name)}
              onChange={() => toggle(p.name)}
              className="rounded text-[#406775]"
            />
            {p.name}
          </label>
        ))}
        {filtered.length === 0 && <p className="text-xs text-gray-400 px-1">Eşleşen kişi yok</p>}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-gray-100">
          {selected.map((name) => (
            <span
              key={name}
              title={name}
              className="inline-flex items-center gap-1 bg-gray-100 rounded-full pl-0.5 pr-2 py-0.5 text-xs text-gray-700"
            >
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[#406775] text-white text-[8px] font-semibold">
                {getPersonInitials(name)}
              </span>
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Link / External URL ----

function LinkInput({ task }: { task: Task }) {
  const currentVal = ((task.custom_fields as Record<string, unknown>)?.external_link as string) ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentVal);
  const [_p, startTransition] = useTransition();

  function save() {
    setEditing(false);
    startTransition(async () => {
      const fields = { ...(task.custom_fields as Record<string, unknown>) };
      if (value.trim()) fields.external_link = value.trim();
      else delete fields.external_link;
      await updateTask({ id: task.id, custom_fields: fields });
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(currentVal); setEditing(false); } }}
        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1.5 focus:outline-none"
        placeholder="https://…"
      />
    );
  }

  return currentVal ? (
    <div className="flex items-center gap-2">
      <a href={currentVal} target="_blank" rel="noopener noreferrer" className="text-sm text-[#406775] hover:underline truncate flex-1">
        {currentVal}
      </a>
      <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">✎</button>
    </div>
  ) : (
    <span
      onClick={() => setEditing(true)}
      className="text-sm text-gray-400 italic cursor-pointer hover:text-[#406775] transition-colors"
    >
      Bağlantı eklemek için tıklayın…
    </span>
  );
}

// ---- Urgent flag ----

function UrgentToggle({ task }: { task: Task }) {
  const cf = task.custom_fields as Record<string, unknown>;
  const [isUrgent, setIsUrgent] = useState<boolean>(!!cf?.urgent_flag);
  const [_p, startTransition] = useTransition();

  function toggle() {
    const next = !isUrgent;
    setIsUrgent(next);
    startTransition(async () => {
      const fields = { ...(task.custom_fields as Record<string, unknown>), urgent_flag: next };
      await updateTask({ id: task.id, custom_fields: fields });
    });
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={isUrgent} onChange={toggle} className="rounded text-red-500" />
      <span className={cn("text-sm", isUrgent ? "text-red-600 font-medium" : "text-gray-600")}>
        {isUrgent ? "Acil ✓" : "Acil değil"}
      </span>
    </label>
  );
}

// ---- Timer panel ----

function TimerPanel({ task, activeTimer, userId }: { task: Task; activeTimer: TimeEntry | null; userId: string }) {
  const [_p, startTransition] = useTransition();
  const [localTimer, setLocalTimer] = useOptimistic<TimeEntry | null>(activeTimer);
  const [elapsed, setElapsed] = useState(0);

  // Drive a live seconds counter via useEffect — keeps Date.now() out of render
  useEffect(() => {
    if (!activeTimer) return;
    const start = new Date(activeTimer.started_at).getTime();
    const interval = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000
    );
    return () => clearInterval(interval);
  }, [activeTimer]);

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Clock size={14} /> Zaman takibi
        </h3>
        {localTimer ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-green-600 font-semibold">
              {formatTime(elapsed)}
            </span>
            <button
              onClick={() => startTransition(async () => {
                setLocalTimer(null);
                await stopTimer(localTimer.id, task.workspace_id, task.id);
              })}
              className="flex items-center gap-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-lg px-2 py-1 font-medium transition-colors"
            >
              <Square size={12} /> Durdur
            </button>
          </div>
        ) : (
          <button
            onClick={() => startTransition(async () => {
              const fakeTimer: TimeEntry = {
                id: "optimistic",
                workspace_id: task.workspace_id,
                task_id: task.id,
                user_id: userId,
                started_at: new Date().toISOString(),
                stopped_at: null,
                duration_seconds: null,
                note: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              setLocalTimer(fakeTimer);
              await startTimer(task.id, task.workspace_id);
            })}
            className="flex items-center gap-1 text-xs bg-green-50 text-green-700 hover:bg-green-100 rounded-lg px-2 py-1 font-medium transition-colors"
          >
            <Play size={12} /> Zamanlayıcıyı başlat
          </button>
        )}
      </div>
      {!featureFlags.ai && !localTimer && (
        <p className="text-xs text-gray-400">Çalışan zamanlayıcı yok.</p>
      )}
    </div>
  );
}

// ---- Department select ----

function DepartmentSelect({ task, departments }: { task: Task; departments: WorkspaceDepartment[] }) {
  const [_p, startTransition] = useTransition();
  const topLevel = departments.filter((d) => d.parent_id === null);
  const children = (pid: string) => departments.filter((d) => d.parent_id === pid);

  return (
    <select
      value={(task as unknown as Record<string, string | null>).department_id ?? ""}
      onChange={(e) => {
        const val = e.target.value || null;
        startTransition(async () => {
          await updateTask({ id: task.id, department_id: val } as Parameters<typeof updateTask>[0]);
        });
      }}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">— Departman yok —</option>
      {topLevel.map((dept) => (
        <optgroup key={dept.id} label={dept.name}>
          {children(dept.id).map((child) => (
            <option key={child.id} value={child.id}>{child.name}</option>
          ))}
          <option value={dept.id}>{dept.name} (genel)</option>
        </optgroup>
      ))}
    </select>
  );
}

// ---- Waiting-on select ----

function WaitingOnSelect({
  task,
  profiles,
  contacts,
}: {
  task: Task;
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  contacts: WorkspaceContact[];
}) {
  const [_p, startTransition] = useTransition();

  const taskAny = task as unknown as Record<string, string | null>;
  const currentMemberId = taskAny.waiting_on_member_id ?? null;
  const currentContactId = taskAny.waiting_on_contact_id ?? null;
  const currentValue = currentMemberId
    ? `member:${currentMemberId}`
    : currentContactId
    ? `contact:${currentContactId}`
    : "";

  return (
    <select
      value={currentValue}
      onChange={(e) => {
        const val = e.target.value;
        let memberId: string | null = null;
        let contactId: string | null = null;
        if (val.startsWith("member:")) memberId = val.slice(7);
        else if (val.startsWith("contact:")) contactId = val.slice(8);
        startTransition(async () => {
          await updateTask({
            id: task.id,
            waiting_on_member_id: memberId,
            waiting_on_contact_id: contactId,
          } as Parameters<typeof updateTask>[0]);
        });
      }}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">— Kimse —</option>
      {profiles.length > 0 && (
        <optgroup label="Ekip üyeleri">
          {profiles.map((p) => (
            <option key={p.id} value={`member:${p.id}`}>{p.full_name ?? p.email}</option>
          ))}
        </optgroup>
      )}
      {contacts.length > 0 && (
        <optgroup label="Dış kişiler">
          {contacts.map((c) => (
            <option key={c.id} value={`contact:${c.id}`}>{c.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ---- Waiting reason input ----

function WaitingReasonInput({ task }: { task: Task }) {
  const taskAny = task as unknown as Record<string, string | null>;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(taskAny.waiting_reason ?? "");
  const [_p, startTransition] = useTransition();

  function save() {
    setEditing(false);
    startTransition(async () => {
      await updateTask({
        id: task.id,
        waiting_reason: value.trim() || null,
      } as Parameters<typeof updateTask>[0]);
    });
  }

  if (editing) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(taskAny.waiting_reason ?? ""); } }}
        autoFocus
        placeholder="Bekleme nedeni…"
        className="w-full text-sm border border-blue-400 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-left w-full text-gray-600 hover:text-gray-900 py-1"
    >
      {value || <span className="text-gray-400 italic">Bekleme nedeni ekle…</span>}
    </button>
  );
}


// ---- Main component ----

// ---- Audit trail (Phase 2A) ----

function ActivityLogSection({
  logs,
  profiles,
  contacts,
}: {
  logs: TaskActivityLogWithActor[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
}) {
  // Resolve member/contact ids to display names for the message builder
  const resolveName = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    if (p) return p.full_name ?? p.email ?? null;
    const c = contacts.find((x) => x.id === id);
    return c?.name ?? null;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
        <History size={14} /> Aktivite
      </h3>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400">
          Henüz kayıtlı aktivite yok. Bundan sonraki değişiklikler burada görünecek.
        </p>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => {
            const actorName = log.actor?.full_name ?? log.actor?.email
              ?? (log.actor_id ? "Bilinmeyen kullanıcı" : "Sistem");
            return (
              <li key={log.id} className="flex gap-3 text-sm">
                <div className="h-6 w-6 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                  {actorName[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 leading-snug">
                    <span className="font-medium text-gray-900">{actorName}</span>{" "}
                    {activityMessage(log, resolveName)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDateTimeTR(log.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function TaskDetail({ task, activity: _activity, activityLogs, activeTimer, customFields: _customFields, profiles, contacts, departments, userId, canComplete = false }: Props) {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      {/* Back */}
      <Link href="/board" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} /> Panoya dön
      </Link>

      {/* Title + description */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <EditableTitle task={task} />
        <EditableDescription task={task} />
      </div>

      {/* Fields grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Detaylar</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Durum"><StatusSelect task={task} canComplete={canComplete} /></FieldRow>
          <FieldRow label="Öncelik"><PrioritySelect task={task} /></FieldRow>
          <FieldRow label="Sorumlu" className="sm:col-span-2">
            <AssigneeSelect task={task} profiles={profiles} contacts={contacts} />
          </FieldRow>
          <FieldRow label="İş birliği kişileri" className="sm:col-span-2">
            <CollaboratorsInput task={task} profiles={profiles} contacts={contacts} />
          </FieldRow>
          <FieldRow label="Departman" className="sm:col-span-2">
            <DepartmentSelect task={task} departments={departments} />
          </FieldRow>
          <FieldRow label="Konu"><CategoryInput task={task} /></FieldRow>
          <FieldRow label="Proje / İş Alanı"><ProjectInput task={task} /></FieldRow>
          <FieldRow label="Teslim tarihi"><DueDateInput task={task} field="due_date" /></FieldRow>
          <FieldRow label="Başlangıç tarihi"><DueDateInput task={task} field="start_date" /></FieldRow>
          <FieldRow label="Etiketler" className="sm:col-span-2"><TagsInput task={task} /></FieldRow>
        </div>
      </div>

      {/* Ek bilgiler (editable) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Ek bilgiler</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldRow label="Beklenen kişi" className="sm:col-span-2">
            <WaitingOnSelect task={task} profiles={profiles} contacts={contacts} />
          </FieldRow>
          <FieldRow label="Bekleme nedeni" className="sm:col-span-2">
            <WaitingReasonInput task={task} />
          </FieldRow>
          <FieldRow label="Bağlantı" className="sm:col-span-2"><LinkInput task={task} /></FieldRow>
          <FieldRow label="Acil"><UrgentToggle task={task} /></FieldRow>
        </div>
      </div>

      {/* Timer */}
      <TimerPanel task={task} activeTimer={activeTimer} userId={userId} />

      {/* Feature flag placeholders */}
      {featureFlags.uploads && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-5">
          <p className="text-sm text-gray-400">📎 Attachments (UPLOADS_ENABLED)</p>
        </div>
      )}
      {featureFlags.ai && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-5">
          <p className="text-sm text-blue-500">✨ AI Summarize (AI_ENABLED) — see modules/ai/</p>
        </div>
      )}

      {/* Audit trail — who changed what, when (Phase 2A) */}
      <ActivityLogSection logs={activityLogs} profiles={profiles} contacts={contacts} />

      {/* Communication lives in a single place: "Notlar" (rendered by the page). */}
    </div>
  );
}

function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {children}
    </div>
  );
}
