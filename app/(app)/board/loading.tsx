import { Skeleton } from "@/components/ui/Skeleton";

/* Pano iskeleti — anında çizilir, sunucu görevleri getirirken boş ekran
   kalmaz. GERÇEK ilk ekranı taklit eder: pano kişi ızgarasıyla açılır ("Kim
   ne yapıyor?"), sütunlarla değil. Başlık satırı + sağda "Tüm işler" düğmesi,
   altında PeopleGrid/Tile ile aynı kırılımlı kutucuklar (2 / 3 / 4 sütun;
   üstte kimlik şeridi, ortada yuvarlak görsel, altta isim ve ünvan). Ölçüler
   Tile'ın büyük dikey kartıyla birebir (rounded-card, size-16/24 daire). */
export default function BoardLoading() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-24 rounded-control" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="relative flex flex-col items-center overflow-hidden rounded-card border border-line bg-surface px-3 pb-5 pt-6 shadow-card sm:pb-6 sm:pt-8"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-surface-sunken" />
            <Skeleton className="size-16 rounded-full sm:size-24" />
            <Skeleton className="mt-3 h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
