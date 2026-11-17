"use client"

import { BrainIcon } from "lucide-react"
import * as React from "react"

import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle
} from "./trace"

function Reasoning({
  text,
  running = false
}: {
  readonly text: string
  readonly running?: boolean
}): React.ReactElement {
  const [open, setOpen] = React.useState<boolean>()

  const line = (
    <TraceLine status={running ? "running" : undefined}>
      <TraceIcon>
        <BrainIcon />
      </TraceIcon>
      <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
    </TraceLine>
  )

  if (text.length === 0) {
    return line
  }

  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

export { Reasoning }
