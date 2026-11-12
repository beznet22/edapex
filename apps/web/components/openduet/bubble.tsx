/**
 * Structure adapted from CopilotKit/OpenDuet at
 * f52288fff5ccdbd3de428d573d9f026fce5ff480
 * (openbot/app/src/components/ui/bubble.tsx), MIT.
 * EdApex changes: no Base UI render hook, Gold on Slate tokens, explicit variants.
 */
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type BubbleVariant = "default" | "secondary" | "ghost" | "outline" | "destructive";

const VARIANT_CLASS: Record<BubbleVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  ghost: "bg-transparent text-foreground",
  outline: "border border-border bg-background text-foreground",
  destructive: "bg-destructive/10 text-destructive"
};

export function BubbleGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-2", className)} {...props} />;
}

export function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: BubbleVariant; align?: "start" | "end" }) {
  return (
    <div
      className={cn(
        "flex w-fit max-w-[85%] min-w-0 flex-col gap-1",
        align === "end" ? "self-end" : "self-start",
        className
      )}
      data-align={align}
      data-variant={variant}
      {...props}
    />
  );
}

export function BubbleContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-6 break-words",
        className
      )}
      {...props}
    />
  );
}
