"use client"

/**
 * Adapted from AI Elements `PromptInput` (elements.ai-sdk.dev/prompt-input), MIT.
 * The composition is kept whole. What is removed is what would pull a second runtime or
 * a primitive this repo does not have: the `ai` package's `ChatStatus`/`UIMessage` types,
 * and the command/select/hover-card/tabs sub-menus. Attachments are `File`s, not
 * `FileUIPart`s, because the composer hands names to `onSend` and not a message row.
 */

import * as React from "react"
import {
  CornerDownLeftIcon,
  ImageIcon,
  PlusIcon,
  SquareIcon,
  XIcon
} from "lucide-react"

import { cn } from "../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./input-group"
import { Spinner } from "./spinner"

type PromptStatus = "idle" | "submitted" | "streaming" | "error"

interface AttachedFile {
  readonly id: string
  readonly file: File
}

interface AttachmentsContext {
  readonly files: readonly AttachedFile[]
  readonly add: (files: File[] | FileList) => void
  readonly remove: (id: string) => void
  readonly clear: () => void
  readonly openFileDialog: () => void
}

const AttachmentsCtx = React.createContext<AttachmentsContext | null>(null)

function usePromptInputAttachments(): AttachmentsContext {
  const context = React.useContext(AttachmentsCtx)
  if (context === null) {
    throw new Error("usePromptInputAttachments must be used within a Composer")
  }
  return context
}

function PromptInputProvider({
  accept,
  maxFiles,
  onError,
  children
}: {
  readonly accept?: string
  readonly maxFiles?: number
  readonly onError?: (error: { code: "accept" | "max_files"; message: string }) => void
  readonly children: React.ReactNode
}): React.ReactElement {
  const [files, setFiles] = React.useState<readonly AttachedFile[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)

  const add = React.useCallback(
    (incoming: File[] | FileList) => {
      const list = Array.from(incoming)
      const accepted =
        accept === undefined
          ? list
          : list.filter((file) =>
              accept.split(",").some((pattern) => {
                const trimmed = pattern.trim()
                return trimmed.endsWith("/*")
                  ? file.type.startsWith(trimmed.slice(0, -1))
                  : file.type === trimmed
              })
            )
      if (list.length > 0 && accepted.length === 0) {
        onError?.({ code: "accept", message: "No files match the accepted types." })
        return
      }
      setFiles((current) => {
        const capacity =
          maxFiles === undefined ? accepted.length : Math.max(0, maxFiles - current.length)
        if (accepted.length > capacity) {
          onError?.({ code: "max_files", message: "Too many files. Some were not added." })
        }
        return [
          ...current,
          ...accepted.slice(0, capacity).map((file) => ({ file, id: crypto.randomUUID() }))
        ]
      })
    },
    [accept, maxFiles, onError]
  )

  const remove = React.useCallback((id: string) => {
    setFiles((current) => current.filter((item) => item.id !== id))
  }, [])

  const clear = React.useCallback(() => setFiles([]), [])

  const openFileDialog = React.useCallback(() => inputRef.current?.click(), [])

  const context = React.useMemo<AttachmentsContext>(
    () => ({ add, clear, files, openFileDialog, remove }),
    [add, clear, files, openFileDialog, remove]
  )

  return (
    <AttachmentsCtx.Provider value={context}>
      {children}
      <input
        accept={accept}
        aria-label="Upload files"
        className="hidden"
        multiple
        onChange={(event) => {
          if (event.currentTarget.files !== null) add(event.currentTarget.files)
          event.currentTarget.value = ""
        }}
        ref={inputRef}
        type="file"
      />
    </AttachmentsCtx.Provider>
  )
}

function PromptInput({
  className,
  groupClassName,
  header,
  children,
  ...props
}: React.ComponentProps<"form"> & {
  /** Rendered above the field: queued sends and attachment chips live here. */
  header?: React.ReactNode
  /** The surface's own radius, elevation and padding. */
  groupClassName?: string
}): React.ReactElement {
  return (
    <form className={cn("w-full", className)} {...props}>
      {header}
      <InputGroup className={cn("overflow-hidden", groupClassName)}>{children}</InputGroup>
    </form>
  )
}

function PromptInputBody({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return <div data-slot="prompt-input-body" className={cn("contents", className)} {...props} />
}

function PromptInputTextarea({
  className,
  onKeyDown,
  onPaste,
  submitOnEnter = true,
  ...props
}: React.ComponentProps<typeof InputGroupTextarea> & {
  /** The phone keeps Return as a line break; Send is a button there. */
  submitOnEnter?: boolean
}): React.ReactElement {
  const attachments = React.useContext(AttachmentsCtx)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    if (
      submitOnEnter &&
      event.key === "Enter" &&
      !event.nativeEvent.isComposing &&
      !event.shiftKey
    ) {
      event.preventDefault()
      const submit = event.currentTarget.form?.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      )
      if (submit === null || submit === undefined || !submit.disabled) {
        event.currentTarget.form?.requestSubmit()
      }
      return
    }

    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      attachments !== null &&
      attachments.files.length > 0
    ) {
      event.preventDefault()
      const last = attachments.files.at(-1)
      if (last !== undefined) attachments.remove(last.id)
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    onPaste?.(event)
    if (event.defaultPrevented || attachments === null) return
    const pasted: File[] = []
    for (const item of event.clipboardData.items) {
      const file = item.kind === "file" ? item.getAsFile() : null
      if (file !== null) pasted.push(file)
    }
    if (pasted.length > 0) {
      event.preventDefault()
      attachments.add(pasted)
    }
  }

  return (
    <InputGroupTextarea
      className={cn("max-h-44 min-h-11", className)}
      name="message"
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      {...props}
    />
  )
}

function PromptInputHeader({
  className,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupAddon>, "align">): React.ReactElement {
  return (
    <InputGroupAddon
      align="block-start"
      className={cn("order-first flex-wrap gap-1", className)}
      {...props}
    />
  )
}

function PromptInputFooter({
  className,
  align = "block-end",
  ...props
}: React.ComponentProps<typeof InputGroupAddon>): React.ReactElement {
  return (
    <InputGroupAddon
      align={align}
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  )
}

function PromptInputTools({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
}

function PromptInputButton({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupButton>): React.ReactElement {
  return <InputGroupButton className={cn(className)} type="button" {...props} />
}

function PromptInputActionMenu({
  children
}: {
  readonly children: React.ReactNode
}): React.ReactElement {
  return <DropdownMenu>{children}</DropdownMenu>
}

function PromptInputActionMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof PromptInputButton>): React.ReactElement {
  return (
    <DropdownMenuTrigger asChild>
      <PromptInputButton className={className} {...props}>
        {children ?? <PlusIcon className="size-4" />}
      </PromptInputButton>
    </DropdownMenuTrigger>
  )
}

function PromptInputActionMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>): React.ReactElement {
  return <DropdownMenuContent align="start" className={cn(className)} {...props} />
}

function PromptInputActionAddAttachments({
  label = "Add photos or files",
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & { readonly label?: string }): React.ReactElement {
  const attachments = usePromptInputAttachments()
  return (
    <DropdownMenuItem
      {...props}
      onSelect={(event) => {
        event.preventDefault()
        attachments.openFileDialog()
      }}
    >
      <ImageIcon className="mr-2 size-4" /> {label}
    </DropdownMenuItem>
  )
}

function PromptInputSubmit({
  className,
  status = "idle",
  onStop,
  onClick,
  children,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupButton>, "type"> & {
  status?: PromptStatus
  onStop?: () => void
}): React.ReactElement {
  const generating = status === "submitted" || status === "streaming"

  return (
    <InputGroupButton
      aria-label={generating ? "Stop" : "Send"}
      className={cn(className)}
      onClick={(event) => {
        if (generating && onStop) {
          event.preventDefault()
          onStop()
          return
        }
        onClick?.(event)
      }}
      type={generating && onStop ? "button" : "submit"}
      {...props}
    >
      {children ??
        (status === "submitted" ? (
          <Spinner />
        ) : status === "streaming" ? (
          <SquareIcon className="size-4" />
        ) : status === "error" ? (
          <XIcon className="size-4" />
        ) : (
          <CornerDownLeftIcon className="size-4" />
        ))}
    </InputGroupButton>
  )
}

export {
  PromptInputProvider,
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputSubmit,
  usePromptInputAttachments
}
export type { PromptStatus, AttachedFile }
