"use client";

import { useState, useTransition } from "react";
import { Check, UserPlus, Loader2, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils/cn";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { formatDateTimeTR } from "@/lib/utils/format-date";
import {
  toggleMyCompletion,
  setParticipantCompletion,
  setTaskParticipants,
} from "@/lib/actions/completions";
import { updateTask } from "@/lib/actions/tasks";

export type PanelMember = { memberId: string; userId: string; name: string; isAdmin?: boolean };
export type PanelContact = { contactId: string; name: string };
export type PanelParticipant = {
  memberId: string;
  completed: boolean;
  completedAt?: string | null;
  // True when this row is the legacy assignee surfaced as a responsible person
  // (no real completion row yet). Toggling completion materialises a real row.
  isAssigneeFallback?: boolean;
};

interface Props {
  taskId: string;
  members: PanelMember[];               // all workspace members (never dept-filtered)
  participants: PanelParticipant[];     // current participants + completion
  // CRM contacts with no matching member (from the shared assignable-people
  // builder) — selectable as the task's responsible contact.
  contacts?: PanelContact[];
  // The task's current responsible_contact_id resolved to a contact, when that
  // contact has no member counterpart (otherwise the member row represents them).
  responsibleContact?: PanelContact | null;
  currentMemberId: string | null;
  isAdmin: boolean;
  isViewer: boolean;
  // Whether the current user may add/remove responsible people on this task.
  // Admin/owner always; a member only on tasks they are already on. Mirrors the
  // server rule in setTaskParticipants / updateTask.
  canManage?: boolean;
  // Admin_only task → only owner/admin people may be responsible.
  adminOnly?: boolean;
}

const ASSIGN_DENIED_NOTE = "Bu göreve sorumlu kişi atama yetkiniz yok.";

export function TaskParticipantsPanel({
  taskId, members, participants, contacts = [], responsibleContact = null,
  currentMemberId, isAdmin, isViewer, canManage = false, adminOnly = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everyone in the workspace is selectable — department membership never
  // restricts assignment. The only narrowing is admin_only visibility.
  const pickerMembers = members.filter((m) => !adminOnly || m.isAdmin);
  const pickerContacts = adminOnly ? [] : contacts;

  const nameOf = (memberId: string) =>
    getPersonDisplayName(members.find((m) => m.memberId === memberId)?.name ?? null);

  const participantIds = new Set(participants.map((p) => p.memberId));
  const mine = currentMemberId ? participants.find((p) => p.memberId === currentMemberId) : undefined;
  const hasAnyResponsible = participants.length > 0 || !!responsibleContact;

  function run(action: () => Promise<{ ok?: true; success?: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res && "error" in res) setError(res.error || "İşlem tamamlanamadı.");
    });
  }

  function toggleParticipant(memberId: string) {
    const next = participantIds.has(memberId)
      ? participants.filter((p) => p.memberId !== memberId).map((p) => p.memberId)
      : [...participants.map((p) => p.memberId), memberId];
    run(() => setTaskParticipants(taskId, next));
  }

  function toggleContact(contactId: string) {
    const next = responsibleContact?.contactId === contactId ? null : contactId;
    run(() => updateTask({ id: taskId, responsible_contact_id: next }));
  }

  return (
    <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
          <Users size={14} className="text-muted" /> Sorumlu kişiler
          {participants.length > 0 && (
            <span className="text-[11px] font-normal text-subtle tabular-nums">
              · {participants.filter((p) => p.completed).length}/{participants.length} tamamlandı
            </span>
          )}
        </h3>
        {!isViewer && canManage && (
          <button
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-strong hover:bg-brand-soft/60 active:scale-[0.98] rounded-md px-1.5 py-1 transition-colors duration-150"
          >
            <UserPlus size={13} /> {editing ? "Bitir" : "Kişi ekle / çıkar"}
          </button>
        )}
      </div>

      {/* Current responsible people with completion state */}
      {!hasAnyResponsible ? (
        <div className="rounded-lg border border-dashed border-line bg-surface-muted/40 px-4 py-6 text-center space-y-2">
          <div className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand ring-4 ring-brand-soft/35">
            <Users size={15} strokeWidth={1.75} />
          </div>
          <p className="text-sm text-subtle">Henüz sorumlu kişi atanmadı.</p>
          {!isViewer && canManage && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-strong active:scale-[0.98] font-medium transition-colors duration-150"
            >
              <UserPlus size={14} /> Sorumlu kişi ekle
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline overflow-hidden">
          {participants.map((p) => {
            const name = nameOf(p.memberId);
            const isMe = p.memberId === currentMemberId;
            return (
              <li
                key={p.memberId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors duration-150",
                  p.completed ? "bg-green-50/40 hover:bg-green-50/70" : "bg-surface hover:bg-surface-hover",
                )}
              >
                <Avatar name={name} size="sm" className={p.completed ? "ring-2 ring-success" : ""} />
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate">
                    {name}
                    {isMe && <span className="ml-1 text-[10px] text-subtle">(siz)</span>}
                    {p.isAssigneeFallback && <span className="ml-1 text-[10px] text-subtle">(atanan)</span>}
                  </p>
                  {p.completed && p.completedAt && (
                    <p className="text-[10px] text-subtle tabular-nums">{formatDateTimeTR(p.completedAt)}</p>
                  )}
                </div>
                {p.completed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                    <Check size={11} /> Tamamladı
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-muted bg-surface-sunken rounded-full px-2 py-0.5">
                    Bekliyor
                  </span>
                )}
                {/* Admin can toggle anyone; a member can toggle their own */}
                {!isViewer && (isAdmin || isMe) && (
                  <button
                    disabled={pending}
                    onClick={() => run(() =>
                      isMe ? toggleMyCompletion(taskId) : setParticipantCompletion(taskId, p.memberId, !p.completed),
                    )}
                    className="text-xs font-medium text-brand hover:text-brand-strong hover:bg-brand-soft/60 active:scale-[0.98] rounded-md px-1.5 py-0.5 disabled:opacity-60 disabled:pointer-events-none shrink-0 transition-colors duration-150"
                  >
                    {p.completed ? "Geri al" : "İşaretle"}
                  </button>
                )}
              </li>
            );
          })}
          {responsibleContact && (
            <li className="flex items-center gap-2.5 px-3 py-2.5 text-sm bg-surface hover:bg-surface-hover transition-colors duration-150">
              <Avatar name={responsibleContact.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {getPersonDisplayName(responsibleContact.name)}
                  <span className="ml-1 text-[10px] text-subtle">(harici kişi)</span>
                </p>
              </div>
              {!isViewer && canManage && (
                <button
                  disabled={pending}
                  onClick={() => toggleContact(responsibleContact.contactId)}
                  className="p-1 rounded-md text-subtle hover:text-danger hover:bg-danger/10 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shrink-0 transition-colors duration-150"
                  aria-label="Sorumlu kişiyi kaldır"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          )}
        </ul>
      )}

      {/* Unauthorized members see the list but can never change it. */}
      {!isViewer && !canManage && (
        <p className="text-xs text-subtle">{ASSIGN_DENIED_NOTE}</p>
      )}

      {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}

      {/* "Benim işim tamam" — only the responsible participant can mark their own
          work done. Non-participants see a clear notice instead (admins manage
          others via the per-person toggles above). */}
      {!isViewer && currentMemberId && mine && (
        <button
          disabled={pending}
          onClick={() => run(() => toggleMyCompletion(taskId))}
          className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 text-white text-sm font-medium py-2 shadow-xs hover:bg-green-700 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none disabled:shadow-none transition-all duration-150"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {mine.completed ? "İşimi geri al" : "Benim işim tamam"}
        </button>
      )}
      {!isViewer && currentMemberId && !mine && !isAdmin && (
        <p className="text-xs text-subtle text-center pt-1">
          Bu görevde sorumlu kişi değilsiniz.
        </p>
      )}

      {/* Assignment editor: EVERY workspace member (and unmatched CRM contact)
          is selectable — the shared assignable-people list, no department filter. */}
      {editing && !isViewer && canManage && (
        <div className="anim-fade-up border-t border-hairline pt-3 space-y-1.5">
          <p className="text-xs text-muted">
            Bu görevin sorumlularını seçin — tüm ekip üyeleri seçilebilir:
          </p>
          <div className="flex flex-wrap gap-2">
            {pickerMembers.map((m) => {
              const on = participantIds.has(m.memberId);
              return (
                <button
                  key={m.memberId}
                  disabled={pending}
                  onClick={() => toggleParticipant(m.memberId)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs border transition-colors duration-150 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none ${
                    on ? "bg-brand-soft border-brand-ring text-brand-strong font-medium" : "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong"
                  }`}
                >
                  <Avatar name={m.name} size="xs" />
                  {getPersonDisplayName(m.name)}
                  {on && <Check size={11} />}
                </button>
              );
            })}
            {pickerMembers.length === 0 && (
              <p className="text-xs text-subtle">Çalışma alanında üye yok.</p>
            )}
          </div>
          {pickerContacts.length > 0 && (
            <>
              <p className="text-xs text-muted pt-1.5">
                Kişiler (CRM) — sistem hesabı olmayan sorumlu:
              </p>
              <div className="flex flex-wrap gap-2">
                {pickerContacts.map((c) => {
                  const on = responsibleContact?.contactId === c.contactId;
                  return (
                    <button
                      key={c.contactId}
                      disabled={pending}
                      onClick={() => toggleContact(c.contactId)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs border transition-colors duration-150 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none ${
                        on ? "bg-brand-soft border-brand-ring text-brand-strong font-medium" : "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong"
                      }`}
                    >
                      <Avatar name={c.name} size="xs" />
                      {getPersonDisplayName(c.name)}
                      {on && <Check size={11} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
