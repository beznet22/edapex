"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A sortable column header.
 *
 * The reference puts an icon, the label and a `⇅` affordance inside every header, because a
 * header that *is* the sort control is discoverable while a `…` menu holding "sort by" is
 * not. It is a real `<button>` so it is keyboard reachable, and `aria-sort` tells a screen
 * reader which column is ordered and which way.
 *
 * The chevron shows three states: neutral (sortable, not sorted), up, down. A two-state icon
 * cannot express "this column exists as a sort target but is not the current one".
 */
export function SortableHead({
  label,
  icon,
  active,
  direction,
  onSort,
  className,
  align = "left"
}: {
  readonly label: string;
  /** Optional leading glyph, matching the reference's person/mail/building headers. */
  readonly icon?: ReactNode;
  readonly active: boolean;
  readonly direction: "asc" | "desc";
  readonly onSort: () => void;
  readonly className?: string;
  readonly align?: "left" | "right";
}) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        className={cn(
          "group/head -mx-1 flex w-full items-center gap-1.5 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
          "outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "justify-end"
        )}
        onClick={onSort}
        type="button"
      >
        {icon === undefined ? null : (
          <span aria-hidden="true" className="text-muted-foreground/70">
            {icon}
          </span>
        )}
        {label}
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3 transition-opacity duration-150",
            active ? "opacity-100" : "opacity-0 group-hover/head:opacity-60"
          )}
        />
      </button>
    </TableHead>
  );
}
