export type ChatMessageRole = "user" | "assistant" | "system";

export type ToolCallStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "declined"
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

export interface ApprovalPart {
  readonly kind: "approval";
  readonly approvalRequestId: string;
  readonly status: "pending" | "allowed" | "declined";
  readonly title: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
}

export interface SurfacePart {
  readonly kind: "surface";
  readonly language: "openui";
  readonly catalogVersion: string;
  readonly source: string;
  readonly dataClass: "workspace" | "edapex-ephemeral";
}

export type ChatMessagePart =
  | TextPart
  | ThinkingPart
  | ToolCallPart
  | ApprovalPart
  | SurfacePart;

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatMessageRole;
  readonly createdAt: number;
  readonly parts: readonly ChatMessagePart[];
}

export type WorkspaceRunState =
  | "restoring"
  | "idle"
  | "thinking"
  | "tool_running"
  | "waiting_for_person"
  | "completed"
  | "stopped";

export interface WorkspaceRuntimeView {
  readonly state: WorkspaceRunState;
  readonly connected: boolean;
}
