import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Ana Sayfa iskeleti.
 *
 * Sayfa `force-dynamic` ve her açılışta işleri + toplantıları çekiyor; iskelet
 * yokken giriş rotası kabuk çizildikten sonra BOŞ duruyordu ve kullanıcı ilk
 * saniyede "sistem açılmadı mı?" diye bakıyordu.
 *
 * İskelet sayfanın GERÇEK düzenini temsil eder: karşılama satırı, tam
 * genişlikte "Bugün" şeridi (iki sütun), altında iki kutu. Yüklenirken bir
 * düzen, bitince başka bir düzen belirmez.
 */
export default function HomeLoading() {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Yükleniyor">
      {/* Karşılama */}
      <div className="mb-5">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-44 max-w-full" />
      </div>

      <div className="space-y-4">
        {/* Bugün */}
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="grid grid-cols-1 divide-y divide-hairline md:grid-cols-2 md:divide-x md:divide-y-0">
            {[0, 1].map((col) => (
              <div key={col} className="min-w-0 p-5">
                <Skeleton className="h-3.5 w-28" />
                <div className="mt-3 space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* İkincil kutular */}
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((panel) => (
            <div key={panel} className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="space-y-2.5 px-5 py-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
