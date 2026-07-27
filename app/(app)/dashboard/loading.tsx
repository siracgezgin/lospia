import { Skeleton } from "@/components/ui/Skeleton";

// Dashboard loading skeleton — shown instantly while the server aggregates the
// workspace stats, so navigation to Gösterge Paneli feels immediate instead of
// blank. Mirrors the real layout: heading, KPI card grid, the focus strip and
// two-column section panels.
function MetricCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-4">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-3 h-8 w-14" />
    </div>
  );
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-5">
      <Skeleton className="h-4 w-40" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 w-full space-y-5">
      {/* heading */}
      <div>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>

      {/* focus strip */}
      <div className="rounded-card border border-line bg-surface shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-7 w-28 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-hairline bg-surface-muted px-3 py-2.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* section panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={4} />
      </div>
      <SectionSkeleton rows={3} />
    </div>
  );
}
