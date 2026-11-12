export function DirectorySkeleton() {
  const columns = [72, 144, 192, 104, 88, 88, 88, 72, 88];

  return (
    <section
      aria-label="Loading staff and parent directory"
      className="overflow-hidden rounded-xl border border-border bg-card"
      role="status"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="h-3 w-24 rounded skeleton-shimmer" />
        <div className="h-3 w-16 rounded skeleton-shimmer" />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[920px] divide-y divide-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="grid grid-cols-[72px_144px_192px_104px_88px_88px_88px_72px_88px] items-center gap-4 px-4 py-4"
              key={index}
            >
              {columns.map((width, cell) => (
                <div
                  className={
                    cell === 0
                      ? "h-5 rounded-full skeleton-shimmer"
                      : cell === 4
                        ? "h-6 rounded-full skeleton-shimmer"
                        : "h-4 rounded skeleton-shimmer"
                  }
                  key={cell}
                  style={{ width }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
