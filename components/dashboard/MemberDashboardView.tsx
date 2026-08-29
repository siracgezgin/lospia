import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SurfaceTabs } from "@/components/shared/SurfaceTabs";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MemberDashboardData, MemberPointsSummary } from "@/lib/points/queries";

interface Props {
  data: MemberDashboardData;
  /** Puan özeti artık çizilmiyor; sözleşme bozulmasın diye alınmaya devam eder. */
  points?: MemberPointsSummary;
}

/**
 * Reports — üye görünümü. Yalnız kişinin KENDİ işi; ekip toplamı, sıralama,
 * puan yok (zaten hiç gönderilmiyordu).
 *
 * Sayfa bir zamanlar beş sayaç karosuyla açılıyordu: "Aktif görevlerim ·
 * Geciken işlerim · Bu hafta teslim · Kontrol bekleyen · Tamamladığım".
 * Aslı Hanım (2026-08-24): "Boş hesap istemiyorum… İsmi, işi, tarihi bu kadar.
 * Mühendis gibi hissetmek istemiyorum."
 * Karolar zaten alttaki listenin sayımıydı — liste kaldı, sayaçlar gitti.
 *
 * Başlık uygulama çubuğunda yazıyor; burada yalnız ekran okuyucu için durur.
 */
export function MemberDashboardView({ data }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Reports</h1>

      {/* Liste ile AYNI şerit — Raporlar burada bir sekmedir, ayrı bir ada değil. */}
      <div className="-mx-4 mb-4 border-b border-line px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SurfaceTabs />
      </div>

      <Card>
        <CardHeader title="İşlerim" />
        {data.dueSoon.length === 0 ? (
          <EmptyState
            compact
            icon={Sparkles}
            title="Yaklaşan teslim yok"
            description="Takviminiz temiz."
          />
        ) : (
          <div className="divide-y divide-hairline px-2 py-1 sm:px-3">
            {data.dueSoon.map((t) => {
              const isOverdue = t.due_date < today;
              return (
                <Link
                  key={t.id}
                  prefetch={false}
                  href={`/tasks/${t.id}`}
                  className="group flex items-center justify-between gap-3 rounded-control px-2 py-2.5 transition-colors duration-150 ease-standard hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink transition-colors duration-150 group-hover:text-brand">
                    {t.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[12.5px] font-medium tabular-nums",
                      isOverdue ? "text-danger" : "text-muted",
                    )}
                  >
                    {/* Renk tek başına sinyal değil — ekran okuyucuya da söylenir. */}
                    {isOverdue && <span className="sr-only">Gecikti: </span>}
                    {formatDateTR(t.due_date, { day: "numeric", month: "short" })}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
