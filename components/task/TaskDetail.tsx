"use client";

import { useState, useTransition, useOptimistic } from "react";
import { formatDateTimeTR } from "@/lib/utils/format-date";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
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
import { USER_STATUS_OPTIONS, TASK_PRIORITIES, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { updateTask } from "@/lib/actions/tasks";
import { activityMessage } from "@/components/task/activity-messages";
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

export function TaskDetail({ task, activity: _activity, activityLogs, activeTimer: _activeTimer, customFields: _customFields, profiles, contacts, departments, userId: _userId, canComplete = false }: Props) {
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
          <FieldRow label="Departman" className="sm:col-span-2">
            <DepartmentSelect task={task} departments={departments} />
          </FieldRow>
          <FieldRow label="Konu" className="sm:col-span-2"><CategoryInput task={task} /></FieldRow>
          <FieldRow label="Durum"><StatusSelect task={task} canComplete={canComplete} /></FieldRow>
          <FieldRow label="Öncelik"><PrioritySelect task={task} /></FieldRow>
          <FieldRow label="Giriş tarihi">
            <span className="text-sm text-gray-500">{formatDateTimeTR(task.created_at)}</span>
          </FieldRow>
          <FieldRow label="Başlangıç tarihi"><DueDateInput task={task} field="start_date" /></FieldRow>
          <FieldRow label="Teslim tarihi"><DueDateInput task={task} field="due_date" /></FieldRow>
        </div>
      </div>

      {/* Audit trail — who changed what, when (Phase 2A) */}
      <ActivityLogSection logs={activityLogs} profiles={profiles} contacts={contacts} />

      {/* Sorumlu kişiler + Notlar are rendered by the page below. */}
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
