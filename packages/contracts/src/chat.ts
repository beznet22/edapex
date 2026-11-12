export type ChatMessageRole = "user" | "assistant" | "system";

export type ToolCallStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "declined"
  | "refused"
  | "waiting_for_person";

export interface TextPart {
  readonly kind: "text";
  readonly text: string;
}

export interface ThinkingPart {
  readonly kind: "thinking";
  readonly text: string;
}

export interface ToolCallPart {
  readonly kind: "tool";
  readonly toolCallId: string;
  readonly name: string;
  readonly status: ToolCallStatus;
  readonly summary: string;
  readonly detail?: string;
}

export interface AttachmentPart {
  readonly kind: "attachment";
  readonly attachmentId: string;
  readonly fileName: string;
  readonly contentType: string;
}

export interface ApprovalPart {
  readonly kind: "approval";
  readonly approvalRequestId: string;
  readonly status: "pending" | "allowed" | "declined";
  readonly title: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
  readonly decisionSource?: "inline" | "inbox";
}

export interface SurfacePart {
  readonly kind: "surface";
  readonly language: "openui";
  readonly catalogVersion: string;
  readonly source: string;
  readonly dataClass: "workspace" | "edapex-ephemeral";
  readonly expiresAt?: number;
}

export type ChatMessagePart =
  | TextPart
  | ThinkingPart
  | ToolCallPart
  | ApprovalPart
  | SurfacePart
  | AttachmentPart;

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatMessageRole;
  readonly createdAt: number;
  readonly parts: readonly ChatMessagePart[];
  readonly queueState?: "queued" | "sending";
  readonly seenAt?: number | null;
}

export type WorkspaceRunState =
  | "restoring"
  | "history_unavailable"
  | "idle"
  | "thinking"
  | "following"
  | "tool_running"
  | "waiting_for_person"
  | "completed"
  | "stopped"
  | "error";

export interface QueuedMessage {
  readonly id: string;
  readonly text: string;
  readonly attachmentIds: readonly string[];
  readonly attachmentNames: readonly string[];
  readonly createdAt: number;
}

export interface WorkspaceTurnView {
  readonly state: WorkspaceRunState;
  readonly stoppable: boolean;
  readonly queueCount: number;
  readonly serverQueueCount: number;
  readonly lastSeenAt: number | null;
}

export interface WorkspaceRuntimeView {
  readonly state: WorkspaceRunState;
  readonly connected: boolean;
  readonly turn: WorkspaceTurnView;
}
