"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createMemberAccount } from "@/lib/actions/workspace";
import { ASSIGNABLE_ROLE_OPTIONS } from "@/lib/utils/roles";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, TextInput, SelectInput } from "@/components/ui/Field";
import { cn } from "@/lib/utils/cn";
import { PERSON_TONES } from "@/lib/design/person-colors";
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
//
// Yüzey: "Kişi ekle" ile açılan bir form; bölüm kartının içinde ikinci bir kart
// değil, yumuşak dolgu (MemberEditPanel ile aynı dil).
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
    <form onSubmit={handleSubmit} className="space-y-4 rounded-card bg-surface-sunken/60 p-4 sm:p-5">
      <div>
        <h3 className="text-[14px] font-semibold tracking-tight text-ink">Yeni kişi</h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Kişi bu kullanıcı adı ve şifreyle doğrudan giriş yapar; kayıt adımı yok. Şifre yalnız
          hesap açılırken kullanılır, saklanmaz.
        </p>
      </div>

      <FieldGrid>
        <Field label="Ad Soyad" required>
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ör. Sıraç Gezgin"
            required
            disabled={isPending}
          />
        </Field>
        <Field label="Kullanıcı adı" required>
          <TextInput
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ör. sirac.gezgin"
            autoComplete="off"
            required
            disabled={isPending}
          />
        </Field>
        <Field label="Şifre" required hint="En az 6 karakter.">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={isPending}
          />
        </Field>
        <Field label="Bildirim e-postası" hint="İsteğe bağlı.">
          <TextInput
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="ornek@aslifilinta.com"
            disabled={isPending}
          />
        </Field>
        <Field label="Rol">
          <SelectInput
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            disabled={isPending}
          >
            {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </SelectInput>
        </Field>
        {topLevel.length > 0 && (
          <Field label="Departman" hint="İsteğe bağlı.">
            <SelectInput
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={isPending}
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
            </SelectInput>
          </Field>
        )}
      </FieldGrid>

      {/* Renk — üye düzenleme panelindekiyle AYNI kutucuklar. Boş bırakılırsa
          otomatik atanır. İkon seçici kaldırıldı — kişiler fotoğraf ya da baş
          harfle çiziliyor (Aslı Hanım, 2026-08-24). */}
      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
          Renk <span className="font-normal normal-case tracking-normal">· boş bırakılırsa otomatik</span>
        </p>
        <div role="group" aria-label="Kişi rengi" className="flex flex-wrap items-center gap-2">
          {PERSON_TONES.map((t) => {
            const taken = takenColors.includes(t.key);
            const selected = colorKey === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setColorKey(selected ? "" : t.key)}
                disabled={isPending || taken}
                aria-pressed={selected}
                aria-label={taken ? `${t.label} — başka kişide kullanılıyor` : t.label}
                title={taken ? `${t.label} — başka kişide kullanılıyor` : t.label}
                className={cn(
                  "tap-target grid size-8 place-items-center rounded-full transition-[box-shadow] duration-150 ease-standard",
                  "ring-offset-2 ring-offset-surface-sunken",
                  selected ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line-strong",
                  taken && "cursor-not-allowed opacity-25",
                )}
                style={{ backgroundColor: t.hex }}
              >
                {selected && <Check size={14} className="text-white" strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>}
      {created && (
        <p className="anim-fade-down inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success">
          <Check size={14} className="shrink-0" aria-hidden />
          <span><strong>@{created}</strong> hesabı açıldı. Kişi bu kullanıcı adı ve şifreyle giriş yapabilir.</span>
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          loading={isPending}
          disabled={!fullName.trim() || !username.trim() || !password}
        >
          Hesap oluştur
        </Button>
      </div>
    </form>
  );
}
