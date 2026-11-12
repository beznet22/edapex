"use client";

import { useEffect, useState } from "react";
import { FolderClosed } from "lucide-react";

import type {
  CapabilityManifest,
  ChatMessage,
  QueuedMessage,
  WorkspaceRuntimeView
} from "@edapex/contracts";

import { ChatTranscript } from "@/components/openduet/chat-transcript";
import { Composer } from "@/components/openduet/composer";

interface ChatSurfaceProps {
  readonly manifest: CapabilityManifest;
  readonly messages: readonly ChatMessage[];
  readonly queue: readonly QueuedMessage[];
  readonly runtime: WorkspaceRuntimeView;
  readonly compact?: boolean;
  readonly onSend: (text: string, attachmentNames: readonly string[]) => void;
  readonly onStop: () => void;
  readonly onRemoveQueued: (id: string) => void;
  readonly onApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = (): void => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return desktop;
}

export function ChatSurface({
  manifest,
  messages,
  queue,
  runtime,
  compact = false,
  onSend,
  onStop,
  onRemoveQueued,
  onApproval
}: ChatSurfaceProps) {
  const desktop = useIsDesktop();
  const empty = messages.length === 0 && queue.length === 0 && runtime.state === "idle";

  if (empty && desktop && !compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[760px]">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <FolderClosed aria-hidden="true" className="size-3.5" />
            <span className="font-medium text-foreground">Workspace</span>
            <span>/</span>
            <span>{manifest.role}</span>
          </div>
          <Composer
            connected={runtime.connected}
            onRemoveQueued={onRemoveQueued}
            onSend={onSend}
            onStop={onStop}
            queue={queue}
            stoppable={runtime.turn.stoppable}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col">
      <ChatTranscript
        manifest={manifest}
        messages={messages}
        onApproval={onApproval}
        queue={queue}
        runtime={runtime}
      />
      <Composer
        connected={runtime.connected}
        onRemoveQueued={onRemoveQueued}
        onSend={onSend}
        onStop={onStop}
        queue={queue}
        stoppable={runtime.turn.stoppable}
      />
    </div>
  );
}
