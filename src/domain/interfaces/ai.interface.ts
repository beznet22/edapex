export type ChatVisibility = "private" | "public";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type AgentStatus = "active" | "inactive" | "maintenance";
export type ActionStatus = "pending" | "running" | "completed" | "failed";
export type DocumentKind = "text" | "code" | "image" | "sheet";

export interface IChatMetadata {
  summary?: string;
  tags?: string[];
  lastMessagePreview?: string;
}

export interface IMessageMetadata {
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName?: string;
  latencyMs?: number;
}

export interface IMessagePart {
  [key: string]: any;
}

export interface IAiChat {
  id: string; // Mastra threadId
  tenantId: string;
  userId: string;
  title: string;
  model: string | null;
  visibility: ChatVisibility;
  metadata: IChatMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiMessage {
  id: string;
  tenantId: string;
  chatId: string;
  role: MessageRole;
  parts: IMessagePart[];
  metadata: IMessageMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiVote {
  tenantId: string;
  chatId: string;
  messageId: string;
  isUpvoted: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiDocument {
  id: string;
  tenantId: string;
  title: string;
  kind: DocumentKind;
  content: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiSuggestion {
  id: string;
  tenantId: string;
  documentId: string;
  content: string | null;
  createdAt: Date | null;
  documentCreatedAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiAgent {
  id: string;
  tenantId: string;
  name: string;
  agentType: string;
  capabilities: string[] | null;
  status: AgentStatus;
  config: Record<string, any> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiAgentAction {
  id: string;
  agentId: string;
  tenantId: string;
  actionType: string;
  idempotencyKey: string | null;
  status: ActionStatus;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiToolInvocation {
  id: string;
  tenantId: string;
  actionId: string;
  toolName: string;
  parameters: Record<string, any> | null;
  result: Record<string, any> | null;
  latencyMs: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiRepository {
  // Chat
  getChatById(tenantId: string, chatId: string): Promise<IAiChat | null>;
  getChatsByUser(tenantId: string, userId: string): Promise<IAiChat[]>;
  createChat(data: Partial<IAiChat>): Promise<IAiChat>;
  updateChat(tenantId: string, chatId: string, data: Partial<IAiChat>): Promise<IAiChat>;
  
  // Messages
  getMessagesByChat(tenantId: string, chatId: string): Promise<IAiMessage[]>;
  createMessage(data: Partial<IAiMessage>): Promise<IAiMessage>;
  
  // Voting
  upsertVote(tenantId: string, chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote>;
  
  // Agents
  getAgentById(tenantId: string, id: string): Promise<IAiAgent | null>;
  getAgentsByTenant(tenantId: string): Promise<IAiAgent[]>;
  
  // Actions
  createAction(data: Partial<IAiAgentAction>): Promise<IAiAgentAction>;
  updateAction(tenantId: string, id: string, data: Partial<IAiAgentAction>): Promise<IAiAgentAction>;
  getActionByIdempotencyKey(tenantId: string, key: string): Promise<IAiAgentAction | null>;
  
  // Tool Invocations
  createToolInvocation(data: Partial<IAiToolInvocation>): Promise<IAiToolInvocation>;
}
