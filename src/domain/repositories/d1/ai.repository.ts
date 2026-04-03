import { db } from "../../../db/index.js";
import { 
  aiSessions, 
  aiMessages, 
  aiVotes, 
  aiAgents, 
  aiAgentActions, 
  aiToolInvocations,
  aiTasks,
  aiApprovals,
  aiGoals,
  aiCostEvents
} from "../../../db/d1/domain-ai.js";
import { 
  IAiRepository, 
  IAiChat, 
  IAiMessage, 
  IAiVote, 
  IAiAgent, 
  IAiAgentAction, 
  IAiToolInvocation,
  IAiTask,
  IAiApproval,
  IAiGoal,
  IAiCostEvent
} from "../../interfaces/ai.interface.js";
import { eq, and, inArray, or, isNull } from "drizzle-orm";

export class D1AiRepository implements IAiRepository {
  private mapSession(row: IAiChat): IAiChat {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    } as any; // Cast until interface is fully aligned with 'session' naming
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

  // --- Session ---
  async getChatById(tenantId: string, chatId: string): Promise<IAiChat | null> {
    const [result] = await db.select().from(aiSessions).where(and(eq(aiSessions.id, chatId), eq(aiSessions.tenantId, tenantId)));
    return result ? this.mapSession(result as any) : null;
  }

  async getChatsByUser(tenantId: string, userId: string): Promise<IAiChat[]> {
    const results = await db
      .select()
      .from(aiSessions)
      .where(and(
        eq(aiSessions.tenantId, tenantId),
        eq(aiSessions.userId, userId)
      ));
    return (results as any[]).map((row: IAiChat) => this.mapSession(row));
  }

  async createChat(data: Partial<IAiChat>): Promise<IAiChat> {
    const [result] = await db.insert(aiSessions).values(data as any).returning();
    if (!result) throw new Error("Failed to create session");
    return this.mapSession(result as any);
  }

  async updateChat(tenantId: string, chatId: string, data: Partial<IAiChat>): Promise<IAiChat> {
    const [result] = await db.update(aiSessions).set(data as any).where(and(eq(aiSessions.id, chatId), eq(aiSessions.tenantId, tenantId))).returning();
    if (!result) throw new Error("Failed to update session");
    return this.mapSession(result as any);
  }

  // --- Messages ---
  async getMessagesByChat(tenantId: string, chatId: string): Promise<IAiMessage[]> {
    const results = await db
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.chatId, chatId), eq(aiMessages.tenantId, tenantId)));
    return (results as any[]).map((row: IAiMessage) => this.mapMessage(row));
  }

  async createMessage(data: Partial<IAiMessage>): Promise<IAiMessage> {
    const [result] = await db.insert(aiMessages).values(data as any).returning();
    if (!result) throw new Error("Failed to create message");
    return this.mapMessage(result as any);
  }

  // --- Voting ---
  async upsertVote(tenantId: string, chatId: string, messageId: string, isUpvoted: boolean): Promise<IAiVote> {
    const voteValue = isUpvoted ? 1 : 0;
    const [result] = await db.insert(aiVotes)
      .values({ tenantId, chatId, messageId, isUpvoted: voteValue })
      .onConflictDoUpdate({ 
        target: [aiVotes.tenantId, aiVotes.chatId, aiVotes.messageId], 
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
    const [result] = await db.insert(aiAgentActions).values(data as any).returning();
    if (!result) throw new Error("Failed to create agent action");
    return this.mapAction(result as any);
  }

  async updateAction(tenantId: string, id: string, data: Partial<IAiAgentAction>): Promise<IAiAgentAction> {
    const [result] = await db.update(aiAgentActions).set(data as any).where(and(eq(aiAgentActions.id, id), eq(aiAgentActions.tenantId, tenantId))).returning();
    if (!result) throw new Error("Failed to update agent action");
    return this.mapAction(result as any);
  }

  async getActionByIdempotencyKey(tenantId: string, key: string): Promise<IAiAgentAction | null> {
    const [result] = await db
      .select()
      .from(aiAgentActions)
      .where(and(
        eq(aiAgentActions.tenantId, tenantId),
        eq(aiAgentActions.idempotencyKey, key)
      ));
    return result ? this.mapAction(result as any) : null;
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

  // --- Paperclip Orchestration ---
  async checkoutTask(tenantId: string, id: string, agentId: string): Promise<IAiTask> {
    const [result] = await db
      .update(aiTasks)
      .set({ 
        status: 'in_progress', 
        assigneeAgentId: agentId, 
        startedAt: new Date() 
      } as any)
      .where(and(
        eq(aiTasks.id, id),
        eq(aiTasks.tenantId, tenantId),
        inArray(aiTasks.status, ['todo', 'backlog', 'blocked']),
        or(isNull(aiTasks.assigneeAgentId), eq(aiTasks.assigneeAgentId, agentId))
      ))
      .returning();
    
    if (!result) throw new Error(`Task ${id} checkout failed`);
    return this.mapTask(result as any);
  }

  async getTasksByGoal(tenantId: string, goalId: string): Promise<IAiTask[]> {
    const results = await db.select().from(aiTasks).where(and(eq(aiTasks.tenantId, tenantId), eq(aiTasks.goalId, goalId)));
    return (results as any[]).map((row: IAiTask) => this.mapTask(row));
  }

  async getTaskById(tenantId: string, id: string): Promise<IAiTask | null> {
    const [result] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, id), eq(aiTasks.tenantId, tenantId)));
    return result ? this.mapTask(result as any) : null;
  }

  async updateTask(tenantId: string, id: string, data: Partial<IAiTask>): Promise<IAiTask> {
    const [result] = await db.update(aiTasks).set(data as any).where(and(eq(aiTasks.id, id), eq(aiTasks.tenantId, tenantId))).returning();
    if (!result) throw new Error("Failed to update task");
    return this.mapTask(result as any);
  }

  // --- Approvals & Governance ---
  async createApproval(data: Partial<IAiApproval>): Promise<IAiApproval> {
    const [result] = await db.insert(aiApprovals).values(data as any).returning();
    if (!result) throw new Error("Failed to create approval request");
    return this.mapApproval(result as any);
  }

  async getPendingApprovals(tenantId: string): Promise<IAiApproval[]> {
    const results = await db
      .select()
      .from(aiApprovals)
      .where(and(eq(aiApprovals.tenantId, tenantId), eq(aiApprovals.status, "pending")));
    return (results as any[]).map(row => this.mapApproval(row));
  }

  // --- Goals & Costing ---
  async createGoal(data: Partial<IAiGoal>): Promise<IAiGoal> {
    const [result] = await db.insert(aiGoals).values(data as any).returning();
    if (!result) throw new Error("Failed to create goal");
    return this.mapGoal(result as any);
  }

  async reportCost(data: IAiCostEvent): Promise<void> {
    await db.insert(aiCostEvents).values(data as any);
  }
}
