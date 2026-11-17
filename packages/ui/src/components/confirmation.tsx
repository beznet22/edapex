"use client"

import * as React from "react"

import { cn } from "../lib/utils"
import { Alert, AlertDescription, AlertTitle } from "./alert"
import { Button } from "./button"

type ConfirmationState = "pending" | "allowed" | "declined"

const resolvedCopy: Record<Exclude<ConfirmationState, "pending">, string> = {
  allowed: "Allowed",
  declined: "Declined"
}

function Confirmation({
  title,
  description,
  state,
  onAllow,
  onDeny,
  className
}: {
  readonly title: string
  readonly description: string
  readonly state: ConfirmationState
  readonly onAllow: () => void
  readonly onDeny: () => void
  readonly className?: string
}): React.ReactElement {
  return (
    <Alert data-slot="confirmation" data-state={state} className={cn("gap-2", className)}>
      <AlertTitle className="text-body font-medium">{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span className="text-label text-muted-foreground">{description}</span>
        {state === "pending" ? (
          <span className="flex gap-2">
            <Button className="h-11 flex-1" onClick={onAllow} size="sm">
              Allow
            </Button>
            <Button className="h-11 flex-1" onClick={onDeny} size="sm" variant="outline">
              Deny
            </Button>
          </span>
        ) : (
          <span className="text-label text-muted-foreground">{resolvedCopy[state]}</span>
        )}
      </AlertDescription>
    </Alert>
  )
}

export { Confirmation }
