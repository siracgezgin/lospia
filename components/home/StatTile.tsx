import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Tone = "ink" | "brand" | "danger" | "warning" | "muted";

const VALUE_TONE: Record<Tone, string> = {
  ink: "text-ink",
  brand: "text-brand-strong",
  danger: "text-danger",
  warning: "text-warning",
  muted: "text-subtle",
};

/**
 * Ana Sayfa durum karosu — TEK büyük rakam.
 *
 * Aslı Hanım (2026-08-24): "Home Page daha profesyonel ve daha anlaşılır
 * olabilir; bu haliyle her şey aynı geliyor, karmaşık geliyor, tam
 * anlaşılmıyor."
 *
 * Sayfa 17 birbirinin aynı kısayol kartıyla açılıyordu ve hepsi aynı ağırlıkta
 * olduğu için hiçbiri öne çıkmıyordu; "kaç işim var, kaçı gecikti" bilgisi de
 * onların arasında kayboluyordu. Bu karo o soruyu ilk satırda cevaplar: rakam
 * büyük, etiket küçük, sıfır olan sönük — dolayısıyla göz yalnız DOLU olana
 * takılır.
 */
export function StatTile({
  label, value, href, tone = "ink",
}: { label: string; value: number; href: string; tone?: Tone }) {
  const empty = value === 0;
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border bg-surface px-4 py-3.5 shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-standard",
        "hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover active:translate-y-0",
        empty ? "border-line" : "border-line-strong",
      )}
    >
      <div
        className={cn(
          "text-[26px] font-semibold leading-none tracking-tight tabular-nums",
          empty ? VALUE_TONE.muted : VALUE_TONE[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] font-medium text-muted transition-colors duration-150 group-hover:text-ink">
        {label}
      </div>
    </Link>
  );
}
