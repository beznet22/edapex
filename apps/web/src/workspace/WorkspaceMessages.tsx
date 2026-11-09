import { lazy, Suspense } from "react";
import { Check, ChevronDown, CircleAlert, Clock3, ShieldAlert, X } from "lucide-react";

import { Message, MessageContent } from "@edapex/chat";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ApprovalPart,
  ChatMessage,
  ChatMessagePart,
  SurfacePart,
  ToolCallPart
} from "@edapex/contracts";

const GenUISurface = lazy(async () => {
  const module = await import("@edapex/genui");
  return { default: module.SurfaceRenderer };
});

const statusLabel: Record<ToolCallPart["status"], string> = {
  running: "In progress",
  completed: "Completed",
  failed: "Didn't work",
  blocked: "Blocked",
  declined: "Declined",
  refused: "Refused",
  waiting_for_person: "Waiting for you"
};

function ToolActivity({ tools }: { readonly tools: readonly ToolCallPart[] }) {
  return (
    <details className="group rounded-xl border border-border bg-card/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm">
        <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
          <Check aria-hidden="true" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {tools.length} {tools.length === 1 ? "step" : "steps"} completed
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3">
        {tools.map((tool) => (
          <div className="flex gap-2 text-xs" key={tool.toolCallId}>
            <span
              className={cn(
                "mt-0.5 size-1.5 shrink-0 rounded-full",
                tool.status === "running" ? "bg-primary" : "bg-emerald-400"
              )}
            />
            <div className="min-w-0">
              <div className="font-medium text-foreground">{tool.name}</div>
              <div className="mt-0.5 text-muted-foreground">
                {statusLabel[tool.status]} · {tool.summary}
              </div>
              {tool.detail !== undefined ? (
                <div className="mt-1 text-muted-foreground/80">{tool.detail}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ApprovalCard({
  approval,
  onDecision
}: {
  readonly approval: ApprovalPart;
  readonly onDecision: (decision: "allowed" | "declined") => void;
}) {
  if (approval.status !== "pending") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5 text-sm">
        {approval.status === "allowed" ? (
          <Check aria-hidden="true" className="size-4 text-emerald-400" />
        ) : (
          <X aria-hidden="true" className="size-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          {approval.status === "allowed" ? "Allowed once" : "Declined"} · {approval.title}
        </span>
      </div>
    );
  }
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {approval.risk === "destructive" ? (
            <ShieldAlert aria-hidden="true" className="size-4" />
          ) : (
            <Clock3 aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            Approval required
          </div>
          <h3 className="mt-0.5 text-sm font-semibold">{approval.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.description}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          className="min-h-11 flex-1"
          onClick={() => onDecision("allowed")}
          size="sm"
          type="button"
        >
          Allow once
        </Button>
        <Button
          className="min-h-11 flex-1"
          onClick={() => onDecision("declined")}
          size="sm"
          type="button"
          variant="outline"
        >
          Refuse
        </Button>
      </div>
    </section>
  );
}

function SurfaceFallback({ surface }: { readonly surface: SurfacePart }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h3 className="text-sm font-semibold">Surface unavailable</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        The generated surface could not be validated. The turn remains readable and no action ran.
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{surface.catalogVersion}</span>
        <span>{surface.dataClass}</span>
      </div>
    </div>
  );
}

function SurfaceCard({ surface }: { readonly surface: SurfacePart }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
          Generated surface
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          {surface.catalogVersion}
        </span>
      </div>
      <div className="p-3">
        <Suspense fallback={<p className="text-xs text-muted-foreground">Rendering surface…</p>}>
          <GenUISurface fallback={<SurfaceFallback surface={surface} />} surface={surface} />
        </Suspense>
      </div>
    </section>
  );
}

function PartView({
  part,
  messageId,
  onApproval
}: {
  readonly part: ChatMessagePart;
  readonly messageId: string;
  readonly onApproval: (messageId: string, approvalRequestId: string, decision: "allowed" | "declined") => void;
}) {
  switch (part.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-[15px] leading-6">{part.text}</p>;
    case "thinking":
      return (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
          {part.text}
        </p>
      );
    case "tool":
      return <ToolActivity tools={[part]} />;
    case "approval":
      return (
        <ApprovalCard
          approval={part}
          onDecision={(decision) => onApproval(messageId, part.approvalRequestId, decision)}
        />
      );
    case "surface":
      return <SurfaceCard surface={part} />;
    case "attachment":
      return (
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground">
          <span className="truncate">{part.fileName}</span>
          <span className="shrink-0 text-muted-foreground/70">{part.contentType}</span>
        </span>
      );
  }
}

export function MessageBubble({
  message,
  onApproval
}: {
  readonly message: ChatMessage;
  readonly onApproval: (messageId: string, approvalRequestId: string, decision: "allowed" | "declined") => void;
}) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <CircleAlert aria-hidden="true" className="size-3" />
          {message.parts.map((part) => (part.kind === "text" ? part.text : "")).join(" ")}
        </div>
      </div>
    );
  }

  const groupedTools = message.parts.filter(
    (part): part is ToolCallPart => part.kind === "tool"
  );
  let renderedTools = false;

  return (
    <Message align={message.role === "user" ? "end" : "start"}>
      <MessageContent
        className={cn(
          "space-y-2",
          message.role === "user" ? "max-w-[85%]" : "max-w-[92%]"
        )}
      >
        {message.parts.map((part, index) => {
          if (part.kind === "tool") {
            if (renderedTools) return null;
            renderedTools = true;
            return <ToolActivity key={`${message.id}-tools`} tools={groupedTools} />;
          }
          return (
            <div
              className={cn(
                message.role === "user" &&
                  "rounded-[20px] bg-primary/15 px-4 py-3 text-foreground",
                message.role === "assistant" && part.kind === "text" && "px-1 py-1"
              )}
              key={`${message.id}-${index}`}
            >
              <PartView
                messageId={message.id}
                onApproval={onApproval}
                part={part}
              />
            </div>
          );
        })}
      </MessageContent>
    </Message>
  );
}
