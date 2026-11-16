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
 * The compact-size navigation. Four destinations, a floating pill, 44dp targets.
 *
 * It leaves when the keyboard opens (`hidden`) and when the person scrolls down, which is
 * the whole "clear space for reading text" argument applied to the last piece of chrome on
 * the screen.
 */
export function Dock({
  current,
  onSelect,
  hidden = false,
  approvals = 0
}: {
  readonly current: DestinationId;
  readonly onSelect: (id: DestinationId) => void;
  readonly hidden?: boolean;
  readonly approvals?: number;
}) {
  return (
    <nav
      aria-label="Primary"
      className="dock-shift motion-spatial-fast dock-offset fixed inset-x-0 z-30 mx-auto flex w-fit items-center gap-1 rounded-dock border border-border bg-card p-1 shadow-dock"
      data-hidden={hidden}
    >
      {DESTINATIONS.map((destination) => {
        const Icon = ICONS[destination.icon] ?? MessageCircle;
        const active = destination.id === current && destination.isAction !== true;
        return (
          <button
            aria-current={active ? "page" : undefined}
            className={cn(
              "motion-effects-fast relative flex min-h-touch min-w-comfortable flex-col items-center justify-center gap-0.5 rounded-dock px-3 py-1 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "text-primary" : "text-muted-foreground"
            )}
            key={destination.id}
            onClick={() => onSelect(destination.id)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-5" />
            <span className="text-label leading-none">{destination.label}</span>
            {destination.id === "tasks" && approvals > 0 ? (
              <span
                aria-label={`${approvals} awaiting approval`}
                className="absolute right-2 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-chrome font-medium text-primary-foreground"
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
