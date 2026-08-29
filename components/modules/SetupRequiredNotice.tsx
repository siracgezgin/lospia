import { DatabaseZap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  /** Friendly Turkish explanation of what is being awaited. */
  message: string;
  /** Optional short title override. */
  title?: string;
  /** Raw technical detail — shown only in a collapsible note for admins. */
  technicalDetail?: string | null;
  /** "banner" = compact inline strip; "block" = larger standalone card. */
  variant?: "banner" | "block";
}

/**
 * "Veritabanı güncellemesi bekleniyor" — sakin uyarı kutusu.
 *
 * Ham PostgREST hatasının yerine geçer. Renk uyarı token'ından (önce elle
 * yazılmış dört sarı-kahve hex vardı); teknik ayrıntı yalnız yöneticinin
 * gördüğü yüzeylerde gelir ve yerel `<details>` ile katlanır — durum yok,
 * istemci JS'i yok, sunucu bileşeninden de çizilebilir.
 */
export function SetupRequiredNotice({
  message,
  title = "Veritabanı güncellemesi bekleniyor",
  technicalDetail,
  variant = "banner",
}: Props) {
  const isBlock = variant === "block";

  return (
    <div
      role="status"
      className={cn(
        "anim-fade-down flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning/8",
        isBlock ? "px-5 py-4" : "px-4 py-3",
      )}
    >
      <DatabaseZap size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-ink", isBlock ? "text-[14px]" : "text-[13.5px]")}>{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{message}</p>

        {technicalDetail && (
          <details className="group/detail mt-2">
            <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-control text-[12px] font-medium text-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronDown
                size={12}
                className="transition-transform duration-200 ease-standard group-open/detail:rotate-180"
                aria-hidden
              />
              Teknik detay
            </summary>
            <p className="anim-fade-down mt-1 break-words rounded-control bg-surface-sunken px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-muted">
              {technicalDetail}
            </p>
          </details>
        )}
      </div>
    </div>
  );
}
