/**
 * The scaffold shell.
 *
 * Deliberately not a placeholder screen: it exercises the four things B0 has to prove —
 * the token sheet compiles, the mobile `@theme` block generates utilities (`px-gutter`,
 * `text-title`), the safe-area insets resolve, and `dvh` is the height unit. Part II's
 * later commits replace it with the real shell.
 */
export function App() {
  return (
    <main className="safe-top safe-bottom flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-gutter py-3">
        <h1 className="text-title">EdApex Work</h1>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-3 px-gutter">
        <p className="text-body text-muted-foreground">
          The Android shell is up. Tokens, type scale and insets are resolving from
          <span className="text-foreground"> @edapex/tokens</span>.
        </p>
        <p className="text-label text-muted-foreground">
          No app bar, edge to edge, 44dp targets.
        </p>
      </section>
    </main>
  );
}
