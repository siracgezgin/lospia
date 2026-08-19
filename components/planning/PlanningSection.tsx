import type { LucideIcon } from "lucide-react";

/**
 * Calendar sayfasındaki alt blokların ortak başlığı.
 *
 * Aslı Hanım (2026-08-20): "Tarih / Saat — Departman Dağılımı AYRI olduğunu
 * göster." Sayfa dört bloktan oluşuyor (haftalık ızgara → departman dağılımı →
 * eksik konular → operasyon kurgusu) ama hepsi ince bir h2 ile art arda akıyor,
 * nerede bittiği belli olmuyordu. Bu bileşen her bloğun önüne tam genişlikte
 * bir ayraç, numara ve tek satırlık bir tanım koyar — blokların ayrı şeyler
 * olduğu bakışta anlaşılır.
 */
export function PlanningSection({
  step, title, description, icon: Icon, rightSlot, children,
}: {
  /** Bloğun sayfa içindeki sırası — "nerede kaldım" duygusunu verir. */
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-line-strong pt-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-muted text-muted"
          >
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold tracking-tight text-ink">
              <span className="text-[12px] font-bold tabular-nums text-subtle">{step}</span>
              {title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
          </div>
        </div>
        {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
      </div>
      {children}
    </section>
  );
}
