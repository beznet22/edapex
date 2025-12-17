import type { DBChat } from "$lib/server/db/schema";
import type { InferUITools, JSONValue, UIMessage, UIMessagePart } from "ai";
import type { StudentDetail } from "./result-types";
import type { tools } from "$lib/chat/tools";
import type { IconName } from "$lib/utils/icons";

export type Designation = "principal" | "teacher" | "examiner";

export interface Assistant {
  workflowId: string;
  designation: Designation;
  suggestions: readonly string[];
  highlight: string;
  systemPrompt?: string;
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
  url?: string;
  mediaType?: string;
  filename?: string;
  success: boolean;
  error?: string;
  studentData?: StudentDetail;
};

// Tool set type - using any to avoid circular dependency with tools function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type xToolUIPart = InferUITools<ReturnType<typeof tools>>;
export type xUIMessage = UIMessage<xMetadata, xDataPart, xToolUIPart>;
export type xUIMessagePart = UIMessagePart<xDataPart, xToolUIPart>;
export type xProviderMetadata = Record<string, Record<string, JSONValue>>;
export type ChatResponse = { chatId: string; messages: xUIMessage[]; agentId: string };
