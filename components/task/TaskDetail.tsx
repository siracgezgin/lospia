"use client";

import { useState, useEffect, useTransition, useOptimistic, useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Play, Square, MessageSquare } from "lucide-react";
import type {
  Task,
  TaskActivity,
  TimeEntry,
  CustomFieldDefinition,
  Profile,
  WorkspaceContact,
  TaskStatus,
  TaskPriority,
} from "@/types";
import { STATUS_LABELS, TASK_STATUSES, TASK_PRIORITIES, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { updateTask, addTaskComment } from "@/lib/actions/tasks";
import { startTimer, stopTimer } from "@/lib/actions/time";
import { featureFlags } from "@/lib/utils/feature-flags";
import { cn } from "@/lib/utils/cn";

interface Props {
  task: Task;
  activity: TaskActivity[];
  activeTimer: TimeEntry | null;
  customFields: CustomFieldDefinition[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
  userId: string;
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

function StatusSelect({ task }: { task: Task }) {
  const [_p, startTransition] = useTransition();
  const [opt, setOpt] = useOptimistic<TaskStatus>(task.status);
  return (
    <select
      value={opt}
      onChange={(e) => {
        const s = e.target.value as TaskStatus;
        startTransition(async () => { setOpt(s); await updateTask({ id: task.id, status: s }); });
      }}
      className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
    </select>
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
        placeholder="Örn: Pazarlama, Operasyon…"
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

// ---- Comment form ----

function CommentForm({ task }: { task: Task }) {
  const [_s, action, pending] = useActionState(
    async (_: null | { error?: string }, formData: FormData) => {
      const content = formData.get("content") as string;
      const result = await addTaskComment(task.id, task.workspace_id, content);
      if ("error" in result) return { error: result.error };
      return null;
    },
    null
  );

  return (
    <form action={action} className="flex gap-2">
      <input
        name="content"
        type="text"
        placeholder="Yorum ekle…"
        required
        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
      >
        {pending ? "…" : "Gönder"}
      </button>
    </form>
  );
}

// ---- Main component ----

export function TaskDetail({ task, activity, activeTimer, customFields, profiles, contacts, userId }: Props) {
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
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Durum"><StatusSelect task={task} /></FieldRow>
          <FieldRow label="Öncelik"><PrioritySelect task={task} /></FieldRow>
          <FieldRow label="Sorumlu" className="col-span-2">
            <AssigneeSelect task={task} profiles={profiles} contacts={contacts} />
          </FieldRow>
          <FieldRow label="Kategori / Konu" className="col-span-2">
            <CategoryInput task={task} />
          </FieldRow>
          <FieldRow label="Teslim tarihi"><DueDateInput task={task} field="due_date" /></FieldRow>
          <FieldRow label="Başlangıç tarihi"><DueDateInput task={task} field="start_date" /></FieldRow>
          <FieldRow label="Etiketler" className="col-span-2"><TagsInput task={task} /></FieldRow>
        </div>
      </div>

      {/* Custom fields */}
      {customFields.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Özel alanlar</h3>
          <div className="grid grid-cols-2 gap-4">
            {customFields.map((cf) => {
              const val = (task.custom_fields as Record<string, unknown>)[cf.field_key];
              return (
                <FieldRow key={cf.id} label={cf.name}>
                  <span className="text-sm text-gray-600">{val !== undefined && val !== null ? String(val) : "—"}</span>
                </FieldRow>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Activity log + comments */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <MessageSquare size={14} /> Aktivite
        </h3>

        <CommentForm task={task} />

        {activity.length === 0 ? (
          <p className="text-sm text-gray-400">Henüz aktivite yok.</p>
        ) : (
          <ol className="space-y-4 mt-2">
            {[...activity].reverse().map((entry) => {
              const actor = profiles.find((p) => p.id === entry.user_id);
              return (
                <li key={entry.id} className="flex gap-3 text-sm">
                  <div className="h-7 w-7 rounded-full bg-gray-200 text-gray-600 text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
                    {actor?.full_name?.[0]?.toUpperCase() ?? actor?.email?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1">
                    <div>
                      <span className="font-medium">{actor?.full_name ?? actor?.email ?? "Unknown"}</span>
                      {" "}
                      {entry.type === "comment" ? (
                        <span className="text-gray-700">{entry.content}</span>
                      ) : entry.type === "created" ? (
                        <span className="text-gray-400">bu görevi oluşturdu</span>
                      ) : (
                        <span className="text-gray-400">
                          {entry.type.replace(/_/g, " ")}
                          {entry.metadata && " → "}
                          {(entry.metadata as Record<string, unknown> | null)?.to != null && (
                            <span className="font-medium text-gray-600">
                              {String((entry.metadata as Record<string, unknown>).to)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
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
