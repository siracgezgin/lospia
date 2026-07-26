"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus, X, Check } from "lucide-react";
import { linkContactToUser, unlinkContactUser } from "@/lib/actions/crm";
import { normalizePersonName } from "@/lib/utils/task-person-match";
import { cn } from "@/lib/utils/cn";
import type { WorkspaceContact } from "@/types";
import type { CrmMember } from "./CrmView";

interface Props {
  contacts: WorkspaceContact[];
  members: CrmMember[];
}

// Suggest a system user for an unlinked contact: exact e-mail first, then a
// normalized full-name match. Contact e-mails and auth e-mails need NOT be the
// same, so this is a hint only — nothing is auto-applied.
function suggestMember(contact: WorkspaceContact, members: CrmMember[]): CrmMember | null {
  const email = contact.email?.trim().toLowerCase();
  if (email) {
    const byEmail = members.find((m) => m.email?.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const nameKey = normalizePersonName(contact.name);
  if (nameKey) {
    const byName = members.find((m) => normalizePersonName(m.name) === nameKey);
    if (byName) return byName;
  }
  return null;
}

function MatchRow({ contact, members }: { contact: WorkspaceContact; members: CrmMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const suggestion = useMemo(
    () => (contact.user_id ? null : suggestMember(contact, members)),
    [contact, members],
  );
  const [selected, setSelected] = useState<string>(suggestion?.userId ?? "");

  const linkedMember = contact.user_id ? members.find((m) => m.userId === contact.user_id) : null;

  function doLink(userId: string) {
    if (!userId) return;
    setError(null);
    startTransition(async () => {
      const res = await linkContactToUser(contact.id, userId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }
  function doUnlink() {
    setError(null);
    startTransition(async () => {
      const res = await unlinkContactUser(contact.id);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover">
      {/* Contact identity */}
      <div className="min-w-[160px] flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{contact.name}</div>
        <div className="truncate text-[11.5px] text-subtle">{contact.email || "e-posta yok"}</div>
      </div>

      {/* Link status + controls */}
      {linkedMember ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#dcf0e6] px-2 py-1 text-[12px] font-medium text-[#1f6e4d]">
            <UserCheck size={13} />
            Sistem hesabı: {linkedMember.name}
          </span>
          <button
            onClick={doUnlink}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <X size={13} /> Eşleşmeyi kaldır
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {suggestion ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#e3effb] px-2 py-1 text-[12px] font-medium text-[#1f5fa8]">
              Öneri: {suggestion.name}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-surface-sunken px-2 py-1 text-[12px] text-subtle">
              Eşleşmedi
            </span>
          )}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-muted transition-colors duration-150 hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40"
          >
            <option value="">Sistem hesabı seç…</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
          <button
            onClick={() => doLink(selected)}
            disabled={isPending || !selected}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-150 active:scale-[0.98]",
              !selected || isPending
                ? "bg-surface-sunken text-subtle cursor-not-allowed"
                : "bg-brand text-white hover:bg-brand-strong",
            )}
          >
            <Check size={13} /> Eşleştir
          </button>
        </div>
      )}

      {error && <p role="alert" className="anim-fade-down w-full text-[12px] text-danger">{error}</p>}
    </div>
  );
}

/**
 * Admin-only panel to confirm which CRM contact is which system user. Manual
 * links only (with suggestions). Once linked, the task deep-link matcher counts
 * the member's assignee tasks toward this contact too.
 */
export function ContactMatchingPanel({ contacts, members }: Props) {
  const unlinked = contacts.filter((c) => !c.user_id).length;

  return (
    <div className="anim-fade-up mb-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-muted px-4 py-2.5">
        <UserPlus size={15} className="text-brand" />
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">Kişi eşleştirme</h2>
        <span className="text-[12px] tabular-nums text-subtle">
          {contacts.length - unlinked}/{contacts.length} eşleşti
        </span>
      </div>
      <p className="px-4 pt-2.5 text-[12px] text-muted">
        CRM kişilerini sistem kullanıcılarıyla eşleştirin. Eşleştirme el ile yapılır; e-posta
        veya isim yalnızca öneri için kullanılır, otomatik uygulanmaz.
      </p>
      <div className="mt-1 max-h-[420px] divide-y divide-hairline overflow-y-auto">
        {contacts.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-subtle">Kayıtlı kişi yok.</p>
        ) : (
          contacts.map((c) => <MatchRow key={c.id} contact={c} members={members} />)
        )}
      </div>
    </div>
  );
}
