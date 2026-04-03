import { db } from "../../../db/index.js";
import { 
  aiSessions, 
  aiMessages, 
  aiVotes, 
  aiAgents, 
  aiAgentActions, 
  aiToolInvocations,
  aiTasks,
  aiGoals,
  aiApprovals,
  aiCostEvents
} from "../../../db/mysql/domain-ai.js";
import { 
  IAiRepository, 
  IAiChat, 
  IAiMessage, 
  IAiVote, 
  IAiAgent, 
  IAiAgentAction, 
  IAiToolInvocation,
  IAiTask,
  IAiGoal,
  IAiApproval,
  IAiCostEvent
} from "../../interfaces/ai.interface.js";
import { eq, and, inArray, or, isNull } from "drizzle-orm";

export class MySqlAiRepository implements IAiRepository {
  private mapSession(row: IAiChat): IAiChat {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    } as any;
  }

  private mapTask(row: IAiTask): IAiTask {
    return {
      ...row,
      startedAt: row.startedAt ? new Date(row.startedAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapApproval(row: IAiApproval): IAiApproval {
    return {
      ...row,
      decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapGoal(row: IAiGoal): IAiGoal {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapMessage(row: IAiMessage): IAiMessage {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapAction(row: IAiAgentAction): IAiAgentAction {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Sessions (Replaces Chat) ---
  async getChatById(tenantId: string, chatId: string): Promise<IAiChat | null> {
    const [result] = await db.select().from(aiSessions).where(and(eq(aiSessions.id, chatId), eq(aiSessions.tenantId, tenantId)));
    return result ? this.mapSession(result) : null;
  }

  async getChatsByUser(tenantId: string, userId: string): Promise<IAiChat[]> {
    const results = await db
      .select()
      .from(aiSessions)
      .where(and(
        eq(aiSessions.tenantId, tenantId),
        eq(aiSessions.userId, userId)
      ));
    return results.map((row: IAiChat) => this.mapSession(row));
  }

  async createChat(data: Partial<IAiChat>): Promise<IAiChat> {
    await db.insert(aiSessions).values(data as any);
    const result = await this.getChatById(data.tenantId!, data.id!);
    if (!result) throw new Error("Failed to create session");
    return result;
  }

  async updateChat(tenantId: string, chatId: string, data: Partial<IAiChat>): Promise<IAiChat> {
    await db.update(aiSessions)
      .set(data as any)
      .where(and(eq(aiSessions.id, chatId), eq(aiSessions.tenantId, tenantId)));
    const result = await this.getChatById(tenantId, chatId);
    if (!result) throw new Error("Failed to update session");
    return result;
  }

  // --- Messages ---
  async getMessagesByChat(tenantId: string, chatId: string): Promise<IAiMessage[]> {
    const results = await db
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.sessionId, chatId), eq(aiMessages.tenantId, tenantId)));
    return results.map((row: IAiMessage) => this.mapMessage(row));
  }

  async createMessage(data: Partial<IAiMessage>): Promise<IAiMessage> {
    await db.insert(aiMessages).values(data as any);
    const [result] = await db.select().from(aiMessages).where(and(eq(aiMessages.id, data.id!), eq(aiMessages.tenantId, data.tenantId!)));
    if (!result) throw new Error("Failed to create message");
    return this.mapMessage(result);
  }

  // --- Voting ---
  async upsertVote(tenantId: string, chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote> {
    const voteValue = isUpvoted ? 1 : 0;
    await db.insert(aiVotes)
      .values({ tenantId, sessionId: chatId, messageId, isUpvoted: voteValue })
      .onDuplicateKeyUpdate({ set: { isUpvoted: voteValue } });
    
    const [result] = await db.select().from(aiVotes).where(and(
      eq(aiVotes.sessionId, chatId), 
      eq(aiVotes.messageId, messageId),
      eq(aiVotes.tenantId, tenantId)
    ));
    return {
      ...result,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    } as any;
  }

  // --- Agents ---
  async getAgentById(tenantId: string, id: string): Promise<IAiAgent | null> {
    const [result] = await db.select().from(aiAgents).where(and(eq(aiAgents.id, id), eq(aiAgents.tenantId, tenantId)));
    return result ? (result as any) : null;
  }

  async getAgentsByTenant(tenantId: string): Promise<IAiAgent[]> {
    const results = await db.select().from(aiAgents).where(eq(aiAgents.tenantId, tenantId));
    return results as any[];
  }

  // --- Actions ---
  async createAction(data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    await db.insert(aiAgentActions).values(data as any);
    const [newAction] = await db.select().from(aiAgentActions).where(and(eq(aiAgentActions.id, data.id!), eq(aiAgentActions.tenantId, data.tenantId!)));
    if (!newAction) throw new Error("Failed to create agent action");
    return this.mapAction(newAction);
  }

  async updateAction(tenantId: string, id: string, data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    await db.update(aiAgentActions)
      .set(data as any)
      .where(and(eq(aiAgentActions.id, id), eq(aiAgentActions.tenantId, tenantId)));
    const [updated] = await db.select().from(aiAgentActions).where(and(eq(aiAgentActions.id, id), eq(aiAgentActions.tenantId, tenantId)));
    if (!updated) throw new Error("Failed to update agent action");
    return this.mapAction(updated);
  }

  async getActionByIdempotencyKey(tenantId: string, key: string): Promise<IAiAgentAction | null> {
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
    await db.insert(aiToolInvocations).values(data as any);
    const [newTool] = await db.select().from(aiToolInvocations).where(and(eq(aiToolInvocations.id, data.id!), eq(aiToolInvocations.tenantId, data.tenantId!)));
    if (!newTool) throw new Error("Failed to create tool invocation");
    return {
      ...newTool,
      createdAt: newTool.createdAt ? new Date(newTool.createdAt) : null,
      updatedAt: newTool.updatedAt ? new Date(newTool.updatedAt) : null,
    } as IAiToolInvocation;
  }

  // --- Tasks (High-Fidelity) ---
  async getTaskById(tenantId: string, id: string): Promise<IAiTask | null> {
    const [result] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, id), eq(aiTasks.tenantId, tenantId)));
    return result ? this.mapTask(result) : null;
  }

  /**
   * Atomic Single-Trip Task Checkout
   * Mandated by Paperclip V1 Integration Plan for Edge Resilience
   * (MySQL version - non-returning, requires post-fetch)
   */
  async checkoutTask(tenantId: string, id: string, agentId: string): Promise<IAiTask> {
    await db
      .update(aiTasks)
      .set({ 
        status: 'in_progress', 
        assigneeAgentId: agentId, 
        startedAt: new Date() 
      })
      .where(and(
        eq(aiTasks.id, id),
        eq(aiTasks.tenantId, tenantId),
        inArray(aiTasks.status, ['todo', 'backlog', 'blocked']),
        or(isNull(aiTasks.assigneeAgentId), eq(aiTasks.assigneeAgentId, agentId))
      ));

    // Refetch to verify checkout success
    const result = await this.getTaskById(tenantId, id);
    if (!result || result.assigneeAgentId !== agentId || result.status !== 'in_progress') {
      throw new Error("Task already claimed or invalid state for checkout");
    }

    return result;
  }

  async updateTask(tenantId: string, id: string, data: Partial<IAiTask>): Promise<IAiTask> {
    await db
      .update(aiTasks)
      .set(data as any)
      .where(and(eq(aiTasks.id, id), eq(aiTasks.tenantId, tenantId)));
    const result = await this.getTaskById(tenantId, id);
    if (!result) throw new Error("Failed to update task");
    return result;
  }

  // --- Approvals & Governance ---
  async createApproval(data: Partial<IAiApproval>): Promise<IAiApproval> {
    await db.insert(aiApprovals).values(data as any);
    const [result] = await db.select().from(aiApprovals).where(and(eq(aiApprovals.id, data.id!), eq(aiApprovals.tenantId, data.tenantId!)));
    if (!result) throw new Error("Failed to create approval request");
    return this.mapApproval(result);
  }

  async getPendingApprovals(tenantId: string): Promise<IAiApproval[]> {
    const results = await db
      .select()
      .from(aiApprovals)
      .where(and(eq(aiApprovals.tenantId, tenantId), eq(aiApprovals.status, "pending")));
    return results.map((row: IAiApproval) => this.mapApproval(row));
  }

  // --- Goals & Costing ---
  async createGoal(data: Partial<IAiGoal>): Promise<IAiGoal> {
    await db.insert(aiGoals).values(data as any);
    const [result] = await db.select().from(aiGoals).where(and(eq(aiGoals.id, data.id!), eq(aiGoals.tenantId, data.tenantId!)));
    if (!result) throw new Error("Failed to create goal");
    return this.mapGoal(result);
  }

  async reportCost(data: IAiCostEvent): Promise<void> {
    await db.insert(aiCostEvents).values(data as any);
  }
}
