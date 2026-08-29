import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Reports iskeleti — sayfanın GERÇEK düzenini temsil eder:
 *   1. bölüm başlığı satırı,
 *   2. kompakt kişi kartları ızgarası (kapı),
 *   3. "Tüm işler" tablosu (başlık + arama, dört sütunlu satırlar).
 *
 * Önceki iskelet artık var olmayan bir sayfayı çiziyordu (beş KPI karosu,
 * odak şeridi, iki kolon panel) — yüklenirken bir düzen, bitince bambaşka
 * bir düzen beliriyordu.
 */
export default function DashboardLoading() {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Yükleniyor">
      {/* Bölüm başlığı */}
      <div className="mb-3">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-52 max-w-full" />
      </div>

      {/* Kişi kartları — TileGrid compact ile aynı ölçü/aralık */}
      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-3 shadow-card">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="mx-auto mt-2.5 h-3.5 w-4/5" />
          </div>
        ))}
      </div>

      {/* Tüm işler tablosu */}
      <div className="rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full max-w-xs rounded-control" />
        </div>
        <div className="border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
