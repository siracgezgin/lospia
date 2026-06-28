"use client";

import { useState, useTransition } from "react";
import { Check, UserPlus, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import {
  toggleMyCompletion,
  setParticipantCompletion,
  setTaskParticipants,
} from "@/lib/actions/completions";

export type PanelMember = { memberId: string; userId: string; name: string };
export type PanelParticipant = { memberId: string; completed: boolean };

interface Props {
  taskId: string;
  members: PanelMember[];               // all workspace members
  participants: PanelParticipant[];     // current participants + completion
  currentMemberId: string | null;
  isAdmin: boolean;
  isViewer: boolean;
  // Member ids eligible for this task's department; null = no department → all.
  eligibleMemberIds?: string[] | null;
}

export function TaskParticipantsPanel({
  taskId, members, participants, currentMemberId, isAdmin, isViewer, eligibleMemberIds = null,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  // Department-filtered picker: when a department is selected, only its members
  // are offered. Already-selected participants stay editable regardless.
  const eligibleSet = eligibleMemberIds ? new Set(eligibleMemberIds) : null;
  const pickerMembers = eligibleSet ? members.filter((m) => eligibleSet.has(m.memberId)) : members;

  const nameOf = (memberId: string) =>
    getPersonDisplayName(members.find((m) => m.memberId === memberId)?.name ?? null);

  const participantIds = new Set(participants.map((p) => p.memberId));
  const mine = currentMemberId ? participants.find((p) => p.memberId === currentMemberId) : undefined;

  function toggleParticipant(memberId: string) {
    const next = participantIds.has(memberId)
      ? participants.filter((p) => p.memberId !== memberId).map((p) => p.memberId)
      : [...participants.map((p) => p.memberId), memberId];
    startTransition(() => { void setTaskParticipants(taskId, next); });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Sorumlu kişiler</h3>
        {!isViewer && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <UserPlus size={13} /> {editing ? "Bitir" : "Kişi ekle / çıkar"}
          </button>
        )}
      </div>

      {/* Current participants with completion state */}
      {participants.length === 0 ? (
        <p className="text-sm text-gray-400">Henüz sorumlu kişi atanmadı.</p>
      ) : (
        <ul className="space-y-1.5">
          {participants.map((p) => {
            const name = nameOf(p.memberId);
            const isMe = p.memberId === currentMemberId;
            return (
              <li key={p.memberId} className="flex items-center gap-2 text-sm">
                <Avatar name={name} size="xs" className={p.completed ? "ring-2 ring-green-500" : ""} />
                <span className="text-gray-700">{name}</span>
                {p.completed ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-green-700">
                    <Check size={12} /> tamamladı
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">bekleniyor</span>
                )}
                {/* Admin can toggle anyone; a member can toggle their own */}
                {!isViewer && (isAdmin || isMe) && (
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => {
                      if (isMe) void toggleMyCompletion(taskId);
                      else void setParticipantCompletion(taskId, p.memberId, !p.completed);
                    })}
                    className="ml-auto text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                  >
                    {p.completed ? "Geri al" : "Tamamlandı işaretle"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* "Benim işim tamam" — only the responsible participant can mark their own
          work done. Non-participants see a clear notice instead (admins manage
          others via the per-person toggles above). */}
      {!isViewer && currentMemberId && mine && (
        <button
          disabled={pending}
          onClick={() => startTransition(() => { void toggleMyCompletion(taskId); })}
          className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 text-white text-sm font-medium py-2 hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {mine.completed ? "İşimi geri al" : "Benim işim tamam"}
        </button>
      )}
      {!isViewer && currentMemberId && !mine && !isAdmin && (
        <p className="text-xs text-gray-400 text-center pt-1">
          Bu görevde sorumlu kişi değilsiniz.
        </p>
      )}

      {/* Participant editor: pick workspace members */}
      {editing && !isViewer && (
        <div className="border-t border-gray-100 pt-3 space-y-1.5">
          <p className="text-xs text-gray-500">Bu görevin sorumlularını seçin:</p>
          <div className="flex flex-wrap gap-2">
            {pickerMembers.map((m) => {
              const on = participantIds.has(m.memberId);
              return (
                <button
                  key={m.memberId}
                  disabled={pending}
                  onClick={() => toggleParticipant(m.memberId)}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs border transition-colors disabled:opacity-50 ${
                    on ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Avatar name={m.name} size="xs" />
                  {getPersonDisplayName(m.name)}
                  {on && <Check size={11} />}
                </button>
              );
            })}
            {pickerMembers.length === 0 && (
              <p className="text-xs text-gray-400">
                {eligibleSet
                  ? "Bu departmana atanmış üye yok. Ayarlar > Departmanlar'dan üye ekleyin."
                  : "Çalışma alanında üye yok."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
