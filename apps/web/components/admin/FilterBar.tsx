"use client";

import { Search, SlidersHorizontal, ArrowUpDown, LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
  readonly statusFilter: "all" | "active" | "inactive";
  readonly onStatusChange: (value: "all" | "active" | "inactive") => void;
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
      <div className="relative flex-1">
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

      <div className="flex items-center gap-1.5">
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
            {(["all", "active", "inactive"] as const).map((value) => (
              <DropdownMenuCheckboxItem
                checked={statusFilter === value}
                key={value}
                onCheckedChange={() => onStatusChange(value)}
                onSelect={(event) => event.preventDefault()}
              >
                {value === "all" ? "All" : value === "active" ? "Active only" : "Inactive only"}
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

        {/*
          The view toggle, present for parity and deliberately inert on Grid. A disabled
          control with a title explaining why is more honest than one that silently does
          nothing, and more useful than pretending a card grid is a good way to compare staff
          by department.
        */}
        <div className="hidden items-center rounded-[var(--radius-md)] border border-border p-0.5 sm:flex">
          <span
            aria-current="true"
            className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] bg-primary text-primary-foreground"
          >
            <List aria-hidden="true" className="size-4" />
          </span>
          <span
            className="flex size-7 cursor-not-allowed items-center justify-center rounded-[var(--radius-xs)] text-muted-foreground/40"
            title="A directory is compared row by row; a grid makes two people hard to compare."
          >
            <LayoutGrid aria-hidden="true" className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Applies the bar's state to a list. Pure, so the surface stays a renderer. */
export function applyView<T extends { readonly fullName: string | null; readonly active: boolean; readonly designation: string | null; readonly department: string | null }>(
  rows: readonly T[],
  view: {
    readonly statusFilter: "all" | "active" | "inactive";
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
