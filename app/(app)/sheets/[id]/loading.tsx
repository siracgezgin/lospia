import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Tablo iskeleti — sayfanın GERÇEK düzeni: üst çubuk (Geri + aksiyonlar),
 * ad satırı ve altında ızgaranın yerini tutan büyük yüzey.
 *
 * Sayfa `force-dynamic` ve dört sorgu çalıştırıyor (tablo + departman + görev +
 * kişi). İskelet yokken klasörden bir tabloya basınca ekran bir süre boş
 * kalıyor, kullanıcı ikinci kez tıklıyordu.
 */
export default function SheetDetailLoading() {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Yükleniyor">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-20" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-control" />
          <Skeleton className="h-8 w-8 rounded-control" />
          <Skeleton className="h-8 w-32 rounded-control" />
          <Skeleton className="h-8 w-8 rounded-control" />
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <Skeleton className="h-7 w-56 max-w-full" />
      </div>

      {/* Izgaranın yeri — yüksekliği düzenleyicininkiyle aynı ki içerik
          gelince sayfa zıplamasın. */}
      <Skeleton className="h-[calc(100dvh-23rem)] min-h-[320px] w-full rounded-card sm:h-[calc(100dvh-17.5rem)] sm:min-h-[360px]" />
    </div>
  );
}
