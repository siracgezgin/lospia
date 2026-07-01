"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { createMemberAccount } from "@/lib/actions/workspace";
import { ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import type { WorkspaceDepartment } from "@/types";

interface Props {
  workspaceId: string;
  departments?: WorkspaceDepartment[];
}

// Admin-created account form. Replaces the old self-signup ("Ekip erişimi") flow:
// an owner/admin sets the person's name, username, password and role; the person
// then signs in directly with that username + password — no registration step.
export function CreateAccountPanel({ workspaceId, departments = [] }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only top-level + child departments are assignable; mirror the task detail picker.
  const topLevel = departments.filter((d) => d.parent_id === null);
  const childrenOf = (pid: string) => departments.filter((d) => d.parent_id === pid);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!fullName.trim() || !username.trim() || !password) return;
    startTransition(async () => {
      const result = await createMemberAccount({
        workspaceId,
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        password,
        role,
        departmentId: departmentId || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreated(username.trim().toLowerCase());
      setFullName("");
      setUsername("");
      setPassword("");
      setRole("member");
      setDepartmentId("");
      // Surface the new member in the list immediately (no manual reload).
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus size={15} className="text-[#406775]" />
        <h3 className="text-sm font-semibold text-gray-700">Kullanıcı Hesabı Oluştur</h3>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        Kişi adına hesap oluşturun. Oluşturulan kullanıcı, kaydolmadan doğrudan verilen kullanıcı
        adı ve şifre ile giriş yapar. Şifre yalnızca hesap oluşturulurken kullanılır, hiçbir yerde
        saklanmaz.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ör. Sıraç Gezgin"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Kullanıcı adı</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ör. sirac.gezgin"
            autoComplete="off"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 6 karakter"
            autoComplete="new-password"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {topLevel.length > 0 && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Departman ataması <span className="text-gray-400">(opsiyonel)</span>
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={isPending}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Departman yok —</option>
              {topLevel.map((dept) => (
                <optgroup key={dept.id} label={dept.name}>
                  {childrenOf(dept.id).map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                  <option value={dept.id}>{dept.name} (genel)</option>
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {created && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
          <Check size={13} /> <span><strong>@{created}</strong> hesabı oluşturuldu. Kişi bu kullanıcı adı ve şifre ile giriş yapabilir.</span>
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={isPending || !fullName.trim() || !username.trim() || !password}
          className="px-3.5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Oluşturuluyor…" : "Hesap oluştur"}
        </button>
      </div>
    </form>
  );
}
