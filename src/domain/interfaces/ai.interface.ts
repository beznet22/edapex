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
  tenantId: number;
  userId: number;
  title: string;
  model: string | null;
  visibility: ChatVisibility;
  metadata: IChatMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  parts: IMessagePart[];
  metadata: IMessageMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiVote {
  chatId: string;
  messageId: string;
  isUpvoted: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  content: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiSuggestion {
  id: string;
  documentId: string;
  content: string | null;
  createdAt: Date | null;
  documentCreatedAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiAgent {
  id: number;
  tenantId: number;
  name: string;
  agentType: string;
  capabilities: string[] | null;
  status: AgentStatus;
  config: Record<string, any> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiAgentAction {
  id: number;
  agentId: number;
  tenantId: number;
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
  id: number;
  actionId: number;
  toolName: string;
  parameters: Record<string, any> | null;
  result: Record<string, any> | null;
  latencyMs: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IAiRepository {
  // Chat
  getChatById(chatId: string): Promise<IAiChat | null>;
  getChatsByUser(tenantId: number, userId: number): Promise<IAiChat[]>;
  createChat(data: Partial<IAiChat>): Promise<IAiChat>;
  updateChat(chatId: string, data: Partial<IAiChat>): Promise<IAiChat>;
  
  // Messages
  getMessagesByChat(chatId: string): Promise<IAiMessage[]>;
  createMessage(data: Partial<IAiMessage>): Promise<IAiMessage>;
  
  // Voting
  upsertVote(chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote>;
  
  // Agents
  getAgentById(id: number): Promise<IAiAgent | null>;
  getAgentsByTenant(tenantId: number): Promise<IAiAgent[]>;
  
  // Actions
  createAction(data: Partial<IAiAgentAction>): Promise<IAiAgentAction>;
  updateAction(id: number, data: Partial<IAiAgentAction>): Promise<IAiAgentAction>;
  getActionByIdempotencyKey(tenantId: number, key: string): Promise<IAiAgentAction | null>;
  
  // Tool Invocations
  createToolInvocation(data: Partial<IAiToolInvocation>): Promise<IAiToolInvocation>;
}
