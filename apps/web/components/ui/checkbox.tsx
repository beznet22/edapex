"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A checkbox.
 *
 * Hand-written rather than pulled from Radix: the shadcn checkbox component needs
 * `@radix-ui/react-checkbox`, and adding a dependency to this workspace once re-resolved the
 * React peer graph into two copies and broke server rendering on every route. A checkbox is
 * a `<button role="checkbox">` with three states; it does not need a library.
 *
 * `indeterminate` is a real state, not a styling choice: a header checkbox over a partially
 * selected page must say "some", or the person cannot tell whether clicking will select or
 * clear.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onCheckedChange,
  disabled,
  className,
  "aria-label": ariaLabel
}: {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly "aria-label": string;
}) {
  const state = indeterminate ? "mixed" : checked;
  return (
    <button
      aria-checked={state}
      aria-label={ariaLabel}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-foreground/40",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="checkbox"
      type="button"
    >
      {indeterminate ? (
        <Minus aria-hidden="true" className="size-3" strokeWidth={3} />
      ) : checked ? (
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
