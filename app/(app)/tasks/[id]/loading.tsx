import { Skeleton } from "@/components/ui/Skeleton";

// Task-detail loading skeleton — mirrors the real page: top action bar, header
// card (title + compact meta row), then the stacked section cards (Görev
// bilgileri → Sorumlu kişiler → Notlar → Aktivite). Same skeleton language as
// the Board/List loading screens; same full-width padding as the page itself.
export default function TaskDetailLoading() {
  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* top action bar */}
      <div className="flex items-center justify-between gap-3 py-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-24 rounded-control" />
      </div>

      {/* header card: title + meta row */}
      <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3 mt-4">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {/* Görev bilgileri */}
        <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-20 w-full rounded-control" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full rounded-control" />
            <Skeleton className="h-9 w-full rounded-control" />
            <Skeleton className="h-9 w-full rounded-control" />
            <Skeleton className="h-9 w-full rounded-control" />
          </div>
        </div>

        {/* Sorumlu kişiler */}
        <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="rounded-control border border-hairline divide-y divide-hairline">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-5 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Notlar */}
        <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-full rounded-control" />
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-control" />
            <Skeleton className="h-14 w-full rounded-control" />
          </div>
        </div>

        {/* Aktivite */}
        <div className="bg-surface rounded-card border border-line shadow-card p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-6 w-6 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
