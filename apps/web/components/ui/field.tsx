"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Vendored shadcn `field` primitives.
 *
 * Kept dependency-free and minimal: a field is a labelled control with optional description
 * and error, and the only thing it needs from the design system is the spacing rhythm. The
 * full upstream file also ships `FieldSet`/`FieldLegend`/`FieldContent`/`FieldTitle`, which
 * nothing here uses — a primitive that exists and is never called is a maintenance cost with
 * no benefit.
 */

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex w-full flex-col gap-6", className)} {...props} />;
}

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="field"
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-[13px] font-medium leading-none text-foreground",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      data-slot="field-label"
      {...props}
    />
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-[12px] leading-5 text-muted-foreground", className)}
      data-slot="field-description"
      {...props}
    />
  );
}

/**
 * The hairline "or" divider between sign-in methods.
 *
 * Two flex rules rather than a border on a text span: the rule must reach both edges at any
 * width, and a bordered span leaves a gap wherever the label wraps.
 */
function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex items-center gap-3", className)}
      data-slot="field-separator"
      {...props}
    >
      <span className="h-px flex-1 bg-border" />
      {children === undefined ? null : (
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {children}
        </span>
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator };
