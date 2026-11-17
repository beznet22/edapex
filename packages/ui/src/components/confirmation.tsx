"use client"

import { Check, ShieldAlert, X } from "lucide-react"
import * as React from "react"

import { cn } from "../lib/utils"
import { Alert, AlertDescription, AlertTitle } from "./alert"
import { Button } from "./button"

type ConfirmationState = "pending" | "allowed" | "declined"
type ConfirmationRisk = "read" | "write" | "destructive"

const RISK_LABEL: Record<ConfirmationRisk, string> = {
  read: "Read",
  write: "Write",
  destructive: "Destructive"
}

const RESOLVED: Record<Exclude<ConfirmationState, "pending">, string> = {
  allowed: "You allowed this action.",
  declined: "You declined this action."
}

function Confirmation({
  title,
  description,
  state,
  risk,
  onAllow,
  onDeny,
  allowLabel = "Allow once",
  denyLabel = "Decline",
  className
}: {
  readonly title: string
  readonly description: string
  readonly state: ConfirmationState
  readonly risk?: ConfirmationRisk
  readonly onAllow: () => void
  readonly onDeny: () => void
  readonly allowLabel?: string
  readonly denyLabel?: string
  readonly className?: string
}): React.ReactElement {
  const pending = state === "pending"

  return (
    <Alert
      aria-label={pending ? "Approval required" : "Approval decision"}
      className={cn("gap-2", className)}
      data-slot="confirmation"
      data-state={state}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            pending ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {pending ? <ShieldAlert className="size-4" /> : <Check className="size-4" />}
        </span>
        <AlertTitle className="text-body font-medium">{title}</AlertTitle>
        {risk ? (
          <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-label font-medium text-muted-foreground">
            {RISK_LABEL[risk]}
          </span>
        ) : null}
      </span>
      <AlertDescription className="flex flex-col gap-3">
        <span className="text-label text-muted-foreground">{description}</span>
        {pending ? (
          <span className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={onAllow} size="sm" type="button">
              <Check aria-hidden="true" className="size-4" />
              {allowLabel}
            </Button>
            <Button
              className="min-h-11"
              onClick={onDeny}
              size="sm"
              type="button"
              variant="outline"
            >
              <X aria-hidden="true" className="size-4" />
              {denyLabel}
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-label font-medium text-muted-foreground">
            {state === "allowed" ? (
              <Check aria-hidden="true" className="size-3.5 text-success" />
            ) : (
              <X aria-hidden="true" className="size-3.5 text-destructive" />
            )}
            {RESOLVED[state]}
          </span>
        )}
      </AlertDescription>
    </Alert>
  )
}

export { Confirmation }
