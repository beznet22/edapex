"use client"

import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

import { cn } from "../lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible"

type TraceStatus = "running" | "error" | "pending"

const lineTone =
  "data-[status=running]:text-foreground data-[status=error]:text-destructive data-[status=pending]:text-muted-foreground"

function Trace({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return <div data-slot="trace" className={cn("flex flex-col gap-1", className)} {...props} />
}

function TraceLine({
  status,
  className,
  ...props
}: React.ComponentProps<"span"> & { status?: TraceStatus }): React.ReactElement {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 text-label text-muted-foreground",
        lineTone,
        className
      )}
      {...props}
    />
  )
}

function TraceIcon({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      data-slot="trace-icon"
      aria-hidden
      className={cn("flex shrink-0 items-center [&_svg]:size-4", className)}
      {...props}
    />
  )
}

function TraceTitle({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return <span data-slot="trace-title" className={cn("min-w-0 truncate", className)} {...props} />
}

function TraceDescription({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 text-label text-muted-foreground", className)}
      {...props}
    />
  )
}

function TraceCollapsible({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible>): React.ReactElement {
  return (
    <Collapsible
      data-slot="trace-collapsible"
      className={cn("group flex w-full flex-col", className)}
      {...props}
    />
  )
}

function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>): React.ReactElement {
  return (
    <CollapsibleTrigger
      data-slot="trace-collapsible-trigger"
      className={cn("group flex w-full items-center gap-2 text-left", className)}
      {...props}
    >
      {children}
      <TraceIcon className="ml-auto">
        <ChevronRightIcon className="group-data-[state=open]:rotate-90" />
      </TraceIcon>
    </CollapsibleTrigger>
  )
}

function TraceCollapsibleContent({
  className,
  keepMounted,
  ...props
}: React.ComponentProps<typeof CollapsibleContent> & {
  keepMounted?: boolean
}): React.ReactElement {
  return (
    <CollapsibleContent
      data-slot="trace-collapsible-content"
      forceMount={keepMounted ? true : undefined}
      className={cn(
        "ml-1 flex flex-col gap-2 border-l border-border pl-3 text-label text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle
}
