"use client";

import { BrandMark } from "@/components/workspace/BrandMark";
import type { ReactNode } from "react";
import {
  MarkdownMessage,
  Message,
  MessageContent,
  MessageGroup,
  Skeleton
} from "@edapex/chat";
import type {
  AttachmentPart,
  CapabilityManifest,
  ChatMessage,
  ChatMessagePart,
  QueuedMessage,
  SurfacePart,
  ToolCallPart,
  WorkspaceRunState,
  WorkspaceRuntimeView
} from "@edapex/contracts";
import { Paperclip } from "lucide-react";

import { Confirmation } from "@edapex/ui/components/confirmation";
import { Bubble, BubbleContent } from "./bubble";
import { MessageScroller } from "./message-scroller";
import { ToolActivity } from "./tool-activity";
import { GenUISurface } from "@/components/genui/GenUISurface";

interface ChatTranscriptProps {
  readonly manifest: CapabilityManifest;
  readonly messages: readonly ChatMessage[];
  readonly queue: readonly QueuedMessage[];
  readonly runtime: WorkspaceRuntimeView;
  readonly onApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
}

function AttachmentChip({ part }: { readonly part: AttachmentPart }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
      <Paperclip aria-hidden="true" className="size-3" />
      <span className="truncate">{part.fileName}</span>
    </span>
  );
}

function Thinking() {
  return (
    <span aria-label="Thinking" className="flex min-h-8 items-center gap-1 px-3">
      <span className="thinking-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="thinking-dot size-1.5 rounded-full bg-muted-foreground" />
      <span className="thinking-dot size-1.5 rounded-full bg-muted-foreground" />
    </span>
  );
}

interface RenderPartOptions {
  readonly part: ChatMessagePart;
  readonly index: number;
  readonly message: ChatMessage;
  readonly manifest: CapabilityManifest;
  readonly onApproval: ChatTranscriptProps["onApproval"];
  readonly streaming: boolean;
}

function renderPart({
  part,
  index,
  message,
  manifest,
  onApproval,
  streaming
}: RenderPartOptions): ReactNode {
  switch (part.kind) {
    case "text":
      return (
        <Bubble
          align={message.role === "user" ? "end" : "start"}
          key={`text-${index}`}
          variant={message.role === "user" ? "default" : "secondary"}
        >
          <BubbleContent>
            {message.role === "user" ? (
              // A person's own words stay literal. Rendering their text as Markdown
              // would silently reinterpret asterisks and underscores they typed.
              <p className="whitespace-pre-wrap">{part.text}</p>
            ) : (
              <MarkdownMessage streaming={streaming}>{part.text}</MarkdownMessage>
            )}
          </BubbleContent>
        </Bubble>
      );
    case "thinking":
      return <Thinking key={`thinking-${index}`} />;
    case "approval":
      return (
        <Confirmation
          description={part.description}
          key={part.approvalRequestId}
          onAllow={() => onApproval(message.id, part.approvalRequestId, "allowed")}
          onDeny={() => onApproval(message.id, part.approvalRequestId, "declined")}
          risk={part.risk}
          state={part.status}
          title={part.title}
        />
      );
    case "surface":
      return <GenUISurface key={`surface-${index}`} surface={part} />;
    case "attachment":
      return <AttachmentChip key={part.attachmentId} part={part} />;
    case "tool":
      return null;
    default:
      return null;
  }
}

/**
 * States in which a turn is actively producing assistant text.
 *
 * `waiting_for_person` is excluded on purpose: the turn is paused at an approval or a
 * question, so its text is final for now and should render exactly as written.
 * `completed`, `stopped` and `error` are likewise done.
 */
function isTurnProducing(state: WorkspaceRunState): boolean {
  return state === "thinking" || state === "following" || state === "tool_running";
}

/** The trailing assistant message, if the transcript ends with one. */
function lastAssistantMessageId(messages: readonly ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    if (message.role === "assistant") return message.id;
    // A queued user message can sit after the live one. Anything else ends the search:
    // if the last assistant message is not trailing, nothing is being written.
    if (message.role === "user" && message.queueState === "queued") continue;
    return null;
  }
  return null;
}

function AssistantParts({
  message,
  manifest,
  onApproval,
  streaming
}: {
  readonly message: ChatMessage;
  readonly manifest: CapabilityManifest;
  readonly onApproval: ChatTranscriptProps["onApproval"];
  readonly streaming: boolean;
}) {
  const nodes: ReactNode[] = [];
  let tools: ToolCallPart[] = [];

  const flushTools = (): void => {
    if (tools.length === 0) return;
    nodes.push(<ToolActivity key={`tools-${nodes.length}`} tools={tools} />);
    tools = [];
  };

  message.parts.forEach((part, index) => {
    if (part.kind === "tool") {
      tools.push(part);
      return;
    }
    flushTools();
    nodes.push(renderPart({ part, index, message, manifest, onApproval, streaming }));
  });
  flushTools();

  return <>{nodes}</>;
}

function EmptyState({ manifest }: { readonly manifest: CapabilityManifest }) {
  const toolCount = manifest.packs.reduce((total, pack) => total + pack.tools.length, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <BrandMark size={40} />
      <h2 className="mt-5 text-xl font-semibold tracking-tight">What are we working on?</h2>
      <p className="mt-2 max-w-[28ch] text-sm leading-6 text-muted-foreground">
        Your {manifest.role} workspace is ready. Ask about people, classes, attendance or reports.
        Changes to school records stop for your approval.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">
          {manifest.limits.maxTools} tools max
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">
          {toolCount} tools
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">
          {manifest.packs.length} role packs
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">
          Approval-gated writes
        </span>
      </div>
    </div>
  );
}

export function ChatTranscript({
  manifest,
  messages,
  queue,
  runtime,
  onApproval
}: ChatTranscriptProps) {
  const scrollKey = `${messages.length}:${queue.length}:${runtime.state}`;

  // Which assistant message is still being written.
  //
  // Derived rather than read from the runtime view: a turn produces exactly one
  // assistant message and it is always the last one, so the invariant already holds.
  // Adding a `streamingMessageId` field would give the adapter a second thing to keep
  // correct for no extra information — and a stale id would silently stop repairing
  // Markdown mid-answer.
  const streamingMessageId = isTurnProducing(runtime.state)
    ? lastAssistantMessageId(messages)
    : null;

  if (runtime.state === "restoring") {
    return (
      <div aria-label="Restoring conversation" className="flex flex-1 flex-col gap-4 px-4 py-6" role="status">
        {[0, 1, 2].map((index) => (
          <div className="space-y-2" key={index}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (runtime.state === "history_unavailable") {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <h2 className="text-sm font-semibold">History unavailable</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            We could not restore this conversation. New messages can still be sent when the
            runtime is connected.
          </p>
        </div>
      </div>
    );
  }

  if (messages.length === 0 && queue.length === 0) {
    return <EmptyState manifest={manifest} />;
  }

  return (
    <MessageScroller label="Chat transcript" scrollKey={scrollKey}>
      {messages.map((message) => {
        if (message.role === "system") {
          return (
            <p
              className="mx-auto max-w-[42ch] text-center text-[11px] leading-5 text-muted-foreground"
              key={message.id}
            >
              {message.parts
                .filter((part): part is Extract<ChatMessagePart, { kind: "text" }> => part.kind === "text")
                .map((part) => part.text)
                .join(" ")}
            </p>
          );
        }

        const queued = message.queueState === "queued";
        return (
          <div className={queued ? "opacity-65" : "animate-message-in"} key={message.id}>
            <Message align={message.role === "user" ? "end" : "start"}>
              <MessageContent>
                {queued ? (
                  <span className="self-start rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Queued
                  </span>
                ) : null}
                {message.role === "user" ? (
                  <MessageGroup>
                    {message.parts.map((part, index) =>
                      renderPart({
                        part,
                        index,
                        message,
                        manifest,
                        onApproval,
                        // A person's own message is never "streaming": it is sent
                        // whole, so repairing its Markdown would alter their text.
                        streaming: false
                      })
                    )}
                  </MessageGroup>
                ) : (
                  <AssistantParts
                    manifest={manifest}
                    message={message}
                    onApproval={onApproval}
                    streaming={streamingMessageId === message.id}
                  />
                )}
                {message.seenAt !== null && message.seenAt !== undefined ? (
                  <span className="self-end text-[10px] text-muted-foreground">Seen</span>
                ) : null}
              </MessageContent>
            </Message>
          </div>
        );
      })}
      {queue.map((message) => (
        <div className="opacity-60" key={message.id}>
          <Message align="end">
            <MessageContent>
              <span className="self-end rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Queued
              </span>
              <Bubble align="end" variant="secondary">
                <BubbleContent>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </div>
      ))}
      {runtime.state === "thinking" || runtime.state === "following" ? (
        <div className="px-1">
          <Thinking />
        </div>
      ) : null}
    </MessageScroller>
  );
}
