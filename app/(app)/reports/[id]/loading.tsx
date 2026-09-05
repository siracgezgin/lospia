import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Kişi raporu iskeleti — sayfanın GERÇEK düzeni: ekran kabuğu (Geri +
 * Yazdır), sonra A4 oranındaki kâğıt kolonu (kimlik başlığı + iki blok).
 *
 * Rapor beş sorgu çalıştırıyor ve `force-dynamic`; iskelet yokken kişi
 * kartına basınca ekran bir süre boş kalıyor, kullanıcı ikinci kez
 * tıklıyordu.
 */
export default function PersonReportLoading() {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Yükleniyor">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>

      <div className="mx-auto max-w-3xl rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-strong pb-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="min-w-0 flex-1 basis-40">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-32 max-w-full" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>

        {[0, 1].map((block) => (
          <div key={block} className="border-b border-line py-4 last:border-b-0">
            <Skeleton className="mb-2.5 h-3 w-32" />
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
