import Link from "next/link";

export default function WorkspaceOfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">
          E
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">You are offline</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          EdApex Work needs a connection to load your conversation and school data. The app shell
          will reopen when you are back online.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          href="/workspace"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
