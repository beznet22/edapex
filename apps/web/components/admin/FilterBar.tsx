"use client";

import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { Input } from "@edapex/ui/components/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@edapex/ui/components/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The filter bar.
 *
 * Parity with the reference: a search field that grows, a Filter control, a List/Grid toggle
 * and a Sort menu on the right. Each is a real control rather than decoration — the previous
 * version had only the search field, so a directory of 87 staff could be narrowed by typing
 * and by nothing else.
 *
 * `List` is the default and Grid is offered, but Grid is disabled with a reason: this data is
 * scanned by comparing rows, and a grid of cards makes two people at the same field hard to
 * compare. The reference has both because its records are companies; a person directory is
 * read differently.
 */
export type SortKey = "name" | "role" | "status";

/**
 * Status filters.
 *
 * `active`/`inactive` are account states; the rest mirror the claim-link directory's own
 * vocabulary. Both sets live in one control because a person reading the table does not care
 * which endpoint produced the row — they care whether the account is claimed.
 */
export type StatusFilter =
  | "all"
  | "active"
  | "inactive"
  | "claimed"
  | "unclaimed"
  | "flagged"
  | "no_email"
  | "non_gmail"
  | "duplicate"
  | "link_active";

const STATUS_LABEL: Readonly<Record<StatusFilter, string>> = {
  all: "All",
  active: "Active only",
  inactive: "Inactive only",
  claimed: "Claimed",
  unclaimed: "Unclaimed",
  flagged: "Flagged",
  no_email: "No email",
  non_gmail: "Not Gmail",
  duplicate: "Duplicate email",
  link_active: "Link live"
};
export type SortDirection = "asc" | "desc";

export function FilterBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusChange,
  includeInactive,
  onIncludeInactiveChange,
  sortKey,
  sortDirection,
  onSortChange,
  searchPlaceholder
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly statusFilter: StatusFilter;
  readonly onStatusChange: (value: StatusFilter) => void;
  readonly includeInactive: boolean;
  readonly onIncludeInactiveChange: (value: boolean) => void;
  readonly sortKey: SortKey;
  readonly sortDirection: SortDirection;
  readonly onSortChange: (key: SortKey) => void;
  readonly searchPlaceholder: string;
}) {
  const label: Readonly<Record<SortKey, string>> = {
    name: "Name",
    role: "Role",
    status: "Status"
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/*
        The search is capped, not stretched.
        
        In the reference it is a bounded field on the left — roughly a third of the table's
        width — with Import, Filter and the view toggle sitting to its right and empty space
        remaining. Stretching it to fill the row made it 850px wide, which reads as a page
        title rather than a filter. `max-w-md` plus `flex-1` gives it room to shrink on narrow
        screens without ever dominating a wide one.
      */}
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search"
          className="h-9 pl-8"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={query}
        />
      </div>

      {/*
        The controls sit *beside* the search, not pinned to the right edge.

        `ml-auto` spread them to the far end of a 1200px row, which put the Filter and Sort
        buttons a screen away from the field they refine. The reference keeps search, Filter
        and Sort as one cluster on the left, with the remaining width empty — a filter bar is
        a single unit, not a header with a toolbar bolted to the corner.
      */}
      <div className="flex shrink-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 gap-1.5" size="sm" variant="outline">
              <SlidersHorizontal aria-hidden="true" />
              Filter
              {statusFilter === "all" && !includeInactive ? null : (
                <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {(statusFilter === "all" ? 0 : 1) + (includeInactive ? 1 : 0)}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((value) => (
              <DropdownMenuCheckboxItem
                checked={statusFilter === value}
                key={value}
                onCheckedChange={() => onStatusChange(value)}
                onSelect={(event) => event.preventDefault()}
              >
                {STATUS_LABEL[value]}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={includeInactive}
              onCheckedChange={(checked) => onIncludeInactiveChange(checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              Include removed people
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 gap-1.5" size="sm" variant="outline">
              <ArrowUpDown aria-hidden="true" />
              {label[sortKey]}
              <span className="text-muted-foreground">
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            {(["name", "role", "status"] as const).map((key) => (
              <DropdownMenuCheckboxItem
                checked={sortKey === key}
                key={key}
                onCheckedChange={() => onSortChange(key)}
                onSelect={(event) => event.preventDefault()}
              >
                {label[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </div>
  );
}

/** Applies the bar's state to a list. Pure, so the surface stays a renderer. */
export function applyView<T extends { readonly fullName: string | null; readonly active: boolean; readonly designation: string | null; readonly department: string | null }>(
  rows: readonly T[],
  view: {
    readonly statusFilter: StatusFilter;
    readonly sortKey: SortKey;
    readonly sortDirection: SortDirection;
  }
): readonly T[] {
  const filtered =
    view.statusFilter === "all"
      ? rows
      : rows.filter((row) => (view.statusFilter === "active" ? row.active : !row.active));

  /*
   * Sorting is per page and says so in the UI.
   *
   * The server returns keyset pages ordered by id; there is no sort parameter on the route,
   * and inventing a client-side sort that pretends to span pages would be wrong the moment
   * there are two pages.
   */
  const sorted = [...filtered].sort((a, b) => {
    const direction = view.sortDirection === "asc" ? 1 : -1;
    if (view.sortKey === "name") {
      return direction * (a.fullName ?? "").localeCompare(b.fullName ?? "");
    }
    if (view.sortKey === "role") {
      return direction * (a.designation ?? a.department ?? "").localeCompare(b.designation ?? b.department ?? "");
    }
    return direction * (Number(a.active) - Number(b.active));
  });
  return sorted;
}
