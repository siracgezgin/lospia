"use client";

import { Workflow } from "lucide-react";
import { KimBadges } from "./KimBadges";
import { PlanningSection } from "./PlanningSection";
import type { PlanningProcessStep } from "@/types";

interface Props {
  steps: PlanningProcessStep[];
  memberNames: Record<string, string>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  /** Tablo henüz migrate edilmediyse bölüm bilgi notuyla kapanır. */
  available: boolean;
}

/**
 * "Adımlar / Operasyon Kurgusu / Kim" — Excel'in en altındaki blok: bir ürünün
 * ön görüşmeden satışa kadar geçtiği sabit akış ve her adımın sahibi.
 * Haftaya bağlı değildir. Dar ekranda "Kim" alt satıra iner, tablo kaydırmaz.
 */
export function ProcessSteps({ steps, memberNames, personHex = {}, available }: Props) {
  if (!available) {
    return (
      <Wrap>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
          Bu bölüm için veritabanı güncellemesi bekleniyor (planning_process_steps).
        </p>
      </Wrap>
    );
  }

  if (steps.length === 0) {
    return (
      <Wrap>
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-subtle">
          Henüz adım tanımlanmadı.
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap>
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
                <KimBadges ids={s.participant_ids} kim={s.kim} memberNames={memberNames} personHex={personHex} />
              </span>
              {s.note && <span className="mt-0.5 block text-[12px] leading-snug text-subtle">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Wrap>
  );
}

/** Bloğun kabuğu — haftaya bağlı OLMAYAN sabit akış. */
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <PlanningSection
      step={4}
      title="Operasyon Kurgusu"
      description="Haftadan bağımsız sabit adımlar — işin hangi sırayla kimden kime geçtiği."
      icon={Workflow}
    >
      {children}
    </PlanningSection>
  );
}
