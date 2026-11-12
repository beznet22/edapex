"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import type { QueuedMessage } from "@edapex/contracts";
import { Paperclip, Send, Square, X } from "lucide-react";

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
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const canSend =
    connected &&
    !disabled &&
    draft.trim().length > 0 &&
    queue.length < MAX_QUEUE;

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
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
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
      className="shrink-0 border-t border-border bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 lg:border-t-0 lg:bg-transparent lg:px-4 lg:pb-5"
      onSubmit={onSubmit}
    >
      {queue.length > 0 ? (
        <div className="mb-2 space-y-1.5" aria-label="Queued messages">
          {queue.map((message) => (
            <div
              className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground"
              key={message.id}
            >
              <span className="min-w-0 flex-1 truncate">{message.text}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">Queued</span>
              <button
                aria-label={`Remove queued message ${message.text}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted hover:text-foreground"
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
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground"
              key={name}
            >
              <span className="truncate">{name}</span>
              <button
                aria-label={`Remove ${name}`}
                className="flex size-8 items-center justify-center rounded-full hover:text-foreground"
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

      <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-shadow focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30">
        <textarea
          aria-label="Message"
          className="max-h-40 min-h-12 w-full resize-none bg-transparent px-1.5 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder={
            connected
              ? "Message EdApex"
              : "Draft — the runtime is not connected"
          }
          ref={textarea}
          rows={1}
          value={draft}
        />
        <div className="mt-1 flex items-center gap-1.5">
          <input
            accept=".pdf,.doc,.docx,.csv,.png,.jpg,.jpeg"
            className="hidden"
            disabled={disabled}
            multiple
            onChange={onFiles}
            ref={fileInput}
            type="file"
          />
          <Button
            aria-label="Add attachment"
            className="size-11 shrink-0"
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Paperclip aria-hidden="true" className="size-4" />
          </Button>
          <span
            className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[10px] font-semibold text-muted-foreground"
            title="Local agent runtime"
          >
            <span
              aria-hidden="true"
              className={connected ? "size-1.5 rounded-full bg-emerald-400" : "size-1.5 rounded-full bg-muted-foreground"}
            />
            xcodex · {connected ? "local" : "offline"}
          </span>
          <span className="flex-1" />
          {stoppable ? (
            <Button
              aria-label="Stop run"
              className="size-11 shrink-0"
              onClick={onStop}
              size="icon"
              type="button"
            >
              <Square aria-hidden="true" className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className={cn("size-11 shrink-0", !canSend && "opacity-60")}
              disabled={!canSend}
              size="icon"
              type="submit"
            >
              <Send aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[10px] leading-4 text-muted-foreground">
        <p>
          {connected
            ? "Approval-gated actions are sent through the workspace runtime."
            : "Local shell only. The xcodex runtime arrives in 10C."}
        </p>
        {queue.length > 0 ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5">
            {queue.length} queued
          </span>
        ) : null}
      </div>
    </form>
  );
}
