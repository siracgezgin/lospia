"use client";

import { useState, useTransition } from "react";
import { Plus, X, UserMinus, ChevronDown, Pencil, Check } from "lucide-react";
import {
  addTeamAccess,
  revokeTeamAccess,
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
  renameWorkspaceMember,
} from "@/lib/actions/workspace";
import type {
  WorkspaceMember, Profile, WorkspaceInvite, WorkspaceRole,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";
import { roleLabel, ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  workspaceId,
  currentUserId,
  userRole,
  initialMembers,
  pendingGrants,
  departments = [],
  deptMembers = [],
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [grants, setGrants] = useState(pendingGrants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Add-access form state — email + role only. The person enters their own name
  // during signup, so no name field here.
  const [showAddForm, setShowAddForm] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState<"admin" | "member">("member");

  // Inline name editing (owner fixes stale/placeholder names).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Pending confirmation for a destructive delete.
  const [confirm, setConfirm] = useState<
    | { kind: "grant"; id: string; label: string }
    | { kind: "member"; id: string; label: string }
    | null
  >(null);

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

  function handleAddAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!grantEmail.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addTeamAccess(workspaceId, grantEmail.trim(), grantRole);
      if ("error" in result) { setError(result.error); return; }
      setGrants((prev) => [
        ...prev,
        {
          id: result.id,
          workspace_id: workspaceId,
          email: grantEmail.trim().toLowerCase(),
          role: grantRole,
          invited_by: currentUserId,
          accepted_at: null,
          accepted_user_id: null,
          created_at: new Date().toISOString(),
          full_name: null,
        },
      ]);
      setGrantEmail("");
      setGrantRole("member");
      setShowAddForm(false);
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
        const result = await removeWorkspaceMember(target.id);
        if ("error" in result) { setError(result.error); setConfirm(null); return; }
        setMembers((prev) => prev.filter((m) => m.id !== target.id));
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

      {/* Team access — allowed e-mails awaiting first sign-in */}
      {isOwner && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ekip erişimi</p>
          <p className="text-xs text-gray-400 mt-1 mb-2">
            Bu listeye eklenen e-posta adresleri hesap oluşturduğunda AF Operasyon’a katılır.
          </p>

          {grants.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {grants.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-5 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{g.email}</p>
                    <p className="text-xs text-gray-400">
                      {roleLabel(g.role)} · Hesap bekleniyor
                    </p>
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
          )}

          {/* Add-access form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={14} />
              Erişim ekle
            </button>
          ) : (
            <form onSubmit={handleAddAccess} className="mt-3 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Yeni erişim</p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  placeholder="E-posta"
                  required
                  autoFocus
                  className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                />
                <select
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as "admin" | "member")}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isPending}
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-400">
                Kişi /login üzerinden bu e-posta ile hesap oluşturduğunda AF Operasyon’a katılır.
                Departman ataması, kişi katıldıktan sonra yukarıdaki Departmanlar bölümünden yapılır.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isPending || !grantEmail.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Ekleniyor…" : "Erişim ekle"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setGrantEmail(""); setError(null); }}
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

      {error && !showAddForm && <p className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={confirm !== null}
        pending={isPending}
        message={
          confirm?.kind === "grant"
            ? `${confirm.label} için ekip erişimi kaldırılacak.`
            : confirm?.kind === "member"
              ? `${confirm.label} çalışma alanından kaldırılacak. Mevcut görev kayıtları korunur.`
              : ""
        }
        onConfirm={runConfirmedDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
