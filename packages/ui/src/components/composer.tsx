"use client"

import * as React from "react"

import { cn } from "../lib/utils"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments
} from "./prompt-input"

/**
 * The composer both hosts render.
 *
 * It is the AI Elements prompt pattern with EdApex's name on it: one surface, the field,
 * a footer of tools and a submit that becomes Stop while a turn streams. The platform
 * supplies what sits inside — attachments and queued sends on web, a dock and dictation
 * on the phone — because those differ by host, not by design.
 */
function Composer({
  className,
  accept,
  maxFiles,
  onError,
  ...props
}: React.ComponentProps<typeof PromptInput> & {
  readonly accept?: string
  readonly maxFiles?: number
  readonly onError?: (error: { code: "accept" | "max_files"; message: string }) => void
}): React.ReactElement {
  return (
    <PromptInputProvider accept={accept} maxFiles={maxFiles} onError={onError}>
      <PromptInput className={cn("shrink-0", className)} {...props} />
    </PromptInputProvider>
  )
}

function ComposerRow({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)} {...props} />
}

export {
  Composer,
  PromptInputBody as ComposerBody,
  PromptInputHeader as ComposerHeader,
  PromptInputFooter as ComposerFooter,
  PromptInputTools as ComposerTools,
  PromptInputTextarea as ComposerTextarea,
  PromptInputButton as ComposerButton,
  PromptInputSubmit as ComposerSubmit,
  PromptInputActionMenu as ComposerActionMenu,
  PromptInputActionMenuTrigger as ComposerActionMenuTrigger,
  PromptInputActionMenuContent as ComposerActionMenuContent,
  PromptInputActionAddAttachments as ComposerAddAttachments,
  usePromptInputAttachments as useComposerAttachments,
  ComposerRow
}
