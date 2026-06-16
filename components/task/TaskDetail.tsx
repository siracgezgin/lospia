"use client";
// Phase 7 — Task Detail (full editable implementation)
// Placeholder: renders read-only task detail until Phase 7 completes.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type {
  Task,
  TaskActivity,
  TimeEntry,
  CustomFieldDefinition,
  Profile,
} from "@/types/database";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils/task-constants";

interface Props {
  task: Task;
  activity: TaskActivity[];
  activeTimer: TimeEntry | null;
  customFields: CustomFieldDefinition[];
  profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[];
  userId: string;
}

export function TaskDetail({ task, activity, activeTimer, customFields, profiles, userId }: Props) {
  const assignee = profiles.find((p) => p.id === task.assignee_id);

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Back */}
      <Link href="/board" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} />
        Back to board
      </Link>

      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
        {task.description && (
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{task.description}</p>
        )}
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-4 bg-white rounded-xl border border-gray-200 p-5 text-sm">
        <MetaRow label="Status"   value={STATUS_LABELS[task.status]} />
        <MetaRow label="Priority" value={PRIORITY_LABELS[task.priority]} />
        <MetaRow label="Assignee" value={assignee?.full_name ?? assignee?.email ?? "Unassigned"} />
        <MetaRow label="Due date" value={task.due_date ?? "—"} />
        <MetaRow label="Start date" value={task.start_date ?? "—"} />
        {task.tags.length > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 mb-1">Tags</p>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span key={tag} className="text-xs bg-blue-50 text-blue-600 rounded px-2 py-0.5">{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Custom fields */}
      {customFields.length > 0 && Object.keys(task.custom_fields).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Custom fields</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {customFields.map((cf) => {
              const val = (task.custom_fields as Record<string, unknown>)[cf.field_key];
              if (val === undefined || val === null) return null;
              return (
                <MetaRow key={cf.id} label={cf.name} value={String(val)} />
              );
            })}
          </div>
        </div>
      )}

      {/* Timer panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Time tracking</h3>
        {activeTimer ? (
          <p className="text-sm text-green-600 font-medium">
            Timer running since {new Date(activeTimer.started_at).toLocaleTimeString()}
          </p>
        ) : (
          <p className="text-sm text-gray-400">No active timer — start one below</p>
        )}
        <p className="text-xs text-gray-400 mt-2">Start/stop timer wired in Phase 9</p>
        <p className="text-xs text-gray-300">userId: {userId}</p>
      </div>

      {/* Activity log */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((entry) => {
              const actor = profiles.find((p) => p.id === entry.user_id);
              return (
                <li key={entry.id} className="flex gap-3 text-sm">
                  <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {actor?.full_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <span className="font-medium">{actor?.full_name ?? actor?.email ?? "Unknown"}</span>
                    {" "}
                    {entry.type === "comment" ? (
                      <span className="text-gray-600">{entry.content}</span>
                    ) : (
                      <span className="text-gray-400 capitalize">{entry.type.replace(/_/g, " ")}</span>
                    )}
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="font-medium text-gray-700 capitalize">{value}</p>
    </div>
  );
}
