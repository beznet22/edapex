export type ChatVisibility = "PUBLIC" | "PRIVATE" | "SHARED"
export interface ChatThread {
  threadId: string;
  resourceId: string;
  title: string;
  model?: string;
  userId: number;
  visibility: ChatVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: string;
  parts: any;
  metadata?: any;
  createdAt: Date;
}

import type { InferUITools, JSONValue, UIMessage, UIMessagePart } from "ai";
import type { IconName } from "$lib/utils/icons";
import type { Designation } from "./sms-types";


export interface Assistant {
  workflowId: string;
  designation: Designation[];
  suggestions: readonly string[];
  highlight: string;
  instructions?: string;
  tools?: any;
  maxSteps?: number;
}

export interface TaskData {
  taskId: string;
  status: "queued" | "processing" | "done" | "error";
  data?: any;
  error?: string;
}

export interface AgentWorkflow {
  id: string;
  label: string;
  iconName: IconName;
  assistants: readonly Assistant[];
}

export type CreateDocumentPart = {
  status: "processing" | "streaming" | "success" | "error";
  content: string | undefined;
  title: string | undefined;
};

export type GeneratePDFPart = {
  status: "processing" | "streaming" | "success" | "error";
  data: string | undefined;
  title: string | undefined;
};

export type Notification = {
  message: string;
  level: "info" | "warning" | "error";
};

export type xDataPart = {
	createDocument: CreateDocumentPart;
	generatePDF: GeneratePDFPart;
	notification: Notification;
	threadCreated: ChatThread;
	threadTitle: {
		title: string;
	};
	rateLimit: {
		providerId: string;
		retryAfterSeconds: number;
		resetAt: string;
		attempt: number;
		maxAttempts: number;
	};
};

export type StreamDataPart = {
  [K in keyof xDataPart]: {
    type: `data-${K}`;
    data: xDataPart[K];
  }
}[keyof xDataPart] | { type: string; data: any };

export type xMetadata = {
  documentId: string;
  createdAt: string;
  threadId: string;
};

export type UploadedData = {
  id: string;
  filename: string;
  originalName?: string;
  token?: string;
  url?: string;
  type?: string;
  size?: number;
  createdAt?: Date | string;
  success: boolean;
  status: AssessmentStatus;
  error?: string;
  data?: any;
};

export type AssessmentStatus = "uploading" | "retrying" | "error" | "uploaded" | "extracted" | "approved" | "published";

export function getAssessmentStatusDescription(status?: AssessmentStatus | string, errorMessage?: string): string {
  if (status === "error" && errorMessage) return errorMessage;
  switch (status) {
    case "uploading": return "Image is currently being uploaded.";
    case "retrying": return "Retry attempt is in progress.";
    case "uploaded": return "Image uploaded and waiting for AI extraction.";
    case "extracted": return "Data extracted successfully, pending teacher approval.";
    case "approved": return "Data verified and saved, ready to publish.";
    case "published": return "Results have been published and emailed to parents.";
    case "error": return errorMessage || "An error occurred during processing.";
    default: return status || "Unknown status";
  }
}
// Combine all possible tools for type inference in the UI
export type xToolUIPart = any;
export type xUIMessage = UIMessage<xMetadata, xDataPart, xToolUIPart>;
export type xUIMessagePart = UIMessagePart<xDataPart, xToolUIPart>;
export type xProviderMetadata = Record<string, Record<string, JSONValue>>;
export type ChatResponse = { chatId: string; messages: xUIMessage[]; agentId: string };
