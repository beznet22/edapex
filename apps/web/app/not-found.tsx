import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">EdApex</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you asked for is not part of this workspace.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          href="/workspace"
        >
          Open workspace
        </Link>
      </section>
    </main>
  );
}
