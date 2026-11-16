import * as React from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge.
 *
 * The status variants exist here rather than as class strings at call sites. Two reasons:
 *
 * 1. **Contrast.** `text-destructive` and `text-warning` are sized to work as *fills*; used
 *    as 12px text on their own 10% tint they measure 4.22:1 and 4.35:1, below the 4.5:1 AA
 *    floor. The `-ink` tokens are one step darker and land at 5.13:1 and 4.91:1 against the
 *    same tint, with the hue held.
 * 2. **One source of truth.** Six call sites each writing their own tinted background and
 *    text pair is how "yellow on yellow" happens — one of them gets the pair wrong and nobody
 *    notices until someone reads the table on a bad monitor.
 *
 * The three tinted variants are named classes in `globals.css`. Tailwind's arbitrary-value
 * syntax cannot express them: the mix arguments contain commas, which the class scanner
 * splits, and the generated rule silently never applies.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "badge-destructive",
        outline: "border-border bg-transparent text-foreground",
        /** Confirmed, linked, active. */
        success: "badge-success",
        /** Waiting on someone — unclaimed, pending. */
        warning: "badge-warning",
        /*
         * Nothing wrong, nothing special — "no account", "linked".
         *
         * `bg-muted` on a cream card composites to almost the same value as the card itself,
         * so the pill read as a smudge rather than a label. A transparent fill with a visible
         * border and `--foreground` at 70% gives it an edge without giving it emphasis — it is
         * still the quietest variant.
         */
        neutral: "border-border bg-transparent text-foreground/70"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
