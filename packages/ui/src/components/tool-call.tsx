"use client"

import { WrenchIcon } from "lucide-react"
import * as React from "react"

import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle
} from "./trace"

type ToolStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "declined"
  | "refused"
  | "waiting_for_person"

/** The line says what happened in words; colour alone is not a status. */
const VERB: Record<ToolStatus, string> = {
  running: "Running",
  completed: "Ran",
  failed: "Failed to run",
  blocked: "Blocked",
  declined: "Declined",
  refused: "Refused",
  waiting_for_person: "Waiting to run"
}

function ToolCall({
  name,
  summary,
  status,
  detail
}: {
  readonly name: string
  readonly summary: string
  readonly status: ToolStatus
  readonly detail?: string
}): React.ReactElement {
  const line = (
    <TraceLine
      status={
        status === "running"
          ? "running"
          : status === "failed"
            ? "error"
            : status === "waiting_for_person"
              ? "pending"
              : undefined
      }
    >
      <TraceIcon>
        <WrenchIcon />
      </TraceIcon>
      <TraceTitle>
        {VERB[status]} {name}
      </TraceTitle>
      {summary ? <TraceDescription>{summary}</TraceDescription> : null}
    </TraceLine>
  )

  if (!detail) {
    return line
  }

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap font-mono">
        {detail}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

export { ToolCall }
