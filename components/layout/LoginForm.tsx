"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "@/lib/actions/auth";
import { useState } from "react";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState<AuthFormState, FormData>(
    signIn,
    null
  );
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthFormState, FormData>(
    signUp,
    null
  );

  const state = mode === "signin" ? signInState : signUpState;
  const action = mode === "signin" ? signInAction : signUpAction;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === "signin"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Giriş yap
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            mode === "signup"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Kayıt ol
        </button>
      </div>

      <form action={action} className="space-y-3">
        {mode === "signup" && (
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
              Ad soyad
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Aslı Filinta"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            E-posta
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Şifre
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            placeholder="••••••••"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {state?.error != null && (
          <p className="text-sm bg-red-50 border border-red-200 px-3 py-2 rounded-lg" style={{ color: '#b91c1c' }}>
            {state.error || "Authentication failed. Please try again."}
          </p>
        )}

        {state?.success && mode === "signup" && (
          <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
            Hesap oluşturuldu! Lütfen giriş yapın.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending
            ? mode === "signin"
              ? "Giriş yapılıyor…"
              : "Hesap oluşturuluyor…"
            : mode === "signin"
              ? "Giriş yap"
              : "Hesap oluştur"}
        </button>
      </form>

      {process.env.NODE_ENV === "development" && (
        <p className="text-xs text-center text-gray-400">
          Local dev:{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">alice@taskos.local</code> /{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">TaskOS2024!</code>
        </p>
      )}
    </div>
  );
}
