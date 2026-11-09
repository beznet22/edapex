import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceComposerProps {
  readonly connected: boolean;
  readonly disabled?: boolean;
  readonly onSend: (text: string, attachmentNames: readonly string[]) => void;
}

export function WorkspaceComposer({
  connected,
  disabled = false,
  onSend
}: WorkspaceComposerProps) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<readonly string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = (): void => {
    const text = draft.trim();
    if (text.length === 0) return;
    onSend(text, attachments);
    setDraft("");
    setAttachments([]);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const names = Array.from(event.target.files ?? []).slice(0, 3).map((file) => file.name);
    setAttachments((current) => [...current, ...names].slice(0, 3));
    event.target.value = "";
  };

  return (
    <form className="border-t border-border bg-background/95 p-3" onSubmit={onSubmit}>
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
                className="rounded-full p-0.5 hover:text-foreground"
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
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
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
        <textarea
          aria-label="Message"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={connected ? "Message EdApex" : "Draft a message — runtime offline"}
          rows={1}
          value={draft}
        />
        <Button
          aria-label="Send message"
          className={cn("size-11 shrink-0", !connected && "opacity-90")}
          disabled={disabled || draft.trim().length === 0}
          size="icon"
          type="submit"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">
        {connected
          ? "Approval-gated actions are sent through the workspace runtime."
          : "Local preview only. Messages stay in this tab; the xcodex runtime arrives in 10C."}
      </p>
    </form>
  );
}
