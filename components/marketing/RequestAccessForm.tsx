"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import {
  submitRequestAccess,
  type RequestAccessInput,
} from "@/lib/actions/leads";

// Must stay in sync with TEAM_SIZES in lib/actions/leads.ts (zod enum) and the
// pricing bands on the homepage.
const TEAM_SIZES = ["1-15", "16-50", "51+"] as const;
const WORKFLOW_TOOLS = [
  "Excel",
  "WhatsApp",
  "Notion",
  "ClickUp / Monday / Asana",
  "Diğer",
] as const;

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-slate-400 hover:border-slate-400 hover:shadow focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
// Selects hide the native arrow so hover/focus styling matches text inputs;
// the ChevronDown below is the replacement indicator.
const selectClass = `${inputClass} appearance-none pr-10`;

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
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
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/[0.03]">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-600" />
        <h2 className="text-lg font-semibold text-slate-900">
          Talebiniz alındı.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Genellikle 1 iş günü içinde dönüş yapar, kısa bir görüşme planlarız.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload: RequestAccessInput = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      company_name: String(form.get("company_name") ?? ""),
      phone: String(form.get("phone") ?? ""),
      team_size:
        (form.get("team_size") as RequestAccessInput["team_size"]) || null,
      current_workflow_tool:
        (form.get(
          "current_workflow_tool"
        ) as RequestAccessInput["current_workflow_tool"]) || null,
      main_operational_pain: String(form.get("main_operational_pain") ?? ""),
    };

    setSubmitting(true);
    const result = await submitRequestAccess(payload);
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
          <Field label="Ad Soyad" required>
            <input
              name="name"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Adınız Soyadınız"
            />
          </Field>

          <Field label="E-posta" required>
            <input
              name="email"
              type="email"
              required
              maxLength={320}
              className={inputClass}
              placeholder="ornek@markaniz.com"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Şirket / marka adı" required>
            <input
              name="company_name"
              required
              maxLength={200}
              className={inputClass}
              placeholder="Markanızın adı"
            />
          </Field>

          <Field label="Telefon" required>
            <input
              name="phone"
              type="tel"
              required
              maxLength={50}
              className={inputClass}
              placeholder="05xx xxx xx xx"
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        <GroupHeading>Operasyon yapınız</GroupHeading>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Field label="Ekip büyüklüğü">
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

          <Field label="Şu anda işleri nasıl takip ediyorsunuz?">
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

        <Field label="En büyük operasyon problemi nedir?">
          <textarea
            name="main_operational_pain"
            rows={3}
            maxLength={2000}
            className={inputClass}
            placeholder="Örn: Onaylar WhatsApp'ta kayboluyor, teslim tarihlerini takip edemiyoruz…"
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_12px_28px_-10px_rgba(79,70,229,0.65)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-indigo-600 disabled:hover:shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)]"
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
