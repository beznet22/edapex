import { cn } from "@edapex/ui/lib/utils";

import { ATTACH_ACTIONS, type AttachAction } from "@/lib/nav";
import { ICONS } from "@/lib/icons";

/**
 * Frame 4: a floating panel, not a sheet.
 *
 * ChatGPT's attachment chooser sits above the composer, inset from the left, with no
 * scrim — you can still see the conversation behind it and dismiss it by touching that
 * conversation. A modal sheet would hide the thing you are attaching to, which is why this
 * is a positioned surface rather than the registry `Sheet`.
 *
 * Scan lives here rather than in the drawer: it is an input to a conversation, not a place.
 */
export function AttachPanel({
  onSelect,
  open
}: {
  readonly onSelect: (id: AttachAction["id"]) => void;
  readonly open: boolean;
}) {
  if (!open) return null;

  return (
    <div
      aria-label="Add to chat"
      className="attach-rise attach-offset absolute left-gutter z-30 w-72 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-float"
      data-attach-panel=""
      role="menu"
    >
      {ATTACH_ACTIONS.map((action) => {
        const Icon = ICONS[action.icon];
        return (
          <button
            className={cn(
              "flex min-h-comfortable w-full items-center gap-3 rounded-lg px-2 text-left outline-none",
              "motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            )}
            key={action.id}
            onClick={() => onSelect(action.id)}
            role="menuitem"
            type="button"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-body">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
