"use client";

import { useState, useTransition } from "react";
import { Check, UserPlus, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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

/* Kişi seçme çipi (pill yalnız chip/avatar için serbest). Seçili = marka
   dolgusu + onay işareti; renk tek başına sinyal değil. */
const PICK_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1 text-[12.5px] transition-colors duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:text-subtle";
const PICK_ON = "bg-brand-soft border-brand-ring text-brand-strong font-medium";
const PICK_OFF = "bg-surface border-line text-muted hover:bg-surface-hover hover:border-line-strong";

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
      <div className="flex items-center justify-between gap-3">
        {/* "2/3 tamamlandı" sayacı kaldırıldı — kişiyi puanlayan sayı (sadelik
            kuralı); her satır kendi durumunu zaten söylüyor. */}
        <h3 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
          <Users size={14} className="text-muted" aria-hidden /> Sorumlu kişiler
        </h3>
        {!isViewer && canManage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="text-brand hover:text-brand-strong"
          >
            <UserPlus size={13} aria-hidden /> {editing ? "Bitir" : "Kişi ekle / çıkar"}
          </Button>
        )}
      </div>

      {/* Current responsible people with completion state */}
      {!hasAnyResponsible ? (
        <EmptyState
          compact
          icon={Users}
          title="Henüz sorumlu kişi yok."
          action={
            !isViewer && canManage && !editing ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <UserPlus size={14} aria-hidden /> Sorumlu kişi ekle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-hairline rounded-control border border-hairline overflow-hidden">
          {participants.map((p) => {
            const name = nameOf(p.memberId);
            const isMe = p.memberId === currentMemberId;
            return (
              <li
                key={p.memberId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-[13.5px] transition-colors duration-150",
                  // Yeşil yalnız "tamamlandı" içindir — burada tam olarak o.
                  p.completed ? "bg-success/5 hover:bg-success/10" : "bg-surface hover:bg-surface-hover",
                )}
              >
                <Avatar name={name} size="sm" className={p.completed ? "ring-2 ring-success" : ""} />
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate">
                    {name}
                    {isMe && <span className="ml-1 text-[12px] text-subtle">(siz)</span>}
                    {p.isAssigneeFallback && <span className="ml-1 text-[12px] text-subtle">(atanan)</span>}
                  </p>
                  {p.completed && p.completedAt && (
                    <p className="text-[12px] text-subtle tabular-nums">{formatDateTimeTR(p.completedAt)}</p>
                  )}
                </div>
                {/* Satır başına tek rozet: kişinin durumu. */}
                {p.completed ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success bg-success/10 rounded-full px-2 py-0.5 whitespace-nowrap">
                    <Check size={11} aria-hidden /> Tamamladı
                  </span>
                ) : (
                  <span className="text-[12px] font-medium text-muted bg-surface-sunken rounded-full px-2 py-0.5 whitespace-nowrap">
                    Bekliyor
                  </span>
                )}
                {/* Admin can toggle anyone; a member can toggle their own */}
                {!isViewer && (isAdmin || isMe) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() =>
                      isMe ? toggleMyCompletion(taskId) : setParticipantCompletion(taskId, p.memberId, !p.completed),
                    )}
                    className="shrink-0 text-brand hover:text-brand-strong"
                  >
                    {p.completed ? "Geri al" : "İşaretle"}
                  </Button>
                )}
              </li>
            );
          })}
          {responsibleContact && (
            <li className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] bg-surface hover:bg-surface-hover transition-colors duration-150">
              <Avatar name={responsibleContact.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {getPersonDisplayName(responsibleContact.name)}
                  <span className="ml-1 text-[12px] text-subtle">(harici kişi)</span>
                </p>
              </div>
              {!isViewer && canManage && (
                <IconButton
                  size="sm"
                  disabled={pending}
                  onClick={() => toggleContact(responsibleContact.contactId)}
                  aria-label="Sorumlu kişiyi kaldır"
                  className="text-subtle hover:text-danger hover:bg-danger/10"
                >
                  <X size={14} />
                </IconButton>
              )}
            </li>
          )}
        </ul>
      )}

      {/* Unauthorized members see the list but can never change it. */}
      {!isViewer && !canManage && (
        <p className="text-[12px] text-subtle">{ASSIGN_DENIED_NOTE}</p>
      )}

      {error && <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>}

      {/* "Benim işim tamam" — only the responsible participant can mark their own
          work done. Non-participants see a clear notice instead (admins manage
          others via the per-person toggles above). Ekranın tek primary'si
          üstteki "Kaydet"; bu yüzden çerçeveli (secondary) ama tam genişlikte. */}
      {!isViewer && currentMemberId && mine && (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => run(() => toggleMyCompletion(taskId))}
          className="w-full mt-1"
        >
          {!pending && <Check size={14} aria-hidden />}
          {mine.completed ? "İşimi geri al" : "Benim işim tamam"}
        </Button>
      )}
      {!isViewer && currentMemberId && !mine && !isAdmin && (
        <p className="text-[12px] text-subtle text-center pt-1">
          Bu görevde sorumlu kişi değilsiniz.
        </p>
      )}

      {/* Assignment editor: EVERY workspace member (and unmatched CRM contact)
          is selectable — the shared assignable-people list, no department filter. */}
      {editing && !isViewer && canManage && (
        <div className="anim-fade-up border-t border-hairline pt-3 space-y-1.5">
          <p className="text-[12.5px] text-muted">
            Bu görevin sorumlularını seçin — tüm ekip üyeleri seçilebilir:
          </p>
          <div className="flex flex-wrap gap-2">
            {pickerMembers.map((m) => {
              const on = participantIds.has(m.memberId);
              return (
                <button
                  key={m.memberId}
                  type="button"
                  disabled={pending}
                  onClick={() => toggleParticipant(m.memberId)}
                  aria-pressed={on}
                  className={cn(PICK_CHIP, on ? PICK_ON : PICK_OFF)}
                >
                  <Avatar name={m.name} size="xs" />
                  {getPersonDisplayName(m.name)}
                  {on && <Check size={11} aria-hidden />}
                </button>
              );
            })}
            {pickerMembers.length === 0 && (
              <p className="text-[12.5px] text-subtle">Çalışma alanında üye yok.</p>
            )}
          </div>
          {pickerContacts.length > 0 && (
            <>
              <p className="text-[12.5px] text-muted pt-1.5">
                Kişiler (CRM) — sistem hesabı olmayan sorumlu:
              </p>
              <div className="flex flex-wrap gap-2">
                {pickerContacts.map((c) => {
                  const on = responsibleContact?.contactId === c.contactId;
                  return (
                    <button
                      key={c.contactId}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleContact(c.contactId)}
                      aria-pressed={on}
                      className={cn(PICK_CHIP, on ? PICK_ON : PICK_OFF)}
                    >
                      <Avatar name={c.name} size="xs" />
                      {getPersonDisplayName(c.name)}
                      {on && <Check size={11} aria-hidden />}
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
