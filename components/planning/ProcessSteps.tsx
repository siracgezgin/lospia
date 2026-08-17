"use client";

import { Workflow } from "lucide-react";
import { KimBadges } from "./KimBadges";
import type { PlanningProcessStep } from "@/types";

interface Props {
  steps: PlanningProcessStep[];
  memberNames: Record<string, string>;
  /** Tablo henüz migrate edilmediyse bölüm bilgi notuyla kapanır. */
  available: boolean;
}

/**
 * "Adımlar / Operasyon Kurgusu / Kim" — Excel'in en altındaki blok: bir ürünün
 * ön görüşmeden satışa kadar geçtiği sabit akış ve her adımın sahibi.
 * Haftaya bağlı değildir. Dar ekranda "Kim" alt satıra iner, tablo kaydırmaz.
 */
export function ProcessSteps({ steps, memberNames, available }: Props) {
  if (!available) {
    return (
      <section className="mt-6">
        <Header />
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
          Bu bölüm için veritabanı güncellemesi bekleniyor (planning_process_steps).
        </p>
      </section>
    );
  }

  if (steps.length === 0) {
    return (
      <section className="mt-6">
        <Header />
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-subtle">
          Henüz adım tanımlanmadı.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <Header />
      <ol className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0 sm:px-4"
          >
            <span className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-bold tabular-nums text-muted">
              {s.position}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-snug text-ink">
                {s.title}
                <KimBadges ids={s.participant_ids} kim={s.kim} memberNames={memberNames} />
              </span>
              {s.note && <span className="mt-0.5 block text-[12px] leading-snug text-subtle">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Header() {
  return (
    <h2 className="mb-2 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <Workflow size={16} className="text-muted" />
      Operasyon Kurgusu
    </h2>
  );
}
