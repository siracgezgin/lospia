"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

// Sign-in only. Public self-signup has been removed — accounts are created by an
// owner/admin in Settings → "Hesap oluştur". The person signs in directly with
// the username (or e-mail) + password they were given.
//
// Tek form, iki alan, tek düğme: Field + Button primitifleri (önce elle
// yazılmış etiket/giriş/düğme üçlüsü ve alan başına ayrı giriş animasyonu
// vardı). Hata alanların altında, insan diliyle.
export function LoginForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, null);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <Field label="Kullanıcı adı" htmlFor="identifier">
          <TextInput
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={initialEmail}
            className="h-10"
          />
        </Field>

        <Field label="Şifre" htmlFor="password">
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </Field>

        {state?.error != null && (
          <div
            role="alert"
            className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] leading-relaxed text-danger"
          >
            <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
            <span>{state.error || "Giriş yapılamadı. Kullanıcı adı ve şifreyi kontrol edip tekrar deneyin."}</span>
          </div>
        )}

        <Button type="submit" loading={pending} className="h-10 w-full text-[14px]">
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>

      <p className="text-center text-[12.5px] text-subtle">
        Hesabınız yoksa yöneticinize başvurun.
      </p>
    </div>
  );
}
