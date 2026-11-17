import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { ChatMessage, QueuedMessage, WorkspaceRuntimeView } from "@edapex/contracts";
import { NativeAgentAdapter } from "@edapex/host/agent";

import { nativeTransport } from "@/lib/agent-transport";
import { installId } from "@/lib/push";

export interface ChatController {
  readonly messages: readonly ChatMessage[];
  readonly queue: readonly QueuedMessage[];
  readonly view: WorkspaceRuntimeView;
  readonly error: string;
  readonly send: (text: string) => void;
  readonly stop: () => void;
  readonly decideApproval: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
}

/**
 * One adapter per Shell, connected once.
 *
 * The workspace id is the install id: it namespaces the on-device journal, so two installs
 * on one account never write into each other's runs. The model is the host's choice, not
 * the model's — `mobileSafeTools` caps the tool surface on a phone.
 */
export function useChat(): ChatController {
  const adapter = useMemo(() => new NativeAgentAdapter(nativeTransport), []);
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void adapter
      .connect({ workspaceId: installId(), model: "default", mobileSafeTools: true })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The agent runtime could not start on this device."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const send = useCallback(
    (text: string) => {
      if (text.trim().length === 0) return;
      adapter.send(text, []);
    },
    [adapter]
  );

  return {
    messages: state.messages,
    queue: state.queue.queued,
    view: adapter.view,
    error,
    send,
    stop: () => adapter.stop(),
    decideApproval: (messageId, approvalRequestId, decision) =>
      adapter.decideApproval(messageId, approvalRequestId, decision)
  };
}
