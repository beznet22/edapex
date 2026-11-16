import { MessageCircle, MoreVertical, Sparkles } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@edapex/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@edapex/ui/components/toggle-group";

import { MenuGlyph } from "@/components/brand/MenuGlyph";
import type { SurfaceId } from "@/lib/nav";

export type ComposeMode = "chat" | "tasks";

/**
 * Frame 1's top strip: the mark to open navigation, Chat · Tasks to switch what the screen
 * is showing, and a menu for everything that is an action rather than a destination.
 *
 * The two controls are bare icons, not filled circles. On a screen with no app bar, two
 * discs at the top edge compete with the segmented control between them; the 44dp target is
 * still there, and the press state gives the same feedback a permanent disc would.
 *
 * Make is not a tab. It is a thing you start, so it lives in the menu and in the drawer —
 * a tab that opens a form and then closes again is a mode pretending to be a place.
 */
export function TopBar({
  approvals,
  mode,
  onModeChange,
  onOpenDrawer,
  onSelect
}: {
  readonly approvals: number;
  readonly mode: ComposeMode;
  readonly onModeChange: (mode: ComposeMode) => void;
  readonly onOpenDrawer: () => void;
  readonly onSelect: (id: SurfaceId | "new") => void;
}) {
  return (
    <header className="flex items-center justify-between gap-2 px-gutter py-2">
      <div className="relative">
        <Button
          aria-label="Open menu"
          className="size-touch rounded-full text-foreground"
          onClick={onOpenDrawer}
          size="icon"
          variant="ghost"
        >
          <MenuGlyph className="size-6" />
        </Button>
        {approvals > 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1.5 size-2 rounded-full bg-primary"
          />
        ) : null}
      </div>

      <ToggleGroup
        className="rounded-dock border border-border bg-muted p-1"
        onValueChange={(value) => {
          if (value !== "") onModeChange(value as ComposeMode);
        }}
        type="single"
        value={mode}
      >
        <ToggleGroupItem
          className="gap-2 rounded-dock px-4 text-label data-[state=on]:bg-card data-[state=on]:text-foreground"
          value="chat"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          Chat
        </ToggleGroupItem>
        <ToggleGroupItem
          className="gap-2 rounded-dock px-4 text-label data-[state=on]:bg-card data-[state=on]:text-foreground"
          value="tasks"
        >
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          Tasks
        </ToggleGroupItem>
      </ToggleGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More options"
            className="size-touch rounded-full text-foreground"
            size="icon"
            variant="ghost"
          >
            <MoreVertical aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuItem onSelect={() => onSelect("new")}>New chat</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSelect("make")}>Create agent</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSelect("approvals")}>
            Approvals
            {approvals > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-chrome font-medium text-primary-foreground">
                {approvals}
              </span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onSelect("settings")}>Settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
