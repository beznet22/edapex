import { db } from "../../../db/index.js";
import { 
  aiChats, 
  aiMessages, 
  aiVotes, 
  aiAgents, 
  aiAgentActions, 
  aiToolInvocations 
} from "../../../db/mysql/domain-ai.js";
import { 
  IAiRepository, 
  IAiChat, 
  IAiMessage, 
  IAiVote, 
  IAiAgent, 
  IAiAgentAction, 
  IAiToolInvocation 
} from "../../interfaces/ai.interface.js";
import { eq, and, sql } from "drizzle-orm";

export class MySqlAiRepository implements IAiRepository {
  private mapChat(row: any): IAiChat {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapMessage(row: any): IAiMessage {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapAction(row: any): IAiAgentAction {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Chat ---
  async getChatById(chatId: string): Promise<IAiChat | null> {
    const [result] = await db.select().from(aiChats).where(eq(aiChats.id, chatId));
    return result ? this.mapChat(result) : null;
  }

  async getChatsByUser(tenantId: number, userId: number): Promise<IAiChat[]> {
    const results = await db
      .select()
      .from(aiChats)
      .where(and(
        eq(aiChats.tenantId, tenantId),
        eq(aiChats.userId, userId)
      ));
    return results.map((row: any) => this.mapChat(row));
  }

  async createChat(data: Partial<IAiChat>): Promise<IAiChat> {
    await db.insert(aiChats).values(data as any);
    const result = await this.getChatById(data.id!);
    if (!result) throw new Error("Failed to create chat");
    return result;
  }

  async updateChat(chatId: string, data: Partial<IAiChat>): Promise<IAiChat> {
    await db.update(aiChats).set(data as any).where(eq(aiChats.id, chatId));
    const result = await this.getChatById(chatId);
    if (!result) throw new Error("Failed to update chat");
    return result;
  }

  // --- Messages ---
  async getMessagesByChat(chatId: string): Promise<IAiMessage[]> {
    const results = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.chatId, chatId));
    return results.map((row: any) => this.mapMessage(row));
  }

  async createMessage(data: Partial<IAiMessage>): Promise<IAiMessage> {
    await db.insert(aiMessages).values(data as any);
    const [result] = await db.select().from(aiMessages).where(eq(aiMessages.id, data.id!));
    if (!result) throw new Error("Failed to create message");
    return this.mapMessage(result);
  }

  // --- Voting ---
  async upsertVote(chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote> {
    const voteValue = isUpvoted ? 1 : 0;
    await db.insert(aiVotes)
      .values({ chatId, messageId, isUpvoted: voteValue })
      .onDuplicateKeyUpdate({ set: { isUpvoted: voteValue } });
    
    const [result] = await db.select().from(aiVotes).where(and(eq(aiVotes.chatId, chatId), eq(aiVotes.messageId, messageId)));
    return {
      ...result,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    } as IAiVote;
  }

  // --- Agents ---
  async getAgentById(id: number): Promise<IAiAgent | null> {
    const [result] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    return result ? (result as any) : null;
  }

  async getAgentsByTenant(tenantId: number): Promise<IAiAgent[]> {
    const results = await db.select().from(aiAgents).where(eq(aiAgents.tenantId, tenantId));
    return results as any[];
  }

  // --- Actions ---
  async createAction(data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    const [result] = await db.insert(aiAgentActions).values(data as any);
    const [newAction] = await db.select().from(aiAgentActions).where(eq(aiAgentActions.id, result.insertId));
    if (!newAction) throw new Error("Failed to create agent action");
    return this.mapAction(newAction);
  }

  async updateAction(id: number, data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    await db.update(aiAgentActions).set(data as any).where(eq(aiAgentActions.id, id));
    const [updated] = await db.select().from(aiAgentActions).where(eq(aiAgentActions.id, id));
    if (!updated) throw new Error("Failed to update agent action");
    return this.mapAction(updated);
  }

  async getActionByIdempotencyKey(tenantId: number, key: string): Promise<IAiAgentAction | null> {
    const [result] = await db
      .select()
      .from(aiAgentActions)
      .where(and(
        eq(aiAgentActions.tenantId, tenantId),
        eq(aiAgentActions.idempotencyKey, key)
      ));
    return result ? this.mapAction(result) : null;
  }

  // --- Tool Invocations ---
  async createToolInvocation(data: Partial<IAiToolInvocation>): Promise<IAiToolInvocation> {
    const [result] = await db.insert(aiToolInvocations).values(data as any);
    const [newTool] = await db.select().from(aiToolInvocations).where(eq(aiToolInvocations.id, result.insertId));
    if (!newTool) throw new Error("Failed to create tool invocation");
    return {
      ...newTool,
      createdAt: newTool.createdAt ? new Date(newTool.createdAt) : null,
      updatedAt: newTool.updatedAt ? new Date(newTool.updatedAt) : null,
    } as IAiToolInvocation;
  }
}
