"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@edapex/ui/components/pagination";

/**
 * Table footer.
 *
 * Built on the shadcn `pagination` primitives rather than hand-rolled buttons: `Pagination`
 * supplies `role="navigation" aria-label="pagination"`, and the link variants already carry
 * the right current-page semantics.
 *
 * The page window is a window, not a list — twelve page numbers on a school directory pushes
 * the row count off-screen. First, last, current ±1, and an ellipsis where the range skipped.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100]
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
  readonly pageSizes?: readonly number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const window = pageWindow(page, pages);

  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[12px] text-muted-foreground">
        {total === 0 ? "No results" : `Showing ${first}–${last} of ${total}`}
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Rows
          <select
            aria-label="Rows per page"
            className="h-8 rounded-[var(--radius-sm)] border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            value={pageSize}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 1) onPageChange(page - 1);
                }}
              />
            </PaginationItem>

            {window.map((entry, index) =>
              entry === "gap" ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <PaginationLink
                    aria-current={entry === page ? "page" : undefined}
                    href="#"
                    isActive={entry === page}
                    onClick={(event) => {
                      event.preventDefault();
                      onPageChange(entry);
                    }}
                  >
                    {entry}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                aria-disabled={page >= pages}
                className={page >= pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page < pages) onPageChange(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

/** `1 … 4 5 6 … 12` — bounded, so the control is never wider than the table under it. */
function pageWindow(current: number, pages: number): readonly (number | "gap")[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }
  const entries: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) entries.push("gap");
  for (let value = start; value <= end; value += 1) entries.push(value);
  if (end < pages - 1) entries.push("gap");
  entries.push(pages);
  return entries;
}
