"use client";

import { Link2, MoreHorizontal, Pencil, ShieldOff, UserMinus } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@edapex/ui/components/dropdown-menu";

/**
 * Per-row actions.
 *
 * A menu rather than inline buttons: the reference keeps one affordance per row so the row
 * stays a row, and three buttons in a table cell is what turns a directory into a toolbar.
 *
 * "Delete" is soft everywhere. Marks, attendance, fees and archived reports point at these
 * ids, so removal sets `active_status = 0` — the record and its history survive and the
 * person stops appearing and stops signing in. The label says "Remove", and the confirm
 * dialog spells out the consequence, because "Delete" would promise something the system
 * deliberately does not do.
 */
export interface RowActions {
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  /** Absent when the person already has a live link or cannot be invited. */
  readonly onLink?: (() => void) | undefined;
  readonly onRevoke?: (() => void) | undefined;
  readonly linkDisabledReason?: string | undefined;
  readonly editLabel?: string;
  readonly removeLabel?: string;
}

export function RowActionMenu(actions: RowActions) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Row actions"
          className="size-8 text-muted-foreground"
          size="icon-sm"
          variant="ghost"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Actions
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={actions.onEdit}>
          <Pencil aria-hidden="true" />
          {actions.editLabel ?? "Edit"}
        </DropdownMenuItem>

        {actions.onLink === undefined ? null : (
          <DropdownMenuItem
            disabled={actions.linkDisabledReason !== undefined}
            onSelect={actions.onLink}
            title={actions.linkDisabledReason}
          >
            <Link2 aria-hidden="true" />
            {actions.linkDisabledReason === undefined ? "Link" : "Link unavailable"}
          </DropdownMenuItem>
        )}

        {actions.onRevoke === undefined ? null : (
          <DropdownMenuItem onSelect={actions.onRevoke}>
            <ShieldOff aria-hidden="true" />
            Revoke link
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-[var(--destructive-ink)] focus:text-[var(--destructive-ink)]"
          onSelect={actions.onRemove}
        >
          <UserMinus aria-hidden="true" />
          {actions.removeLabel ?? "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
