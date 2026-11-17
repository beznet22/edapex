import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { ChatMessage, ChatMessagePart } from "@edapex/contracts";

import { Confirmation } from "@edapex/ui/components/confirmation"
import { Reasoning } from "@edapex/ui/components/reasoning"
import { ToolCall } from "@edapex/ui/components/tool-call"
import { cn } from "@edapex/ui/lib/utils";

import { isAtEnd, shouldFollow } from "@/lib/transcript";

/**
 * The conversation, windowed from the end.
 *
 * Anchoring to the bottom is the requirement that shapes the whole component: the view is
 * pinned to the last message while the person is reading the last message, and stays put the
 * moment they scroll up. `isAtEnd` decides that, and it is checked *before* the append — by
 * the time the content has grown, the old distance is unrecoverable.
 */
export function Transcript({
  messages,
  onDecideApproval,
  streaming
}: {
  readonly messages: readonly ChatMessage[];
  readonly onDecideApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
  readonly streaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(messages.length);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8
  });

  const measure = useCallback(() => {
    const element = scrollRef.current;
    if (element === null) return;
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  }, []);

  // Read the position before the DOM grows, then decide. `useLayoutEffect` is deliberate: an
  // effect runs after paint, and by then "was the reader at the end" is already answered.
  useEffect(() => {
    const atEnd = (() => {
      const metrics = measure();
      return metrics === undefined ? true : isAtEnd(metrics);
    })();
    const follow = shouldFollow(previousCount.current, messages.length, atEnd);
    previousCount.current = messages.length;
    if (follow) virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [measure, messages.length, virtualizer]);

  return (
    <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto px-gutter" ref={scrollRef}>
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => {
          const message = messages[row.index];
          if (message === undefined) return null;
          return (
            <div
              className="absolute inset-x-0 top-0"
              data-index={row.index}
              key={message.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <MessageRow
                message={message}
                onDecideApproval={onDecideApproval}
                streaming={streaming && row.index === messages.length - 1}
              />
            </div>
          );
        })}
      </div>
      {streaming ? <p className="py-3 text-center text-label text-muted-foreground">Working…</p> : null}
    </div>
  );
}

function MessageRow({
  message,
  onDecideApproval,
  streaming
}: {
  readonly message: ChatMessage;
  readonly streaming: boolean;
  readonly onDecideApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
}) {
  const mine = message.role === "user";
  return (
    <div className={cn("flex w-full py-1.5", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-2 rounded-lg px-3 py-2 text-body",
          mine ? "bg-card text-foreground" : "text-foreground"
        )}
      >
        {message.parts.map((part, index) => (
          <Part
            key={`${message.id}-${index}`}
            messageId={message.id}
            onDecideApproval={onDecideApproval}
            part={part}
            streaming={streaming}
          />
        ))}
      </div>
    </div>
  );
}

function Part({
  messageId,
  onDecideApproval,
  part,
  streaming
}: {
  readonly messageId: string;
  readonly streaming: boolean;
  readonly onDecideApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
  readonly part: ChatMessagePart;
}) {
  switch (part.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-pretty">{part.text}</p>;
    case "thinking":
      return <Reasoning running={streaming} text={part.text} />;
    case "tool":
      return (
        <ToolCall
          detail={part.detail}
          name={part.name}
          status={part.status}
          summary={part.summary}
        />
      );
    case "approval":
      return (
        <Confirmation
          description={part.description}
          onAllow={() => onDecideApproval(messageId, part.approvalRequestId, "allowed")}
          onDeny={() => onDecideApproval(messageId, part.approvalRequestId, "declined")}
          risk={part.risk}
          state={part.status}
          title={part.title}
        />
      );
    case "attachment":
      return <p className="text-label text-muted-foreground">{part.fileName}</p>;
    case "surface":
      return <p className="text-label text-muted-foreground">Generated surface</p>;
  }
}
