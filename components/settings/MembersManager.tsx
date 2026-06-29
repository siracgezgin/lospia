"use client";

import { useState, useTransition } from "react";
import { Plus, X, UserMinus, ChevronDown, Copy, Check } from "lucide-react";
import {
  createWorkspaceInvite,
  cancelWorkspaceInvite,
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/lib/actions/workspace";
import type {
  WorkspaceMember, Profile, WorkspaceInvite, WorkspaceRole,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";
import { roleLabel, ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";

interface MemberRow extends WorkspaceMember {
  profiles?: Partial<Profile> | null;
}

interface Props {
  workspaceId: string;
  currentUserId: string;
  userRole: WorkspaceRole;
  initialMembers: MemberRow[];
  initialInvites: WorkspaceInvite[];
  departments?: WorkspaceDepartment[];
  deptMembers?: DepartmentMember[];
}

/** Build the account-creation link an admin hands to a new team member. The
 *  person opens it, sets their own password, and joins AF Operasyon — no e-mail
 *  is sent by the system, so there is no rate limit to hit. */
function onboardingLink(email: string, fullName?: string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const name = fullName ? `&name=${encodeURIComponent(fullName)}` : "";
  return `${origin}/login?mode=signup&email=${encodeURIComponent(email)}${name}`;
}

function CopyLinkButton({ email, fullName }: { email: string; fullName?: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(onboardingLink(email, fullName));
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch { /* clipboard unavailable — link is still shown below */ }
      }}
      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 shrink-0"
      title="Hesap oluşturma bağlantısını kopyala"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
    </button>
  );
}

export function MembersManager({
  workspaceId,
  currentUserId,
  userRole,
  initialMembers,
  initialInvites,
  departments = [],
  deptMembers = [],
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add-member form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const isOwner = userRole === "owner";

  // member_id (workspace_members.id) → department names
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
  const deptsByMember = new Map<string, string[]>();
  for (const dm of deptMembers) {
    const name = deptNameById.get(dm.department_id);
    if (!name) continue;
    const arr = deptsByMember.get(dm.member_id) ?? [];
    arr.push(name);
    deptsByMember.set(dm.member_id, arr);
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    const name = inviteName.trim();
    startTransition(async () => {
      const result = await createWorkspaceInvite(workspaceId, inviteEmail.trim(), inviteRole, name || undefined);
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
          full_name: name || null,
        },
      ]);
      setInviteName("");
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
            <div key={m.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                  {isSelf && <span className="ml-1.5 text-[10px] text-gray-400">(siz)</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{m.profiles?.email}</p>
                {(deptsByMember.get(m.id) ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(deptsByMember.get(m.id) ?? []).map((name) => (
                      <span key={name} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {name}
                      </span>
                    ))}
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
                  {roleLabel(m.role)}
                </span>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {/* Prepared accounts awaiting first sign-in */}
      {invites.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bekleyen hesap kurulumu</p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{inv.full_name || inv.email}</p>
                  <p className="text-xs text-gray-400">
                    {inv.full_name ? `${inv.email} · ` : ""}{roleLabel(inv.role)} · Kurulum bekleniyor
                  </p>
                </div>
                {isOwner && (
                  <>
                    <CopyLinkButton email={inv.email} fullName={inv.full_name} />
                    <button
                      onClick={() => handleCancelInvite(inv.id)}
                      disabled={isPending}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      aria-label="Hesap kurulumunu kaldır"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Hesap oluşturma bağlantısını ilgili kişiye iletin. Kişi bağlantıyı açıp kendi şifresini
            belirleyerek AF Operasyon’a katılır. Sistem e-posta göndermez.
          </p>
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
              Ekip üyesi ekle
            </button>
          ) : (
            <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Yeni ekip üyesi</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Ad Soyad"
                  autoFocus
                  className="flex-1 min-w-[160px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="E-posta adresi"
                  required
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-400">
                Kaydettikten sonra oluşturulan hesap oluşturma bağlantısını kişiye iletin. Departman
                ataması, kişi katıldıktan sonra yukarıdaki Departmanlar bölümünden yapılır.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isPending || !inviteEmail.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Hazırlanıyor…" : "Ekip üyesi ekle"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInviteForm(false); setInviteName(""); setInviteEmail(""); setError(null); }}
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
