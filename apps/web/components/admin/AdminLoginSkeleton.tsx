export function AdminLoginSkeleton() {
  return (
    <main
      aria-label="Checking your session"
      className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
      role="status"
    >
      <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="h-3 w-24 rounded skeleton-shimmer" />
        <div className="mt-3 h-8 w-3/4 rounded skeleton-shimmer" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded skeleton-shimmer" />
          <div className="h-4 w-11/12 rounded skeleton-shimmer" />
        </div>
        <div className="mt-5 flex gap-2">
          <div className="h-9 w-20 rounded-md skeleton-shimmer" />
          <div className="h-9 w-28 rounded-md skeleton-shimmer" />
        </div>
        <div className="mt-4 h-11 w-full rounded-lg skeleton-shimmer" />
      </section>
    </main>
  );
}
