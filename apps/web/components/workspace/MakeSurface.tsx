import { WandSparkles } from "lucide-react";

export function MakeSurface() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <WandSparkles aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Make</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No pages yet. Reports and generated pages will appear here when the page service is
          enabled.
        </p>
      </div>
    </section>
  );
}
