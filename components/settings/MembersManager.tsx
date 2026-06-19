"use client";

import { useState, useTransition } from "react";
import { Plus, X, UserMinus, ChevronDown } from "lucide-react";
import {
  createWorkspaceInvite,
  cancelWorkspaceInvite,
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/lib/actions/workspace";
import type { WorkspaceMember, Profile, WorkspaceInvite, WorkspaceRole } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  owner:  "Sahip",
  admin:  "Yönetici",
  member: "Üye",
  viewer: "İzleyici",
};

const ASSIGNABLE_ROLES: ("admin" | "member" | "viewer")[] = ["admin", "member", "viewer"];

interface MemberRow extends WorkspaceMember {
  profiles?: Partial<Profile> | null;
}

interface Props {
  workspaceId: string;
  currentUserId: string;
  userRole: WorkspaceRole;
  initialMembers: MemberRow[];
  initialInvites: WorkspaceInvite[];
}

export function MembersManager({
  workspaceId,
  currentUserId,
  userRole,
  initialMembers,
  initialInvites,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const isOwner = userRole === "owner";

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createWorkspaceInvite(workspaceId, inviteEmail.trim(), inviteRole);
      if ("error" in result) { setError(result.error); return; }
      setInvites((prev) => [
        ...prev,
        {
          id: result.id,
          workspace_id: workspaceId,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          invited_by: currentUserId,
          accepted_at: null,
          created_at: new Date().toISOString(),
        },
      ]);
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteForm(false);
    });
  }

  function handleCancelInvite(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelWorkspaceInvite(id);
      if ("error" in result) { setError(result.error); return; }
      setInvites((prev) => prev.filter((inv) => inv.id !== id));
    });
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

  function handleRemoveMember(memberId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeWorkspaceMember(memberId);
      if ("error" in result) { setError(result.error); return; }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
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
            <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                  {isSelf && <span className="ml-1.5 text-[10px] text-gray-400">(siz)</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{m.profiles?.email}</p>
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
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={isPending}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    aria-label="Üyeyi kaldır"
                  >
                    <UserMinus size={13} />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full shrink-0">
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bekleyen davetler</p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{inv.email}</p>
                  <p className="text-xs text-gray-400">{ROLE_LABELS[inv.role] ?? inv.role} · Bekliyor</p>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    disabled={isPending}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    aria-label="Daveti iptal et"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form — owner only */}
      {isOwner && (
        <div>
          {!showInviteForm ? (
            <button
              onClick={() => setShowInviteForm(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={14} />
              Kullanıcı davet et
            </button>
          ) : (
            <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Yeni davet</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="E-posta adresi"
                  required
                  autoFocus
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isPending || !inviteEmail.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Gönderiliyor…" : "Davet gönder"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInviteForm(false); setInviteEmail(""); setError(null); }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  İptal
                </button>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </form>
          )}
        </div>
      )}

      {error && !showInviteForm && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
