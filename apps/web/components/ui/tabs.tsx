"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

/*
 * Vendored shadcn tabs, restyled to this design system.
 *
 * The stock list is a filled pill track; the reference layout uses an underline indicator on
 * a hairline rule, which reads as "sections of one page" rather than "a segmented control".
 * The underline is 2px and sits *over* the rule rather than beside it, so the active section
 * looks connected to its content.
 */

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "scrollbar-auto flex w-full items-stretch gap-5 overflow-x-auto border-b border-border",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // 40px tall with a 2px underline; `-mb-px` overlaps the list's own rule.
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-0.5 text-[13px] font-medium",
        "text-muted-foreground transition-colors duration-150 hover:text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:duration-150",
        "data-[state=active]:text-foreground data-[state=active]:after:bg-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "flex-1 outline-none",
        // Content fades in rather than sliding: a horizontal slide on a full-width panel is
        // the kind of movement that reads as a page transition, not a tab switch.
        "data-[state=active]:animate-[edapex-fade-in_var(--motion-fast)_var(--ease-enter)]",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
