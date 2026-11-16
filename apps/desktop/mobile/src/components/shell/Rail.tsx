import { ListChecks, MessageCircle, ScanLine, UserCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@edapex/ui/lib/utils";

import { DESTINATIONS, type DestinationId } from "@/lib/nav";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  "message-circle": MessageCircle,
  "scan-line": ScanLine,
  "list-checks": ListChecks,
  "user-circle": UserCircle
};

/**
 * The rail, from `medium:` up — the same four destinations, not a second navigation.
 *
 * A rail rather than a persistent sidebar: DESIGN.md's 72px `rail-width` token is the
 * geometry, and a full sidebar would take the reading measure the dock was hiding for.
 */
export function Rail({
  current,
  onSelect,
  approvals = 0
}: {
  readonly current: DestinationId;
  readonly onSelect: (id: DestinationId) => void;
  readonly approvals?: number;
}) {
  return (
    <nav
      aria-label="Primary"
      className="screen-bottom flex w-rail shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-3"
    >
      {DESTINATIONS.map((destination) => {
        const Icon = ICONS[destination.icon] ?? MessageCircle;
        const active = destination.id === current && destination.isAction !== true;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={cn(
              "motion-effects-fast relative flex size-comfortable flex-col items-center justify-center gap-0.5 rounded-lg outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground"
            )}
            key={destination.id}
            onClick={() => onSelect(destination.id)}
            title={destination.label}
            type="button"
          >
            <Icon aria-hidden="true" className="size-5" />
            <span className="sr-only">{destination.label}</span>
            {destination.id === "tasks" && approvals > 0 ? (
              <span
                aria-label={`${approvals} awaiting approval`}
                className="absolute right-1 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-chrome font-medium text-primary-foreground"
              >
                {approvals > 9 ? "9+" : approvals}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
