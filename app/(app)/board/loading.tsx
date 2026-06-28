// Board loading skeleton — shown instantly while the server fetches tasks,
// so navigation to Pano feels immediate instead of blank.
export default function BoardLoading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 shrink-0">
        <div className="h-6 w-40 rounded bg-gray-100" />
        <div className="ml-auto h-6 w-24 rounded bg-gray-100" />
      </div>
      {/* columns */}
      <div className="flex-1 flex gap-3 p-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="flex-1 min-w-0 space-y-2">
            <div className="h-5 w-24 rounded bg-gray-100" />
            {Array.from({ length: 3 + (col % 3) }).map((_, card) => (
              <div key={card} className="rounded-lg border border-gray-100 bg-white p-3 space-y-2">
                <div className="h-3 w-16 rounded bg-gray-100" />
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
