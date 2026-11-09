export function DirectorySkeleton() {
  return (
    <section
      aria-label="Loading staff and parent directory"
      className="overflow-hidden rounded-xl border border-border bg-card"
      role="status"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-700/60" />
        <div className="h-3 w-16 animate-pulse rounded bg-slate-700/40" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="grid grid-cols-[5rem_1.4fr_1.6fr_1fr_1fr] gap-4 px-4 py-4" key={index}>
            <div className="h-5 w-14 animate-pulse rounded-full bg-slate-700/50" />
            <div className="h-4 w-36 animate-pulse rounded bg-slate-700/60" />
            <div className="h-4 w-48 animate-pulse rounded bg-slate-700/40" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-700/40" />
            <div className="h-8 w-20 animate-pulse rounded-md bg-slate-700/50" />
          </div>
        ))}
      </div>
    </section>
  );
}
