import { ListChecks } from "lucide-react";

export function TasksSurface() {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <div className="max-w-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <ListChecks aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Tasks</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No tasks yet. Task lists, questions and needs-input counts will appear here when the
          task service is enabled.
        </p>
      </div>
    </section>
  );
}
