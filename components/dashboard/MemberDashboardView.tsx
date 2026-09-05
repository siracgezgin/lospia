import { Sparkles } from "lucide-react";
import { SurfaceTabs } from "@/components/shared/SurfaceTabs";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeliveryTable } from "./DeliveryTable";
import type { DueSoonTask } from "./DashboardView";

interface Props {
  /** Kişinin AÇIK işlerinin TAMAMI — tarihsizler ve uzak tarihliler dahil. */
  tasks: DueSoonTask[];
  /** "Bugün" (YYYY-MM-DD, İstanbul) — sunucudan gelir. */
  today: string;
  /** Sorgu hata verdiyse Türkçe mesaj; sessiz boş liste gösterilmez. */
  error?: string | null;
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
 * SONRA (2026-09-05): liste yalnız "yaklaşan" işleri gösteriyordu. Besleyen
 * sorgu (getMemberDashboardData.dueSoon) TARİHİ OLMAYAN ve 14 GÜNDEN UZAK
 * işleri hiç eklemiyordu; kişi "İşlerim" başlığına bakıp işinin çoğunu
 * göremiyordu. Artık yönetici raporundaki AYNI tablo kullanılıyor (arama +
 * sıralama çalışır), yalnız "Kim" sütunu yok — kişi kendi listesinde her
 * satırda kendi adını okumaz.
 *
 * Başlık uygulama çubuğunda yazıyor; burada yalnız ekran okuyucu için durur.
 */
export function MemberDashboardView({ tasks, today, error }: Props) {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      <h1 className="sr-only">Reports</h1>

      {/* Liste ile AYNI şerit — Raporlar burada bir sekmedir, ayrı bir ada değil. */}
      <div className="-mx-4 mb-4 border-b border-line px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SurfaceTabs />
      </div>

      {error ? (
        <Card>
          <EmptyState
            compact
            title="İşleriniz getirilemedi."
            description={error}
          />
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            compact
            icon={Sparkles}
            title="Açık işiniz yok"
            description="Masanız temiz. Yeni bir iş atandığında burada görünür."
          />
        </Card>
      ) : (
        <DeliveryTable tasks={tasks} nameOf={{}} today={today} showWho={false} />
      )}
    </div>
  );
}
