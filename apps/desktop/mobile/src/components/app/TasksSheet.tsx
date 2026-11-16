import { ListRow } from "@/components/shell/ListRow";
import { SECTIONS } from "@/lib/nav";

/**
 * The Tasks sheet, opened from the segmented control.
 *
 * A sheet rather than a page because Tasks is a glance, not a destination: you check what is
 * running and what needs you, then you are back in the conversation. The peek height is the
 * whole point — a full page would make it feel like somewhere you navigated to and have to
 * navigate back from.
 */
export function TasksSheet({ onOpenApprovals }: { readonly onOpenApprovals: () => void }) {
  const section = SECTIONS.tasks;

  return (
    <div className="flex flex-col gap-3 px-gutter pb-6">
      <p className="text-label text-muted-foreground">{section.description}</p>
      <section className="overflow-hidden rounded-xl border border-border">
        {section.rows.map((row, index) => (
          <ListRow
            className={index === section.rows.length - 1 ? "border-b-0" : undefined}
            description={row.meta}
            key={row.id}
            label={row.label}
          />
        ))}
      </section>
      <button
        className="min-h-comfortable rounded-xl border border-border px-3 text-left text-label text-primary outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpenApprovals}
        type="button"
      >
        3 changes are waiting for your approval
      </button>
    </div>
  );
}
