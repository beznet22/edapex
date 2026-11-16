"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Tabs.
 *
 * Hand-written rather than vendored from shadcn, because the shadcn tab primitive pulls in
 * `@radix-ui/react-tabs`, and adding a dependency to this workspace re-resolved the React
 * peer graph into two copies — which broke server rendering on every route, not just this
 * one. A tab strip is twelve lines of state; it is not worth a dependency that can do that.
 *
 * Accessibility follows the ARIA tabs pattern: `role="tablist"`, roving `aria-selected`,
 * `aria-controls`/`aria-labelledby` pairs, and Left/Right/Home/End keys.
 */

interface TabsContextValue {
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (context === null) throw new Error("Tabs components must be used inside <Tabs>");
  return context;
}

export function Tabs({
  value,
  onValueChange,
  className,
  children
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange, baseId }}>
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "scrollbar-auto flex w-full items-stretch gap-5 overflow-x-auto border-b border-border",
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children
}: {
  readonly value: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { value: active, setValue, baseId } = useTabs();
  const selected = active === value;

  return (
    <button
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={selected}
      className={cn(
        // 40px tall with a 2px underline; `-mb-px` overlaps the list's own rule so the
        // active section looks connected to its content.
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-0.5 text-[13px] font-medium",
        "outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150",
        selected
          ? "text-foreground after:bg-primary"
          : "text-muted-foreground after:bg-transparent hover:text-foreground",
        className
      )}
      id={`${baseId}-tab-${value}`}
      onClick={() => setValue(value)}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children
}: {
  readonly value: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { value: active, baseId } = useTabs();
  if (active !== value) return null;

  return (
    <div
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn(
        "flex-1 outline-none",
        // Content fades rather than slides: a horizontal slide on a full-width panel reads as
        // a page transition, which is the wrong scale for a tab switch.
        "animate-[edapex-fade-in_var(--motion-fast)_var(--ease-enter)]",
        className
      )}
      id={`${baseId}-panel-${value}`}
      role="tabpanel"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
