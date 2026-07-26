"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/Input";

// Sign-in only. Public self-signup has been removed — accounts are created by an
// owner/admin in Settings → "Hesap oluştur". The person signs in directly with
// the username (or e-mail) + password they were given.
export function LoginForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, null);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <div
          className="anim-fade-up space-y-1.5"
          style={{ animationDelay: "140ms" }}
        >
          <label
            htmlFor="identifier"
            className="block text-[12.5px] font-medium text-muted"
          >
            Kullanıcı adı
          </label>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            defaultValue={initialEmail}
            placeholder="Kullanıcı adı"
            className="h-10"
          />
        </div>

        <div
          className="anim-fade-up space-y-1.5"
          style={{ animationDelay: "190ms" }}
        >
          <label
            htmlFor="password"
            className="block text-[12.5px] font-medium text-muted"
          >
            Şifre
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Şifre"
            className="h-10"
          />
        </div>

        {state?.error != null && (
          <div
            role="alert"
            className="anim-fade-down flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.05] px-3 py-2.5 text-[12.5px] leading-relaxed text-danger"
          >
            <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>{state.error || "Giriş yapılamadı. Lütfen tekrar deneyin."}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="anim-fade-up inline-flex h-10 w-full select-none items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white shadow-card transition-[background-color,transform,box-shadow] duration-200 ease-standard hover:bg-brand-strong hover:shadow-card-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          style={{ animationDelay: "240ms" }}
        >
          {pending && (
            <Loader2 size={15} strokeWidth={2} className="animate-spin shrink-0" />
          )}
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>

      <p
        className="anim-fade text-xs text-center text-subtle"
        style={{ animationDelay: "320ms" }}
      >
        Hesabınız yoksa yöneticinize başvurun.
      </p>
    </div>
  );
}
