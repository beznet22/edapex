"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { QueuedMessage } from "@edapex/contracts";
import { ArrowUp, Paperclip, X } from "lucide-react";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentTitle
} from "@edapex/ui/components/attachment";
import { Button } from "@edapex/ui/components/button";
import {
  Composer as ComposerSurface,
  ComposerButton,
  ComposerFooter,
  ComposerSubmit,
  ComposerTextarea
} from "@edapex/ui/components/composer";
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

  const canSend =
    connected && !disabled && draft.trim().length > 0 && queue.length < MAX_QUEUE;

  const submit = (): void => {
    if (!canSend) return;
    onSend(draft.trim(), attachments);
    setDraft("");
    setAttachments([]);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit();
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const names = Array.from(event.target.files ?? [])
      .slice(0, MAX_ATTACHMENTS)
      .map((file) => file.name);
    setAttachments((current) => [...current, ...names].slice(0, MAX_ATTACHMENTS));
    event.target.value = "";
  };

  const header = (
    <>
      {queue.length > 0 ? (
        <div aria-label="Queued messages" className="mb-2 space-y-1.5">
          {queue.map((message) => (
            <div
              className="flex items-center gap-2 rounded-xl bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground"
              key={message.id}
            >
              <span className="min-w-0 flex-1 truncate">{message.text}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">Queued</span>
              <Button
                aria-label={`Remove queued message ${message.text}`}
                className="size-8 rounded-full hover:bg-background hover:text-foreground after:-inset-1.5"
                onClick={() => onRemoveQueued(message.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <AttachmentGroup className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((name) => (
            <Attachment key={name} orientation="horizontal" size="xs">
              <AttachmentContent>
                <AttachmentTitle>{name}</AttachmentTitle>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item !== name))
                  }
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      ) : null}
    </>
  );

  return (
    <ComposerSurface
      className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:px-4 lg:pb-5"
      groupClassName={cn(
        "nested rounded-2xl bg-card p-2 md:glass",
        focused ? "ring-2 ring-ring/40" : "ring-1 ring-border/60",
        "shadow-[var(--elevation-2)]"
      )}
      header={header}
      onSubmit={onSubmit}
    >
      <ComposerTextarea
        aria-label="Message"
        className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        disabled={disabled}
        onBlur={() => setFocused(false)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={connected ? "Ask EDAPEX anything" : "Loading the workspace…"}
        rows={1}
        value={draft}
      />
      <ComposerFooter className="mt-1 gap-1">
        <input
          accept=".pdf,.doc,.docx,.csv,.png,.jpg,.jpeg"
          className="hidden"
          disabled={disabled}
          multiple
          onChange={onFiles}
          ref={fileInput}
          type="file"
        />
        <ComposerButton
          aria-label="Add attachment"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          size="icon-sm"
          variant="ghost"
        >
          <Paperclip aria-hidden="true" className="size-4" />
        </ComposerButton>
        <span className="flex-1" />
        {stoppable ? (
          <ComposerSubmit
            className="size-9 shrink-0 rounded-full"
            onStop={onStop}
            size="icon-sm"
            status="streaming"
            variant="secondary"
          />
        ) : (
          <ComposerSubmit
            className={cn(
              "size-9 shrink-0 rounded-full transition-transform",
              canSend ? "scale-100" : "scale-95 opacity-40"
            )}
            disabled={!canSend}
            size="icon-sm"
            status="idle"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </ComposerSubmit>
        )}
      </ComposerFooter>
    </ComposerSurface>
  );
}
