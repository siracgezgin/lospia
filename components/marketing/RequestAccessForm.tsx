"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { submitRequestAccess } from "@/lib/actions/leads";
import {
  requestAccessSchema,
  HONEYPOT_FIELD,
  TEAM_SIZES,
  WORKFLOW_TOOLS,
} from "@/lib/validation/request-access";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-slate-400 hover:border-slate-400 hover:shadow focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
// Selects hide the native arrow so hover/focus styling matches text inputs;
// the ChevronDown below is the replacement indicator.
const selectClass = `${inputClass} appearance-none pr-10`;

function Field({
  name,
  label,
  required,
  error,
  children,
}: {
  /** Alan adı — hata metninin id'sini üretir (aria-describedby ile eşleşir). */
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800">
        {label}
        {required && (
          <>
            <span aria-hidden className="text-rose-500"> *</span>
            <span className="sr-only"> (zorunlu)</span>
          </>
        )}
      </span>
      {children}
      {error && (
        <span id={`${name}-error`} className="block text-xs text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block">
      {children}
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </span>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  );
}

export function RequestAccessForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  if (done) {
    return (
      /* Başarı kartı çıkmaz sokaktı: teşekkür yazıp bırakıyordu. Artık
         "şimdi ne yapayım?" sorusunun iki cevabı da burada. */
      <div
        role="status"
        className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/[0.03]"
      >
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-600" aria-hidden />
        <h2 className="text-lg font-semibold text-slate-900">
          Talebiniz alındı.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Genellikle 1 iş günü içinde dönüş yapar, kısa bir görüşme planlarız.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-800 shadow-sm transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
          >
            Ana sayfaya dön
          </Link>
          <Link
            href="/#urun"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 px-5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
          >
            Ürünü incelemeye devam et
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const rawPain = String(form.get("main_operational_pain") ?? "").trim();
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      company_name: String(form.get("company_name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      team_size: (form.get("team_size") as string) || null,
      current_workflow_tool:
        (form.get("current_workflow_tool") as string) || null,
      // Empty optional textarea → null so the "min 5" rule only bites real text.
      main_operational_pain: rawPain === "" ? null : rawPain,
      [HONEYPOT_FIELD]: String(form.get(HONEYPOT_FIELD) ?? ""),
    };

    // Client-side gate using the SAME schema the server enforces — surfaces
    // field-level errors instantly without a round-trip. The server re-parses
    // regardless, so this is UX, not the security boundary.
    const check = requestAccessSchema.safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      setError("Lütfen işaretli alanları kontrol edin.");
      return;
    }

    setSubmitting(true);
    const result = await submitRequestAccess({
      ...check.data,
      [HONEYPOT_FIELD]: payload[HONEYPOT_FIELD],
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/[0.03] sm:p-6"
    >
      <div className="space-y-4">
        <GroupHeading>İletişim bilgileri</GroupHeading>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Ad Soyad" required error={fieldErrors.name}>
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="name"
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              className={inputClass}
              placeholder="Adınız Soyadınız"
            />
          </Field>

          <Field name="email" label="E-posta" required error={fieldErrors.email}>
            <input
              name="email"
              type="email"
              required
              maxLength={255}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className={inputClass}
              placeholder="ornek@markaniz.com"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="company_name"
            label="Şirket / marka adı"
            required
            error={fieldErrors.company_name}
          >
            <input
              name="company_name"
              required
              maxLength={120}
              autoComplete="organization"
              aria-invalid={fieldErrors.company_name ? true : undefined}
              aria-describedby={fieldErrors.company_name ? "company_name-error" : undefined}
              className={inputClass}
              placeholder="Markanızın adı"
            />
          </Field>

          <Field name="phone" label="Telefon" required error={fieldErrors.phone}>
            <input
              name="phone"
              type="tel"
              required
              maxLength={30}
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={fieldErrors.phone ? true : undefined}
              aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
              className={inputClass}
              placeholder="05xx xxx xx xx"
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        <GroupHeading>Operasyon yapınız</GroupHeading>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Field name="team_size" label="Ekip büyüklüğü">
            <SelectWrap>
              <select name="team_size" className={selectClass} defaultValue="">
                <option value="">Seçin</option>
                {TEAM_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} kişi
                  </option>
                ))}
              </select>
            </SelectWrap>
          </Field>

          <Field
            name="current_workflow_tool"
            label="Şu anda işleri nasıl takip ediyorsunuz?"
          >
            <SelectWrap>
              <select
                name="current_workflow_tool"
                className={selectClass}
                defaultValue=""
              >
                <option value="">Seçin</option>
                {WORKFLOW_TOOLS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </Field>
        </div>

        <Field
          name="main_operational_pain"
          label="En büyük operasyon problemi nedir?"
          error={fieldErrors.main_operational_pain}
        >
          <textarea
            name="main_operational_pain"
            rows={3}
            maxLength={1000}
            aria-invalid={fieldErrors.main_operational_pain ? true : undefined}
            aria-describedby={
              fieldErrors.main_operational_pain ? "main_operational_pain-error" : undefined
            }
            className={inputClass}
            placeholder="Örn: Onaylar WhatsApp'ta kayboluyor, teslim tarihlerini takip edemiyoruz…"
          />
        </Field>
      </div>

      {/* Honeypot — hidden from humans (off-screen, not display:none so some
          bots still see it), excluded from tab order and a11y tree. A filled
          value makes the server treat the submit as a bot and drop it. */}
      <div aria-hidden className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
        <label>
          Web siteniz
          <input
            name={HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      {/* Hata kutusu sessizce çiziliyordu; ekran okuyucu duyurmuyordu. Kutu
          artık HER ZAMAN DOM'da (boşken sr-only) — canlı bölge ancak
          önceden var olduğunda duyurur. */}
      <p
        aria-live="assertive"
        aria-atomic="true"
        className={
          error
            ? "mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
            : "sr-only"
        }
      >
        {error}
      </p>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 min-h-[48px] w-full rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_12px_28px_-10px_rgba(79,70,229,0.65)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-indigo-600 disabled:hover:shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)]"
      >
        {submitting ? "Gönderiliyor…" : "Görüşme talebi gönder"}
      </button>
      <p className="mt-3.5 text-center text-xs leading-relaxed text-slate-500">
        Bilgileriniz yalnızca kurulum görüşmesi için kullanılır; üçüncü
        taraflarla paylaşılmaz. Detaylar için{" "}
        <a
          href="/legal/privacy-policy"
          className="rounded-sm font-medium text-indigo-600 underline underline-offset-2 transition-colors duration-150 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          Gizlilik Politikası
        </a>
        .
      </p>
    </form>
  );
}
