import { Skeleton } from "@/components/ui/Skeleton";

// Board loading skeleton — shown instantly while the server fetches tasks, so
// navigation to Pano feels immediate instead of blank. Mirrors the real board:
// a toolbar row, then fixed-width columns each with a header (title + count) and
// task cards that echo the chip / title / meta structure of a real TaskCard.
export default function BoardLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-hairline shrink-0">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
      </div>

      {/* columns */}
      <div className="flex gap-3 sm:gap-4 px-3 sm:px-4 pt-4 pb-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 space-y-3">
            {/* column header */}
            <div className="flex items-center gap-2 h-11">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-4 w-5 rounded-full" />
            </div>
            {/* task cards */}
            <div className="space-y-2">
              {Array.from({ length: 3 + (col % 3) }).map((_, card) => (
                <div key={card} className="rounded-card border border-hairline bg-surface p-3 shadow-card space-y-2.5">
                  <Skeleton className="h-3.5 w-16 rounded-md" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/5" />
                  <div className="flex items-center gap-2 pt-0.5">
                    <Skeleton className="h-4 w-14 rounded-md" />
                    <Skeleton className="ml-auto h-5 w-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
