export function ClaimSkeleton() {
  return (
    <main
      aria-label="Validating your claim link"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-16 text-foreground"
      role="status"
    >
      <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="h-3 w-20 rounded skeleton-shimmer" />
        <div className="mt-3 h-8 w-2/3 rounded skeleton-shimmer" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded skeleton-shimmer" />
          <div className="h-4 w-5/6 rounded skeleton-shimmer" />
        </div>
      </section>
    </main>
  );
}
