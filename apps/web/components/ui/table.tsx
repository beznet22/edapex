import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table primitives, sized from one row token.
 *
 * Three fixes live here, all from `docs/research/dashboard-data-ui-patterns.md` §0:
 *
 * 1. **The header is sticky.** It was not, so a long directory lost its column labels on the
 *    first scroll.
 * 2. **Header and body rows agree.** `TableHead` was `h-10` (40px) while `TableCell` computed
 *    to 44px, which reads as a rendering bug rather than as a hierarchy.
 * 3. **`border-collapse: separate`.** A sticky header plus `border-collapse: collapse` drops
 *    the header's bottom border in Chromium, Gecko *and* WebKit — a long-standing bug in all
 *    three. The hairline is a `box-shadow` inset instead, which survives.
 *
 * At 40px the header sits 4px shorter than a 44px body row on purpose: it carries one line of
 * 12px uppercase, and matching a two-line body exactly makes it look padded.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto scrollbar-auto">
      <table
        className={cn("w-full border-separate border-spacing-0 caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      /*
       * The hover tint is deliberately below 3:1 — WCAG 1.4.11 governs *required* UI, and a
       * hover affordance is supplementary. The row's focus ring carries the contrast.
       */
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-muted/40",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 h-10 bg-card px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        // `border-collapse: separate` means a border would double; the inset shadow is the
        // hairline that survives a sticky header in every engine.
        "shadow-[inset_0_-1px_0_var(--border)]",
        className
      )}
      scope="col"
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-2.5 align-middle text-[13px]", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
