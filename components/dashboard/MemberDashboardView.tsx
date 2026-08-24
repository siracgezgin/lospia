import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { Card } from "@/components/ui/Card";
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
 */
export function MemberDashboardView({ data }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">Reports</h1>
        <p className="mt-0.5 text-sm text-muted">Size atanan işler ve teslim tarihleri.</p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink">İşlerim</h2>
        {data.dueSoon.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Yaklaşan teslim yok"
            description="Takviminiz temiz."
            className="py-6"
          />
        ) : (
          <div className="divide-y divide-hairline">
            {data.dueSoon.map((t) => {
              const isOverdue = t.due_date < today;
              return (
                <Link
                  key={t.id}
                  prefetch={false}
                  href={`/tasks/${t.id}`}
                  className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-standard hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink transition-colors duration-150 group-hover:text-brand">
                    {t.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium tabular-nums",
                      isOverdue ? "text-danger" : "text-muted",
                    )}
                  >
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
