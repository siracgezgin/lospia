import { Skeleton } from "@/components/ui/Skeleton";

// List loading skeleton — shown instantly while the server fetches tasks, so
// navigation to List feels immediate instead of blank. Mirrors the real table:
// the view-tab strip, a toolbar row, then a header row and data rows that echo
// the title / status / date / person structure of a real task row.
export default function ListLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* view tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 bg-surface border-b border-line shrink-0">
        <Skeleton className="h-8 w-24 rounded-control" />
        <Skeleton className="h-8 w-32 rounded-control" />
        <Skeleton className="h-8 w-28 rounded-control" />
        <Skeleton className="h-8 w-32 rounded-control" />
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface border-b border-hairline shrink-0">
        <Skeleton className="h-9 w-32 rounded-control" />
        <Skeleton className="h-9 w-56 rounded-control" />
        <Skeleton className="h-9 w-36 rounded-control" />
        <Skeleton className="h-9 w-36 rounded-control" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>

      {/* table */}
      <div className="flex-1 overflow-hidden bg-app">
        {/* header row */}
        <div className="flex items-center gap-6 px-4 py-2.5 bg-surface border-b border-line">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>

        {/* data rows */}
        <div className="bg-surface divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="flex items-center gap-6 px-4 py-3">
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-3/5" />
              </div>
              <Skeleton className="h-5 w-24 rounded-md shrink-0" />
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
