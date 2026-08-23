"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { createMemberAccount } from "@/lib/actions/workspace";
import { ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { PERSON_TONES, PERSON_ICONS } from "@/lib/design/person-colors";
import type { WorkspaceDepartment } from "@/types";

interface Props {
  workspaceId: string;
  departments?: WorkspaceDepartment[];
  /** Başka kişilerde kullanılan renkler — aynı renk iki kişiye verilemez. */
  takenColors?: string[];
}

// Admin-created account form. Replaces the old self-signup ("Ekip erişimi") flow:
// an owner/admin sets the person's name, username, password and role; the person
// then signs in directly with that username + password — no registration step.
export function CreateAccountPanel({ workspaceId, departments = [], takenColors = [] }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [departmentId, setDepartmentId] = useState("");
  /* Kişiyi tanımlayan alanların TAMAMI burada — Aslı Hanım (2026-08-23):
     "Ekleyeceğim kişiye rengiydi, mailiydi, kullanıcı adı, ikon vs. hepsi aynı
     kısımda olmalı." Renk/ikon boş bırakılırsa kişinin id'sinden otomatik
     türetilir; kimse renksiz kalmaz. */
  const [notificationEmail, setNotificationEmail] = useState("");
  const [colorKey, setColorKey] = useState("");
  const [iconKey, setIconKey] = useState("");
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
        notificationEmail: notificationEmail.trim() || null,
        colorKey: colorKey || null,
        iconKey: iconKey || null,
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
      setNotificationEmail("");
      setColorKey("");
      setIconKey("");
      // Surface the new member in the list immediately (no manual reload).
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-line bg-surface shadow-card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <UserPlus size={15} />
        </span>
        <h3 className="text-sm font-semibold tracking-tight text-ink">Kullanıcı Hesabı Oluştur</h3>
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
        <Field label="Bildirim e-postası (opsiyonel)">
          <Input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="ornek@aslifilinta.com"
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

        {/* Renk ve ikon — üye satırındakiyle AYNI seçenekler. Boş bırakılırsa
            otomatik atanır. */}
        <div className="sm:col-span-2 space-y-2 rounded-xl border border-line bg-surface-sunken/50 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">Renk</span>
            {PERSON_TONES.map((t) => {
              const taken = takenColors.includes(t.key);
              const selected = colorKey === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setColorKey(selected ? "" : t.key)}
                  disabled={isPending || taken}
                  title={taken ? `${t.label} — başka kişide kullanılıyor` : t.label}
                  className={cn(
                    "tap-target grid h-7 w-7 place-items-center rounded-full transition-transform duration-150",
                    selected ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110",
                    taken && "cursor-not-allowed opacity-25",
                  )}
                  style={{ backgroundColor: t.hex }}
                >
                  {selected && <Check size={13} className="text-white" strokeWidth={3} />}
                </button>
              );
            })}
            <span className="ml-1 text-[11.5px] text-subtle">
              {colorKey ? "" : "boş = otomatik"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[52px] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">İkon</span>
            {PERSON_ICONS.map(({ key, label, Icon: Opt }) => {
              const selected = iconKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIconKey(selected ? "" : key)}
                  disabled={isPending}
                  title={label}
                  className={cn(
                    "tap-target grid h-7 w-7 place-items-center rounded-lg border transition-colors duration-150",
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line text-muted hover:border-line-strong hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  <Opt size={14} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="anim-fade-down text-xs text-danger">{error}</p>}
      {created && (
        <p className="anim-fade-down text-xs text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
          <Check size={13} className="shrink-0" /> <span><strong>@{created}</strong> hesabı oluşturuldu. Kişi bu kullanıcı adı ve şifre ile giriş yapabilir.</span>
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
