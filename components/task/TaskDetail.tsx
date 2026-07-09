"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatDateTimeTR, formatDateOnlyTR } from "@/lib/utils/format-date";
import Link from "next/link";
import { ArrowLeft, History, Save, X, Check, AlertCircle, Lock, Pencil, Users, Building2, CalendarDays } from "lucide-react";
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
import {
  USER_STATUS_OPTIONS, TASK_PRIORITIES, PRIORITY_LABELS, STATUS_LABELS,
} from "@/lib/utils/task-constants";
import { updateTask } from "@/lib/actions/tasks";
import { activityMessage } from "@/components/task/activity-messages";
import {
  STATUS_CHIP_TONE, PRIORITY_CHIP, getTaskStateMarkers,
} from "@/lib/design/semantics";
import { Avatar } from "@/components/ui/Avatar";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { cn } from "@/lib/utils/cn";
import {
  TASK_VISIBILITIES, VISIBILITY_LABELS, VISIBILITY_DESCRIPTIONS,
  ADMIN_ONLY_CHIP_LABEL, asVisibility, type TaskVisibility,
} from "@/lib/utils/visibility";

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
  // Visibility is an admin-only lever; members never see or edit it.
  isAdmin?: boolean;
  // Back link target — follows the board the task was opened from.
  backHref?: string;
  backLabel?: string;
  // Display names of the current responsible people (participants ∪ assignee
  // fallback) — shown under the title in the header card.
  responsiblePeople?: string[];
  // Page-composed panels, positioned by this layout in a single column:
  // Görev bilgileri → Sorumlu kişiler → Notlar → Puan & Motivasyon → Aktivite.
  participantsSlot?: React.ReactNode;
  notesSlot?: React.ReactNode;
  effortSlot?: React.ReactNode;
}

// ---- Draft model: explicit edit/save, NO auto-save ----

interface Draft {
  title: string;
  description: string;
  department_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string;
  due_date: string;
  visibility: TaskVisibility;
}

function draftFromTask(task: Task): Draft {
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    department_id: (task as unknown as Record<string, string | null>).department_id ?? "",
    status: task.status,
    priority: task.priority,
    start_date: task.start_date ?? "",
    due_date: task.due_date ?? "",
    visibility: asVisibility((task as unknown as Record<string, unknown>).visibility),
  };
}

// ---- Field wrapper ----

function FieldRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle mb-1">{label}</p>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm text-ink bg-surface border border-line rounded-lg px-2.5 py-1.5 placeholder:text-subtle transition-colors focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 disabled:bg-surface-sunken disabled:text-subtle";
// Read-only metadata (Oluşturan, Giriş tarihi) rendered in the same box shape as
// the editable inputs so every field reads as one consistent UI.
const readOnlyCls = "block w-full text-sm text-muted bg-surface-muted border border-hairline rounded-lg px-2.5 py-1.5 truncate";

// ---- Editor (remounts via key when the server task changes) ----

function TaskEditor({
  task, departments, canEdit, canComplete, isAdmin, backHref, backLabel, creatorName,
  responsiblePeople, participantsSlot, notesSlot, effortSlot, activitySlot,
}: {
  task: Task; departments: WorkspaceDepartment[]; canEdit: boolean; canComplete: boolean;
  isAdmin: boolean; backHref: string; backLabel: string; creatorName: string | null;
  responsiblePeople: string[];
  participantsSlot?: React.ReactNode;
  notesSlot?: React.ReactNode;
  effortSlot?: React.ReactNode;
  activitySlot: React.ReactNode;
}) {
  const router = useRouter();
  const initial = useMemo(() => draftFromTask(task), [task]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // The title is a textarea so long operasyon başlıkları wrap and stay fully
  // visible (in both view + edit modes). Auto-grow to fit the content height.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title]);

  const dirty = useMemo(
    () => (Object.keys(initial) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]),
    [draft, initial],
  );

  // A done task is locked for non-admins: they can neither edit fields nor reopen.
  const doneLocked = task.status === "done" && !canComplete;
  const fieldsDisabled = !canEdit || doneLocked;
  const canSave = dirty && !fieldsDisabled;

  // Non-admins can't set final "done"; a done task keeps "done" selectable so an
  // admin can see/keep it. Others never see "done" in the dropdown.
  const statusOptions = canComplete || task.status === "done"
    ? USER_STATUS_OPTIONS
    : USER_STATUS_OPTIONS.filter((o) => o.value !== "done");

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setFeedback(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function cancel() {
    setDraft(initial);
    setFeedback(null);
  }

  function save() {
    if (!canSave) return;
    const updates: Parameters<typeof updateTask>[0] = { id: task.id };
    if (draft.title.trim() !== initial.title) updates.title = draft.title.trim() || initial.title;
    if (draft.description !== initial.description) updates.description = draft.description || null;
    if (draft.status !== initial.status) updates.status = draft.status;
    if (draft.priority !== initial.priority) updates.priority = draft.priority;
    if (draft.start_date !== initial.start_date) updates.start_date = draft.start_date || null;
    if (draft.due_date !== initial.due_date) updates.due_date = draft.due_date || null;
    if (draft.department_id !== initial.department_id) {
      (updates as Record<string, unknown>).department_id = draft.department_id || null;
    }
    if (draft.visibility !== initial.visibility) {
      (updates as Record<string, unknown>).visibility = draft.visibility;
    }

    startSaving(async () => {
      const res = await updateTask(updates);
      if (res && "error" in res) {
        setFeedback({ kind: "err", msg: res.error || "Değişiklikler kaydedilemedi." });
        return;
      }
      setFeedback({ kind: "ok", msg: "Değişiklikler kaydedildi." });
      router.refresh();
    });
  }

  const topLevel = departments.filter((d) => d.parent_id === null);
  const children = (pid: string) => departments.filter((d) => d.parent_id === pid);
  const markers = getTaskStateMarkers(task);
  const departmentName = draft.department_id
    ? departments.find((d) => d.id === draft.department_id)?.name ?? null
    : null;

  return (
    <>
      {/* ── Top action bar: back link + explicit Save / Cancel ─────────────── */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-app/90 backdrop-blur border-b border-line/60 flex items-center justify-between gap-3 flex-wrap">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors">
          <ArrowLeft size={14} /> {backLabel}
        </Link>
        <div className="flex items-center gap-2 ml-auto">
          {feedback && (
            <span className={cn(
              "hidden sm:inline-flex items-center gap-1 text-xs mr-1",
              feedback.kind === "ok" ? "text-success" : "text-danger",
            )}>
              {feedback.kind === "ok" ? <Check size={13} /> : <AlertCircle size={13} />}
              {feedback.msg}
            </span>
          )}
          {canSave && (
            <button
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink px-3 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface-muted disabled:opacity-50 transition-colors"
            >
              <X size={14} /> Vazgeç
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || saving}
            title={!canEdit ? "Düzenleme yetkiniz yok" : doneLocked ? "Tamamlanmış görevi yalnızca yönetici değiştirebilir" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors",
              canSave && !saving
                ? "text-white bg-brand hover:bg-brand-strong"
                : "text-subtle bg-surface-sunken cursor-not-allowed",
            )}
          >
            <Save size={14} /> {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
          </button>
        </div>
      </div>

      {/* ── Header card: title + responsible people + state badges ─────────── */}
      <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3 mt-5">
        <div className="group relative">
          <textarea
            ref={titleRef}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            disabled={fieldsDisabled}
            rows={1}
            placeholder="Görev başlığı"
            aria-label="Görev başlığı"
            className={cn(
              "w-full resize-none overflow-hidden text-xl sm:text-2xl font-semibold tracking-tight text-ink bg-transparent outline-none pr-8 pb-1 leading-tight break-words transition-colors",
              fieldsDisabled
                ? "border-b border-transparent text-muted"
                : "border-b border-dashed border-line hover:border-line-strong focus:border-solid focus:border-brand-ring",
            )}
          />
          {!fieldsDisabled && (
            <Pencil
              size={15}
              className="absolute right-0 top-2 text-subtle group-hover:text-muted group-focus-within:text-brand transition-colors pointer-events-none"
            />
          )}
        </div>

        {/* Responsible people — the primary "whose work is this" signal. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <Users size={13} /> Sorumlu:
          </span>
          {responsiblePeople.length === 0 ? (
            <span className="text-xs text-subtle italic">Sorumlu atanmadı</span>
          ) : (
            responsiblePeople.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted border border-line pl-1 pr-2.5 py-0.5 text-xs font-medium text-ink"
              >
                <Avatar name={name} size="xs" />
                {getPersonDisplayName(name)}
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[11px] rounded-full px-2 py-0.5 font-medium", STATUS_CHIP_TONE[draft.status])}>
            {STATUS_LABELS[draft.status]}
          </span>
          <span className={cn("text-[11px] rounded-full px-2 py-0.5 font-medium", PRIORITY_CHIP[draft.priority])}>
            {PRIORITY_LABELS[draft.priority]}
          </span>
          {draft.due_date && (
            <span className={cn("inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-surface-muted border border-hairline", markers.dueDateClass)}>
              <CalendarDays size={11} /> Teslim: {formatDateOnlyTR(draft.due_date)}
            </span>
          )}
          {departmentName && (
            <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-surface-muted border border-hairline text-muted">
              <Building2 size={11} /> {departmentName}
            </span>
          )}
          {doneLocked && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted bg-surface-sunken rounded-full px-2 py-0.5">
              <Lock size={11} /> Tamamlandı — yalnızca yönetici değiştirebilir
            </span>
          )}
          {isAdmin && draft.visibility === "admin_only" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <Lock size={11} /> {ADMIN_ONLY_CHIP_LABEL}
            </span>
          )}
        </div>
      </div>

      {/* ── Single-column body ──────────────────────────────────────────────
          One flow on every breakpoint, in the fixed hierarchy: Görev bilgileri
          → Sorumlu kişiler → Notlar → Puan & Motivasyon → Aktivite. The audit
          trail is ALWAYS last (never a right sidebar) and notes always sit
          above it. */}
      <div className="mt-5 flex flex-col gap-5">

          {/* Görev bilgileri */}
          <div className="bg-surface rounded-card border border-line shadow-card p-5">
            <h3 className="text-sm font-semibold text-ink mb-4">Görev bilgileri</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow label="Açıklama" className="sm:col-span-2">
                <textarea
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  disabled={fieldsDisabled}
                  rows={4}
                  placeholder="Açıklama ekle…"
                  className={cn(inputCls, "resize-y")}
                />
              </FieldRow>

              <FieldRow label="Durum">
                <select
                  value={USER_STATUS_OPTIONS.find((o) => o.value === draft.status)?.value ?? "ready"}
                  onChange={(e) => set("status", e.target.value as TaskStatus)}
                  disabled={fieldsDisabled}
                  className={inputCls}
                >
                  {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FieldRow>

              <FieldRow label="Öncelik">
                <select
                  value={draft.priority}
                  onChange={(e) => set("priority", e.target.value as TaskPriority)}
                  disabled={fieldsDisabled}
                  className={inputCls}
                >
                  {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </FieldRow>

              {/* Başlangıç + Teslim: always side by side from sm up. */}
              <FieldRow label="Başlangıç tarihi">
                <input
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  disabled={fieldsDisabled}
                  className={inputCls}
                />
              </FieldRow>
              <FieldRow label="Teslim tarihi">
                <input
                  type="date"
                  value={draft.due_date}
                  min={draft.start_date || undefined}
                  onChange={(e) => set("due_date", e.target.value)}
                  disabled={fieldsDisabled}
                  className={inputCls}
                />
              </FieldRow>

              <FieldRow label="Departman" className="sm:col-span-2">
                <select
                  value={draft.department_id}
                  onChange={(e) => set("department_id", e.target.value)}
                  disabled={fieldsDisabled}
                  className={inputCls}
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
              </FieldRow>

              <FieldRow label="Oluşturan">
                <span className={readOnlyCls}>{creatorName ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Giriş tarihi">
                <span className={readOnlyCls}>{formatDateTimeTR(task.created_at)}</span>
              </FieldRow>

              {/* Görünürlük — admin-only. Members never see or edit this. */}
              {isAdmin && (
                <FieldRow label="Görünürlük" className="sm:col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TASK_VISIBILITIES.map((v) => {
                      const on = draft.visibility === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set("visibility", v)}
                          disabled={!canEdit}
                          className={cn(
                            "text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-60",
                            on
                              ? "bg-amber-50 border-amber-300"
                              : "bg-surface border-line hover:bg-surface-hover",
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
                  <p className="text-[11px] text-subtle mt-1.5">
                    Değişiklik &quot;Değişiklikleri Kaydet&quot; ile uygulanır. Yöneticiye özel
                    görevlerde yalnızca yönetici kişiler sorumlu olabilir.
                  </p>
                </FieldRow>
              )}
            </div>

            {/* Inline feedback (also visible on mobile, where the top bar hides it). */}
            {feedback && (
              <p className={cn(
                "mt-4 inline-flex items-center gap-1.5 text-sm sm:hidden",
                feedback.kind === "ok" ? "text-success" : "text-danger",
              )}>
                {feedback.kind === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}
                {feedback.msg}
              </p>
            )}
            {!canEdit && !doneLocked && (
              <p className="mt-4 text-xs text-subtle">Bu görevi düzenleme yetkiniz yok.</p>
            )}
          </div>

          {/* Sorumlu kişiler — active assignment management, right under the
              task details (never a passive side card). */}
          {participantsSlot}

          {/* Notlar — the main working area. */}
          {notesSlot}

          {/* Puan & Motivasyon — compact, above the audit trail. */}
          {effortSlot}

          {/* Aktivite — audit trail, intentionally the very last block. */}
          {activitySlot}
      </div>
    </>
  );
}

// ---- Audit trail ----

function ActivityLogSection({
  logs, profiles, contacts,
}: {
  logs: TaskActivityLogWithActor[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  contacts: WorkspaceContact[];
}) {
  const resolveName = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = profiles.find((x) => x.id === id);
    if (p) return p.full_name ?? p.email ?? null;
    const c = contacts.find((x) => x.id === id);
    return c?.name ?? null;
  };

  return (
    <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
        <History size={14} className="text-muted" /> Aktivite
      </h3>

      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-subtle">
          Henüz kayıtlı aktivite yok. Bundan sonraki değişiklikler burada görünecek.
        </p>
      ) : (
        <ol className="space-y-3">
          {logs.map((log) => {
            const actorName = log.actor?.full_name ?? log.actor?.email
              ?? (log.actor_id ? "Bilinmeyen kullanıcı" : "Sistem");
            return (
              <li key={log.id} className="flex gap-3 text-sm">
                <div className="h-6 w-6 rounded-full bg-surface-sunken text-muted text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5">
                  {actorName[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-muted leading-snug">
                    <span className="font-medium text-ink">{actorName}</span>{" "}
                    {activityMessage(log, resolveName)}
                  </p>
                  <p className="text-xs text-subtle mt-0.5">
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

export function TaskDetail({
  task,
  activityLogs,
  profiles,
  contacts,
  departments,
  userId,
  canComplete = false,
  isAdmin = false,
  backHref = "/board",
  backLabel = "Panoya dön",
  responsiblePeople = [],
  participantsSlot,
  notesSlot,
  effortSlot,
}: Props) {
  // Mirrors server canEditTask: admins always; members only own/created tasks.
  const canEdit = canComplete
    || task.assignee_id === userId
    || (task.created_by ?? null) === userId;

  // Remount the editor whenever the server task changes (e.g. after a save +
  // refresh) so the draft resets cleanly — no setState-in-effect needed.
  const version = `${task.id}:${task.updated_at}`;

  // Resolve the creator's display name from the loaded member profiles.
  const creator = task.created_by ? profiles.find((p) => p.id === task.created_by) : null;
  const creatorName = creator ? (creator.full_name ?? creator.email ?? null) : null;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <TaskEditor
        key={version}
        task={task}
        departments={departments}
        canEdit={canEdit}
        canComplete={canComplete}
        isAdmin={isAdmin}
        backHref={backHref}
        backLabel={backLabel}
        creatorName={creatorName}
        responsiblePeople={responsiblePeople}
        participantsSlot={participantsSlot}
        notesSlot={notesSlot}
        effortSlot={effortSlot}
        activitySlot={<ActivityLogSection logs={activityLogs} profiles={profiles} contacts={contacts} />}
      />
    </div>
  );
}
