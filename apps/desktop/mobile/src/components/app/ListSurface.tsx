import { ArrowLeft } from "lucide-react";

import { Button } from "@edapex/ui/components/button";

import { ListRow } from "@/components/shell/ListRow";
import { Screen } from "@/components/shell/Screen";
import type { Section, SurfaceId } from "@/lib/nav";

/**
 * The drawer's destinations, rendered from one list.
 *
 * Frame 2 is a directory, so the destinations share a shape: a titled list with a line of
 * context. Part IV replaces each with its own surface — a task needs a status and a time, an
 * approval needs two buttons — and this disappears surface by surface rather than at once.
 */
export function ListSurface({
  onBack,
  section,
  surface
}: {
  readonly onBack: () => void;
  readonly section: Section;
  readonly surface: Extract<SurfaceId, "tasks" | "approvals" | "people" | "agents" | "plugins" | "library" | "account">;
}) {
  return (
    <Screen>
      <header className="flex items-center gap-2 px-gutter py-2">
        <Button
          aria-label="Back"
          className="rounded-full border border-border bg-card text-foreground"
          onClick={onBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Button>
        <h1 className="text-title font-semibold tracking-tight">{section.title}</h1>
      </header>

      <div className="scrollbar-auto flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-gutter pb-6">
        <p className="text-label text-muted-foreground">{section.description}</p>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          {section.rows.map((row, index) => (
            <ListRow
              className={index === section.rows.length - 1 ? "border-b-0" : undefined}
              control={
                row.meta === undefined ? undefined : (
                  <span className="text-label text-muted-foreground">{row.meta}</span>
                )
              }
              key={row.id}
              label={row.label}
              onPress={() => undefined}
            />
          ))}
        </section>
        <p className="text-chrome text-muted-foreground" data-surface={surface}>
          Fixture content. The live list arrives with this surface in Part IV.
        </p>
      </div>
    </Screen>
  );
}
