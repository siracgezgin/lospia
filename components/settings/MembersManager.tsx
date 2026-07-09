"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserMinus, ChevronDown, Pencil, Check } from "lucide-react";
import {
  revokeTeamAccess,
  changeWorkspaceMemberRole,
  removeWorkspaceMemberAccount,
  renameWorkspaceMember,
  setMemberUsername,
  setMemberNotificationEmail,
} from "@/lib/actions/workspace";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import type {
  WorkspaceMember, Profile, WorkspaceInvite, WorkspaceRole,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";
import { roleLabel, ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { buildDeptMeta } from "@/lib/utils/departments";
import { getDepartmentBadge } from "@/lib/design/semantics";
import { cn } from "@/lib/utils/cn";

interface MemberRow extends WorkspaceMember {
  profiles?: Partial<Profile> | null;
}

interface Props {
  workspaceId: string;
  currentUserId: string;
  userRole: WorkspaceRole;
  initialMembers: MemberRow[];
  /** Allowed e-mails that have not joined yet (team-access grants). */
  pendingGrants: WorkspaceInvite[];
  departments?: WorkspaceDepartment[];
  deptMembers?: DepartmentMember[];
}

export function MembersManager({
  currentUserId,
  userRole,
  initialMembers,
  pendingGrants,
  departments = [],
  deptMembers = [],
}: Props) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [grants, setGrants] = useState(pendingGrants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Inline name editing (owner fixes stale/placeholder names).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Inline username editing (owner sets/corrects a member's username).
  const [editingUsernameId, setEditingUsernameId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");

  // Inline notification e-mail editing (workspace_members.notification_email —
  // the REAL outbound address; the auth/login e-mail is never touched here).
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");

  // Pending confirmation for a destructive delete.
  const [confirm, setConfirm] = useState<
    | { kind: "grant"; id: string; label: string }
    | { kind: "member"; id: string; label: string }
    | null
  >(null);

  const isOwner = userRole === "owner";

  // member_id (workspace_members.id) → department badges (name + effective colour)
  const deptMeta = buildDeptMeta(departments);
  const deptsByMember = new Map<string, { name: string; color: string | null }[]>();
  for (const dm of deptMembers) {
    const meta = deptMeta[dm.department_id];
    if (!meta) continue;
    const arr = deptsByMember.get(dm.member_id) ?? [];
    arr.push({ name: meta.name, color: meta.color });
    deptsByMember.set(dm.member_id, arr);
  }

  function handleRoleChange(memberId: string, newRole: "admin" | "member" | "viewer") {
    setError(null);
    startTransition(async () => {
      const result = await changeWorkspaceMemberRole(memberId, newRole);
      if ("error" in result) { setError(result.error); return; }
      setMembers((prev) =>
        prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m)
      );
    });
  }

  function handleSaveName(memberId: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setError(null);
    startTransition(async () => {
      const result = await renameWorkspaceMember(memberId, name);
      if ("error" in result) { setError(result.error); return; }
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, profiles: { ...(m.profiles ?? {}), full_name: name } }
            : m
        )
      );
      setEditingId(null);
    });
  }

  function handleSaveUsername(memberId: string) {
    const username = editUsername.trim().toLowerCase();
    if (!username) { setEditingUsernameId(null); return; }
    setError(null);
    startTransition(async () => {
      const result = await setMemberUsername(memberId, username);
      if ("error" in result) { setError(result.error); return; }
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, profiles: { ...(m.profiles ?? {}), username } }
            : m
        )
      );
      setEditingUsernameId(null);
    });
  }

  function handleSaveEmail(memberId: string) {
    setError(null);
    startTransition(async () => {
      // Empty input clears the address (falls back to profiles.email when real).
      const result = await setMemberNotificationEmail({
        memberId,
        notificationEmail: editEmail.trim() === "" ? null : editEmail,
      });
      if ("error" in result) { setError(result.error); return; }
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId ? { ...m, notification_email: result.notificationEmail } : m
        )
      );
      setEditingEmailId(null);
    });
  }

  // Runs only after the user confirms in the dialog.
  function runConfirmedDelete() {
    if (!confirm) return;
    const target = confirm;
    setError(null);
    startTransition(async () => {
      if (target.kind === "grant") {
        const result = await revokeTeamAccess(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setGrants((prev) => prev.filter((g) => g.id !== target.id));
      } else {
        const result = await removeWorkspaceMemberAccount(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setMembers((prev) => prev.filter((m) => m.id !== target.id));
        // Reflect the server-side cleanup (auth user / profile removal) so the
        // list can't show a stale row after a refresh.
        router.refresh();
      }
      setConfirm(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Current members */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const isOwnerRow = m.role === "owner";
          const canManage = isOwner && !isSelf && !isOwnerRow;

          return (
            <div key={m.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                {editingId === m.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName(m.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      disabled={isPending}
                      className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSaveName(m.id)}
                      disabled={isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                      aria-label="Kaydet"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={isPending}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                      aria-label="Vazgeç"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                    <span className="truncate">{m.profiles?.full_name ?? m.profiles?.email ?? "—"}</span>
                    {isSelf && <span className="text-[10px] text-gray-400">(siz)</span>}
                    {isOwner && (
                      <button
                        onClick={() => { setEditingId(m.id); setEditName(m.profiles?.full_name ?? ""); }}
                        className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 shrink-0"
                        aria-label="İsmi düzenle"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </p>
                )}
                {editingUsernameId === m.id ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-gray-400">@</span>
                    <input
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveUsername(m.id);
                        if (e.key === "Escape") setEditingUsernameId(null);
                      }}
                      autoFocus
                      disabled={isPending}
                      placeholder="kullanici.adi"
                      className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSaveUsername(m.id)}
                      disabled={isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                      aria-label="Kaydet"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingUsernameId(null)}
                      disabled={isPending}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                      aria-label="Vazgeç"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                    <span className="truncate">
                      {m.profiles?.username ? `@${m.profiles.username}` : "Kullanıcı adı yok"}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => { setEditingUsernameId(m.id); setEditUsername(m.profiles?.username ?? ""); }}
                        className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 shrink-0"
                        aria-label="Kullanıcı adını düzenle"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </p>
                )}
                {editingEmailId === m.id ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleSaveEmail(m.id); }
                        if (e.key === "Escape") setEditingEmailId(null);
                      }}
                      autoFocus
                      disabled={isPending}
                      placeholder="bildirim@ornek.com"
                      className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSaveEmail(m.id)}
                      disabled={isPending}
                      className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                      aria-label="Kaydet"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingEmailId(null)}
                      disabled={isPending}
                      className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                      aria-label="Vazgeç"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (() => {
                  // notification_email → real profiles.email → "not set".
                  // @lospia.local login placeholders are never shown as a
                  // notification address.
                  const display = getDisplayNotificationEmail(m);
                  return (
                    <p className="text-xs truncate flex items-center gap-1">
                      <span
                        className={cn(
                          "truncate",
                          display.email ? "text-gray-400" : "text-amber-600"
                        )}
                      >
                        {display.email ?? "Bildirim e-postası eklenmedi"}
                      </span>
                      {isOwner && (
                        <button
                          onClick={() => {
                            setEditingEmailId(m.id);
                            setEditEmail(m.notification_email ?? "");
                          }}
                          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 shrink-0"
                          aria-label="Bildirim e-postasını düzenle"
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </p>
                  );
                })()}
                {(deptsByMember.get(m.id) ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(deptsByMember.get(m.id) ?? []).map((d) => {
                      const badge = getDepartmentBadge(d.color);
                      return (
                        <span
                          key={d.name}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1",
                            badge.chip,
                            badge.ring,
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
                          {d.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {canManage ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value as "admin" | "member" | "viewer")}
                      disabled={isPending}
                      className="appearance-none text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
                    >
                      {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => setConfirm({
                      kind: "member",
                      id: m.id,
                      label: m.profiles?.full_name ?? m.profiles?.email ?? "",
                    })}
                    disabled={isPending}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    aria-label="Üyeyi kaldır"
                  >
                    <UserMinus size={13} />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full shrink-0">
                  {roleLabel(m.role)}
                </span>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {/* Legacy team-access grants. Self-signup is DISABLED — new people are added
          via "Hesap oluştur" above. Any leftover pending grants from the old flow
          are shown here so an owner can revoke them; no new ones can be added. */}
      {isOwner && grants.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bekleyen eski erişimler</p>
          <p className="text-xs text-gray-400 mt-1 mb-2">
            Self-signup kapatıldı. Aşağıdaki eski kayıtlar artık kullanılmıyor; kaldırabilirsiniz.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {g.username ? `@${g.username}` : "—"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{g.email}</p>
                  <p className="text-xs text-gray-400">{roleLabel(g.role)} · Kullanılmıyor</p>
                </div>
                <button
                  onClick={() => setConfirm({ kind: "grant", id: g.id, label: g.email })}
                  disabled={isPending}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  aria-label="Erişimi kaldır"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirm !== null}
        pending={isPending}
        title={
          confirm?.kind === "member"
            ? "Bu kullanıcıyı silmek istediğinizden emin misiniz?"
            : "Silmek istediğinize emin misiniz?"
        }
        confirmLabel={confirm?.kind === "member" ? "Evet, sil" : "Sil"}
        message={
          confirm?.kind === "grant"
            ? `${confirm.label} için ekip erişimi kaldırılacak.`
            : confirm?.kind === "member"
              ? `${confirm.label} silinecek. Bu işlem kullanıcının giriş erişimini kaldırır ve hesabını sistemden temizler. Oluşturduğu görev/not kayıtları korunur.`
              : ""
        }
        onConfirm={runConfirmedDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
