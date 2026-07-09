"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { createMemberAccount } from "@/lib/actions/workspace";
import { ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
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
    <form onSubmit={handleSubmit} className="rounded-card border border-line bg-surface shadow-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus size={15} className="text-brand" />
        <h3 className="text-sm font-semibold text-ink">Kullanıcı Hesabı Oluştur</h3>
      </div>
      <p className="text-xs text-subtle leading-relaxed">
        Kişi adına hesap oluşturun. Oluşturulan kullanıcı, kaydolmadan doğrudan verilen kullanıcı
        adı ve şifre ile giriş yapar. Şifre yalnızca hesap oluşturulurken kullanılır, hiçbir yerde
        saklanmaz.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Ad Soyad">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ör. Sıraç Gezgin"
            required
            disabled={isPending}
            className="h-8"
          />
        </Field>
        <Field label="Kullanıcı adı">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ör. sirac.gezgin"
            autoComplete="off"
            required
            disabled={isPending}
            className="h-8"
          />
        </Field>
        <Field label="Şifre">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 6 karakter"
            autoComplete="new-password"
            required
            disabled={isPending}
            className="h-8"
          />
        </Field>
        <Field label="Rol">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            disabled={isPending}
            className="h-8"
          >
            {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </Field>
        {topLevel.length > 0 && (
          <Field label="Departman ataması (opsiyonel)" className="sm:col-span-2">
            <Select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={isPending}
              className="h-8"
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
            </Select>
          </Field>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {created && (
        <p className="text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
          <Check size={13} /> <span><strong>@{created}</strong> hesabı oluşturuldu. Kişi bu kullanıcı adı ve şifre ile giriş yapabilir.</span>
        </p>
      )}

      <div>
        <Button
          type="submit"
          size="sm"
          loading={isPending}
          disabled={!fullName.trim() || !username.trim() || !password}
        >
          {isPending ? "Oluşturuluyor…" : "Hesap oluştur"}
        </Button>
      </div>
    </form>
  );
}
