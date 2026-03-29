import { db } from "../../../db/index.js";
import { 
  aiChats, 
  aiMessages, 
  aiVotes, 
  aiAgents, 
  aiAgentActions, 
  aiToolInvocations 
} from "../../../db/postgres/domain-ai.js";
import { 
  IAiRepository, 
  IAiChat, 
  IAiMessage, 
  IAiVote, 
  IAiAgent, 
  IAiAgentAction, 
  IAiToolInvocation 
} from "../../interfaces/ai.interface.js";
import { eq, and } from "drizzle-orm";

export class PostgresAiRepository implements IAiRepository {
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
    const [result] = await db.insert(aiChats).values(data as any).returning();
    if (!result) throw new Error("Failed to create chat");
    return this.mapChat(result);
  }

  async updateChat(chatId: string, data: Partial<IAiChat>): Promise<IAiChat> {
    const [result] = await db.update(aiChats).set(data as any).where(eq(aiChats.id, chatId)).returning();
    if (!result) throw new Error("Failed to update chat");
    return this.mapChat(result);
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
    const [result] = await db.insert(aiMessages).values(data as any).returning();
    if (!result) throw new Error("Failed to create message");
    return this.mapMessage(result);
  }

  // --- Voting ---
  async upsertVote(chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote> {
    const voteValue = isUpvoted ? 1 : 0;
    const [result] = await db.insert(aiVotes)
      .values({ chatId, messageId, isUpvoted: voteValue })
      .onConflictDoUpdate({ 
        target: [aiVotes.chatId, aiVotes.messageId], 
        set: { isUpvoted: voteValue } 
      })
      .returning();
    
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
    const [result] = await db.insert(aiAgentActions).values(data as any).returning();
    if (!result) throw new Error("Failed to create agent action");
    return this.mapAction(result);
  }

  async updateAction(id: number, data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    const [result] = await db.update(aiAgentActions).set(data as any).where(eq(aiAgentActions.id, id)).returning();
    if (!result) throw new Error("Failed to update agent action");
    return this.mapAction(result);
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
    const [result] = await db.insert(aiToolInvocations).values(data as any).returning();
    if (!result) throw new Error("Failed to create tool invocation");
    return {
      ...result,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    } as IAiToolInvocation;
  }
}
