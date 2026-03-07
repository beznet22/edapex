import type { DBChat } from "$lib/server/db/schema";
import type { InferUITools, JSONValue, UIMessage, UIMessagePart } from "ai";
import type { coordinatorTools, teacherTools } from "$lib/chat/tools";
import type { IconName } from "$lib/utils/icons";
import type { Designation } from "./sms-types";


export interface Assistant {
  workflowId: string;
  designation: Designation[];
  suggestions: readonly string[];
  highlight: string;
  instructions?: string;
  tools?: typeof teacherTools | typeof coordinatorTools;
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
  chat: DBChat | null;
};

export type xMetadata = {
  documentId: string;
  createdAt: string;
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
export type xToolUIPart = InferUITools<typeof teacherTools & typeof coordinatorTools>;
export type xUIMessage = UIMessage<xMetadata, xDataPart, xToolUIPart>;
export type xUIMessagePart = UIMessagePart<xDataPart, xToolUIPart>;
export type xProviderMetadata = Record<string, Record<string, JSONValue>>;
export type ChatResponse = { chatId: string; messages: xUIMessage[]; agentId: string };
