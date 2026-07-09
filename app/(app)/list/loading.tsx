import { Skeleton } from "@/components/ui/Skeleton";

// List loading skeleton — shown instantly while the server fetches tasks, so
// navigation to Liste feels immediate instead of blank. Mirrors the real table:
// a toolbar row, then a header row, then data rows that echo the title / chip /
// date / assignee structure of a real task row.
export default function ListLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-surface border-b border-hairline shrink-0">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-40 rounded-lg" />
        <div className="w-px h-5 bg-line mx-1" />
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>

      {/* table */}
      <div className="flex-1 overflow-hidden bg-app">
        {/* header row */}
        <div className="flex items-center gap-6 px-4 py-3 bg-surface-muted/90 border-b border-hairline">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>

        {/* data rows */}
        <div className="bg-surface divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="flex items-center gap-6 px-4 py-3.5">
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-5 w-24 rounded-xl shrink-0" />
              <Skeleton className="h-5 w-20 rounded-full shrink-0" />
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-3 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
