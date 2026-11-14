"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import type { QueuedMessage } from "@edapex/contracts";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ComposerProps {
  readonly connected: boolean;
  readonly disabled?: boolean;
  readonly queue: readonly QueuedMessage[];
  readonly stoppable: boolean;
  readonly onSend: (text: string, attachmentNames: readonly string[]) => void;
  readonly onStop: () => void;
  readonly onRemoveQueued: (id: string) => void;
}

const MAX_ATTACHMENTS = 3;
const MAX_QUEUE = 20;

/**
 * The message composer.
 *
 * Frosted glass is applied from `md` up only. On a phone the blur costs more than
 * it gives: the compositor has to re-blur while the software keyboard resizes
 * the viewport.
 */
export function Composer({
  connected,
  disabled = false,
  queue,
  stoppable,
  onSend,
  onStop,
  onRemoveQueued
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<readonly string[]>([]);
  const [focused, setFocused] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const canSend =
    connected && !disabled && draft.trim().length > 0 && queue.length < MAX_QUEUE;

  const submit = (): void => {
    if (!canSend) return;
    onSend(draft.trim(), attachments);
    setDraft("");
    setAttachments([]);
    if (textarea.current !== null) {
      textarea.current.style.height = "auto";
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onInput = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
    const element = event.target;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const names = Array.from(event.target.files ?? [])
      .slice(0, MAX_ATTACHMENTS)
      .map((file) => file.name);
    setAttachments((current) => [...current, ...names].slice(0, MAX_ATTACHMENTS));
    event.target.value = "";
  };

  return (
    <form
      className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:px-4 lg:pb-5"
      onSubmit={onSubmit}
    >
      {queue.length > 0 ? (
        <div
          aria-label="Queued messages"
          className="mb-2 space-y-1.5"
        >
          {queue.map((message) => (
            <div
              className="flex items-center gap-2 rounded-xl bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground"
              key={message.id}
            >
              <span className="min-w-0 flex-1 truncate">{message.text}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">Queued</span>
              <button
                aria-label={`Remove queued message ${message.text}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-background hover:text-foreground"
                onClick={() => onRemoveQueued(message.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((name) => (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              key={name}
            >
              <span className="truncate">{name}</span>
              <button
                aria-label={`Remove ${name}`}
                className="flex size-6 items-center justify-center rounded-full hover:text-foreground"
                onClick={() =>
                  setAttachments((current) => current.filter((item) => item !== name))
                }
                type="button"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/*
        One surface, no per-edge rules. The ring carries the focused state, so the
        composer does not draw a border at all.
      */}
      <div
        className={cn(
          "nested rounded-2xl bg-card p-2 transition-all duration-200 md:glass",
          focused ? "ring-2 ring-ring/40" : "ring-1 ring-border/60",
          "shadow-[var(--elevation-2)]"
        )}
      >
        <textarea
          aria-label="Message"
          className="max-h-44 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          disabled={disabled}
          onBlur={() => setFocused(false)}
          onChange={onInput}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={connected ? "Ask EdApex anything" : "Loading the workspace…"}
          ref={textarea}
          rows={1}
          value={draft}
        />
        <div className="mt-1 flex items-center gap-1">
          <input
            accept=".pdf,.doc,.docx,.csv,.png,.jpg,.jpeg"
            className="hidden"
            disabled={disabled}
            multiple
            onChange={onFiles}
            ref={fileInput}
            type="file"
          />
          <button
            aria-label="Add attachment"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Paperclip aria-hidden="true" className="size-4" />
          </button>
          <span className="flex-1" />
          {stoppable ? (
            <Button
              aria-label="Stop run"
              className="size-9 shrink-0 rounded-full"
              onClick={onStop}
              size="icon"
              type="button"
              variant="secondary"
            >
              <Square aria-hidden="true" className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className={cn(
                "size-9 shrink-0 rounded-full transition-transform",
                canSend ? "scale-100" : "scale-95 opacity-40"
              )}
              disabled={!canSend}
              size="icon"
              type="submit"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">
        {connected
          ? "Every action that reaches the network or your records asks first."
          : "The local agent runtime is still loading."}
      </p>
    </form>
  );
}
