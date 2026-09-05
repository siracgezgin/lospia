"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { changeMyPassword } from "@/lib/actions/account";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

/**
 * ŞİFRE DEĞİŞTİRME — kişinin kendi hesabı.
 *
 * Sistemde e-posta ile şifre sıfırlama yok (hesaplar iç bir kullanıcı adıyla
 * açılıyor), dolayısıyla kişinin şifresini değiştirebileceği TEK yer burasıydı
 * — ve bugüne kadar hiç yoktu. Şifresini değiştirmek isteyen kişi yöneticiye
 * gitmek zorunda kalıyordu.
 *
 * Form KAPALI başlar: profil sayfasının ana işi ad/ünvan düzenlemek, şifre
 * yılda bir açılan bir kapı. Açan kişi üç alan görür ve "Şifreyi güncelle" ile
 * bitirir.
 */
const MIN_LENGTH = 6;

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const ready =
    current.length > 0 && next.length >= MIN_LENGTH && next === again && !isPending;

  function reset() {
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setDone(false);
    start(async () => {
      const res = await changeMyPassword({ currentPassword: current, newPassword: next });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      reset();
      setDone(true);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setOpen(true); setDone(false); }}
          title="Hesabınızın giriş şifresini değiştirin"
        >
          <KeyRound size={14} aria-hidden />
          Şifre değiştir
        </Button>
        {done && (
          <span
            role="status"
            className="anim-fade inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success"
          >
            <Check size={14} aria-hidden /> Şifreniz güncellendi.
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="anim-fade-down max-w-xl space-y-4">
      <Field label="Mevcut şifreniz" required>
        <TextInput
          type={reveal ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={isPending}
        />
      </Field>
      <Field
        label="Yeni şifre"
        required
        hint={`En az ${MIN_LENGTH} karakter.`}
        error={tooShort ? `Yeni şifre en az ${MIN_LENGTH} karakter olmalı.` : null}
      >
        <TextInput
          type={reveal ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
        />
      </Field>
      <Field
        label="Yeni şifre (tekrar)"
        required
        error={mismatch ? "İki şifre birbirini tutmuyor." : null}
      >
        <TextInput
          type={reveal ? "text" : "password"}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          autoComplete="new-password"
          disabled={isPending}
        />
      </Field>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setReveal((v) => !v)}
        aria-pressed={reveal}
        title={reveal ? "Şifreleri gizle" : "Şifreleri göster"}
      >
        {reveal ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        {reveal ? "Şifreleri gizle" : "Şifreleri göster"}
      </Button>

      {error && (
        <div
          role="alert"
          className="anim-fade-down flex items-start gap-2 rounded-control border border-danger/25 bg-danger/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-danger"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        <Button type="submit" loading={isPending} disabled={!ready}>
          Şifreyi güncelle
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => { reset(); setOpen(false); }}
          disabled={isPending}
        >
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
