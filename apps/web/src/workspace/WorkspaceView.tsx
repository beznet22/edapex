import { useEffect, useRef } from "react";
import { FolderClosed, ListChecks, MessageCircle, Settings2, WandSparkles } from "lucide-react";

import type {
  CapabilityManifest,
  ChatMessage,
  WorkspaceRunState,
  WorkspaceRuntimeView
} from "@edapex/contracts";

import { MessageBubble } from "./WorkspaceMessages";
import { WorkspaceComposer } from "./WorkspaceComposer";
import { WorkspaceStatus } from "./WorkspaceChrome";

interface WorkspaceViewProps {
  readonly runtime: WorkspaceRuntimeView;
  readonly manifest: CapabilityManifest;
  readonly messages: readonly ChatMessage[];
  readonly userName: string;
  readonly onApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
  readonly onSend: (text: string, attachmentNames: readonly string[]) => void;
  readonly onOpenAdmin: () => void;
}

const NAV_ITEMS = [
  { id: "chat", label: "Chat", icon: MessageCircle, active: true },
  { id: "tasks", label: "Tasks", icon: ListChecks, active: false },
  { id: "make", label: "Make", icon: WandSparkles, active: false },
  { id: "files", label: "Files", icon: FolderClosed, active: false }
] as const;

const stateLabel = (state: WorkspaceRunState, connected: boolean): string => {
  if (!connected) return "Preview";
  switch (state) {
    case "restoring":
      return "Restoring";
    case "history_unavailable":
      return "History unavailable";
    case "thinking":
      return "Thinking";
    case "following":
      return "Following";
    case "tool_running":
      return "Working";
    case "waiting_for_person":
      return "Waiting for you";
    case "completed":
      return "Complete";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    case "idle":
      return "Live";
  }
};

export function WorkspaceView({
  runtime,
  manifest,
  messages,
  userName,
  onApproval,
  onSend,
  onOpenAdmin
}: WorkspaceViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full max-w-[430px] flex-col overflow-hidden border-x border-border bg-background">
        <header className="shrink-0 border-b border-border px-3 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                E
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight">EdApex Work</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {userName} · {manifest.role}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <WorkspaceStatus
                connected={runtime.connected}
                label={stateLabel(runtime.state, runtime.connected)}
              />
              {manifest.role === "admin" ? (
                <button
                  aria-label="Open admin claim links"
                  className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onOpenAdmin}
                  type="button"
                >
                  <Settings2 aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <main
          aria-label="Chat transcript"
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5"
          role="log"
        >
          <div className="mx-auto flex max-w-[672px] flex-col gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onApproval={onApproval} />
            ))}
            <div ref={endRef} />
          </div>
        </main>

        <WorkspaceComposer
          connected={runtime.connected}
          disabled={!runtime.connected}
          onSend={onSend}
        />

        <nav
          aria-label="Workspace sections"
          className="shrink-0 border-t border-border bg-card/60 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
        >
          <div className="mx-auto grid max-w-[430px] grid-cols-4">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-current={item.active ? "page" : undefined}
                  aria-disabled={!item.active}
                  className={
                    item.active
                      ? "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-primary"
                      : "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-muted-foreground/50"
                  }
                  disabled={!item.active}
                  key={item.id}
                  title={item.active ? item.label : `${item.label} arrives in 10B`}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
