"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  submitRequestAccess,
  type RequestAccessInput,
} from "@/lib/actions/leads";

const TEAM_SIZES = ["1-5", "6-15", "16-40", "40+"] as const;
const WORKFLOW_TOOLS = [
  "Excel",
  "WhatsApp",
  "Notion",
  "ClickUp / Monday / Asana",
  "Diğer",
] as const;

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand";

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
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function RequestAccessForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
        <h2 className="text-lg font-semibold text-ink">Talebiniz alındı.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Operasyon akışınızı inceleyip kurulum görüşmesi için dönüş yapacağız.
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
      team_size:
        (form.get("team_size") as RequestAccessInput["team_size"]) || null,
      current_workflow_tool:
        (form.get(
          "current_workflow_tool"
        ) as RequestAccessInput["current_workflow_tool"]) || null,
      main_operational_pain: String(form.get("main_operational_pain") ?? ""),
      note: String(form.get("note") ?? ""),
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
      className="space-y-5 rounded-card border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      <Field label="İsim" required>
        <input name="name" required maxLength={200} className={inputClass} placeholder="Adınız Soyadınız" />
      </Field>

      <Field label="İş e-postası" required>
        <input
          name="email"
          type="email"
          required
          maxLength={320}
          className={inputClass}
          placeholder="ornek@markaniz.com"
        />
      </Field>

      <Field label="Şirket / marka adı" required>
        <input name="company_name" required maxLength={200} className={inputClass} placeholder="Markanızın adı" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ekip büyüklüğü">
          <select name="team_size" className={inputClass} defaultValue="">
            <option value="">Seçin</option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} kişi
              </option>
            ))}
          </select>
        </Field>

        <Field label="Şu an kullandığınız araç">
          <select name="current_workflow_tool" className={inputClass} defaultValue="">
            <option value="">Seçin</option>
            {WORKFLOW_TOOLS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Operasyonda sizi en çok zorlayan şey">
        <textarea
          name="main_operational_pain"
          rows={3}
          maxLength={2000}
          className={inputClass}
          placeholder="Örn: Onaylar WhatsApp'ta kayboluyor, teslim tarihlerini takip edemiyoruz…"
        />
      </Field>

      <Field label="Eklemek istedikleriniz (opsiyonel)">
        <textarea name="note" rows={2} maxLength={2000} className={inputClass} />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Gönderiliyor…" : "Kurulum Görüşmesi Planla"}
      </button>
      <p className="text-center text-xs text-subtle">
        Bilgileriniz yalnızca kurulum görüşmesi için kullanılır. Detaylar için{" "}
        <a href="/legal/privacy-policy" className="underline hover:text-ink">
          Gizlilik Politikası
        </a>
        .
      </p>
    </form>
  );
}
