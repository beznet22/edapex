"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import type { ChatMessage, QueuedMessage, WorkspaceRuntimeView } from "@edapex/contracts";

import { NativeAgentAdapter } from "@/lib/agent-runtime";
import type { NativeAgentSettings } from "@/lib/native-agent";

export interface WorkspaceRuntimeController {
  readonly connected: boolean;
  readonly messages: readonly ChatMessage[];
  readonly queue: readonly QueuedMessage[];
  readonly view: WorkspaceRuntimeView;
  readonly send: (text: string, attachmentNames: readonly string[]) => void;
  readonly stop: () => void;
  readonly removeQueued: (id: string) => void;
  readonly decideApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
  readonly restoreComplete: () => void;
  readonly restoreUnavailable: () => void;
  readonly connectAgent: (settings: NativeAgentSettings) => Promise<void>;
  readonly connecting: boolean;
  readonly connectError: string;
}

export function useWorkspaceRuntime(): WorkspaceRuntimeController {
  const adapter = useMemo(() => new NativeAgentAdapter(), []);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const view = adapter.view;

  const connectAgent = useCallback(
    async (settings: NativeAgentSettings): Promise<void> => {
      setConnecting(true);
      setConnectError("");
      try {
        await adapter.connect(settings);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not load the agent runtime";
        setConnectError(message);
        throw cause;
      } finally {
        setConnecting(false);
      }
    },
    [adapter]
  );

  return {
    connected: view.connected,
    messages: state.messages,
    queue: state.queue.queued,
    view,
    send: (text, attachmentNames) => adapter.send(text, attachmentNames),
    stop: () => adapter.stop(),
    removeQueued: (id) => adapter.removeQueued(id),
    decideApproval: (messageId, approvalRequestId, decision) =>
      adapter.decideApproval(messageId, approvalRequestId, decision),
    restoreComplete: () => adapter.restoreComplete(),
    restoreUnavailable: () => adapter.restoreUnavailable(),
    connectAgent,
    connecting,
    connectError
  };
}
