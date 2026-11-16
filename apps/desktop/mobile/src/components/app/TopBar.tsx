import { Menu, MessageCircle, MoreVertical, Sparkles } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@edapex/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@edapex/ui/components/toggle-group";

import type { SurfaceId } from "@/lib/nav";

export type ComposeMode = "chat" | "make";

/**
 * Frame 1's top strip, with two EDAPEX changes.
 *
 * The segmented control keeps only the two things you begin from — a conversation, or an
 * agent. Everything else is navigation, and navigation lives in the drawer. The right-hand
 * circle is a **vertical three-dot menu** rather than ChatGPT's recorder, because the
 * recorder is a surface we do not have and a menu is one we need.
 *
 * No app bar: three floating clusters on the page background, so the content keeps the
 * height an app bar would cost.
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
          className="rounded-full border border-border bg-card text-foreground"
          onClick={onOpenDrawer}
          size="icon"
          variant="ghost"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>
        {approvals > 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-primary"
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
          value="make"
        >
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          Make
        </ToggleGroupItem>
      </ToggleGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More options"
            className="rounded-full border border-border bg-card text-foreground"
            size="icon"
            variant="ghost"
          >
            <MoreVertical aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuItem onSelect={() => onSelect("new")}>New chat</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSelect("approvals")}>
            Approvals
            {approvals > 0 ? (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-chrome font-medium text-primary-foreground">
                {approvals}
              </span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSelect("agents")}>Agents</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onSelect("settings")}>Settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
