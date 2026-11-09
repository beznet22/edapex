import type {
  ChatMessage,
  QueuedMessage,
  WorkspaceRuntimeView
} from "@edapex/contracts";

/**
 * The only boundary the web and Tauri shells consume. The preview adapter is
 * disconnected; the future xcodex adapter maps local Rust events into this.
 */
export interface WorkspaceRuntimeAdapter {
  readonly view: WorkspaceRuntimeView;
  readonly messages: readonly ChatMessage[];
  readonly queue: readonly QueuedMessage[];
  send(text: string, attachmentNames: readonly string[]): void;
  stop(): void;
  decideApproval(
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ): void;
}
