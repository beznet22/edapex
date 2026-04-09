/**
 * ==========================================
 * Layer: SERVICE — AIService
 * ==========================================
 * Purpose:
 *   AI persistence layer — sessions, messages, cost event delegation.
 *   Token stats aggregation and session lifecycle management.
 *
 * STRESS AWARENESS:
 *   - Delegates cost recording to FinanceService for idempotency.
 *   - All reads enforce tenant_id isolation.
 */

import { logger } from "../../utils/logger.js";
import type {
  IAiRepository,
  IAiChat,
  IAiMessage,
  IAiTask,
  IAiCostEvent,
  ITokenStats,
} from "../../domain/interfaces/ai.interface.js";
import type { FinanceService } from "../finance/finance.service.js";

const log = logger.child({ layer: "service" });

export class AIService {
  private repo: IAiRepository;
  private financeService: FinanceService;

  constructor(repo: IAiRepository, financeService: FinanceService) {
    this.repo = repo;
    this.financeService = financeService;
  }

  // --- Sessions (High-Fidelity) ---

  async getSession(tenantId: string, sessionId: string): Promise<IAiChat | null> {
    return this.repo.getChatById(tenantId, sessionId);
  }

  async createSession(data: Partial<IAiChat>): Promise<IAiChat> {
    return this.repo.createChat(data);
  }

  async updateSession(tenantId: string, sessionId: string, data: Partial<IAiChat>): Promise<IAiChat> {
    return this.repo.updateChat(tenantId, sessionId, data);
  }

  async updateTokenStats(tenantId: string, sessionId: string, stats: ITokenStats): Promise<IAiChat> {
    const session = await this.repo.getChatById(tenantId, sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found for tenant ${tenantId}`);

    // Merge token stats
    const existing = session.tokenStats ?? {};
    const merged: ITokenStats = {
      promptTokens: (existing.promptTokens ?? 0) + (stats.promptTokens ?? 0),
      completionTokens: (existing.completionTokens ?? 0) + (stats.completionTokens ?? 0),
      totalTokens: (existing.totalTokens ?? 0) + (stats.totalTokens ?? 0),
      cachedTokens: (existing.cachedTokens ?? 0) + (stats.cachedTokens ?? 0),
      costCents: (existing.costCents ?? 0) + (stats.costCents ?? 0),
    };

    return this.repo.updateChat(tenantId, sessionId, { tokenStats: merged } as Partial<IAiChat>);
  }

  // --- Messages (High-Fidelity) ---

  async getMessages(tenantId: string, sessionId: string): Promise<IAiMessage[]> {
    return this.repo.getMessagesByChat(tenantId, sessionId);
  }

  async addMessage(data: Partial<IAiMessage>): Promise<IAiMessage> {
    return this.repo.createMessage(data);
  }

  // --- Tasks ---

  async getTask(tenantId: string, taskId: string): Promise<IAiTask | null> {
    return this.repo.getTaskById(tenantId, taskId);
  }

  async updateTask(tenantId: string, taskId: string, data: Partial<IAiTask>): Promise<IAiTask> {
    return this.repo.updateTask(tenantId, taskId, data);
  }

  // --- Cost Event Delegation ---

  /**
   * Report an AI cost event — recorded in both the AI cost_events table
   * and the finance_events ledger for double-entry audit.
   */
  async reportCost(costEvent: IAiCostEvent): Promise<void> {
    const costLog = log.child({ tenantId: costEvent.tenantId, agentId: costEvent.agentId });

    // Record in AI cost_events table
    await this.repo.reportCost(costEvent);

    // Delegate to FinanceService for ledger entry
    await this.financeService.recordCostEvent(costEvent.tenantId, {
      type: "debit",
      category: "ai_cost",
      amountCents: costEvent.costCents,
      currency: "USD",
      description: `AI cost: ${costEvent.provider}/${costEvent.model} (${costEvent.inputTokens}+${costEvent.outputTokens} tokens)`,
      referenceType: "ai_cost_event",
      referenceId: costEvent.id,
      idempotencyKey: `ai_cost:${costEvent.id}`,
      metadata: {
        agentId: costEvent.agentId,
        provider: costEvent.provider,
        model: costEvent.model,
      },
    });

    costLog.info("AI cost event reported", {
      costCents: costEvent.costCents,
      provider: costEvent.provider,
      model: costEvent.model,
    });
  }

  // --- Agent Orchestration ---

  /**
   * High-level bridge to create an agent via the Orchestrator,
   * injecting this service instance for tool capabilities (e.g. handoff).
   */
  async createAgent(options: { domain: string; role: string; tenantId?: string }, env: Record<string, string | undefined>) {
    const { AiOrchestrator } = await import("./orchestrator.js");
    
    return AiOrchestrator.createAgent({
      domain: options.domain,
      role: options.role,
      tenantId: options.tenantId || "GLOBAL",
      aiService: this,
    }, env);
  }
}
