/**
 * ==========================================
 * Layer: SERVICE — FinanceService
 * ==========================================
 * Purpose:
 *   Exposes the financial ledger and cost event pipeline.
 *   Idempotency-key deduplication on insert prevents double-posting during retry storms.
 *
 * STRESS AWARENESS:
 *   - Idempotency-key guard on every event insertion.
 *   - Integer cents for precision (no floating point).
 *   - Running balance maintained atomically.
 */

import { logger } from "../../utils/logger.js";
import type {
  IFinanceEvent,
  IFinanceEventRepository,
  FinanceEventCategory,
} from "../../domain/interfaces/finance.interface.js";

const log = logger.child({ layer: "service" });

export class FinanceService {
  private repo: IFinanceEventRepository;

  constructor(repo: IFinanceEventRepository) {
    this.repo = repo;
  }

  /**
   * Record a finance event with idempotency-key deduplication.
   * If an event with the same idempotencyKey already exists, return it without creating a duplicate.
   */
  async recordCostEvent(
    tenantId: string,
    data: Omit<Partial<IFinanceEvent>, "tenantId">,
  ): Promise<IFinanceEvent> {
    const runLog = log.child({ tenantId });

    // [STRESS DEFENSE] Idempotency guard — prevents duplicate events during retry storms
    if (data.idempotencyKey) {
      const existing = await this.repo.getFinanceEventByIdempotencyKey(tenantId, data.idempotencyKey);
      if (existing) {
        runLog.info("Duplicate finance event blocked by idempotency key", {
          idempotencyKey: data.idempotencyKey,
          existingId: existing.id,
        });
        return existing;
      }
    }

    // Calculate running balance
    const currentBalance = await this.repo.getBalanceByCurrency(tenantId, data.currency ?? "USD");
    const amount = data.amountCents ?? 0;
    const balanceAfterCents =
      data.type === "credit" ? currentBalance + amount : currentBalance - amount;

    const event = await this.repo.createFinanceEvent({
      ...data,
      tenantId,
      balanceAfterCents,
    });

    runLog.info("Finance event recorded", {
      eventId: event.id,
      type: event.type,
      category: event.category,
      amountCents: event.amountCents,
      balanceAfterCents: event.balanceAfterCents,
    });

    return event;
  }

  async getBalance(tenantId: string, currency: string = "USD"): Promise<number> {
    return this.repo.getBalanceByCurrency(tenantId, currency);
  }

  async listEvents(tenantId: string, category?: FinanceEventCategory): Promise<IFinanceEvent[]> {
    return this.repo.getFinanceEventsByTenant(tenantId, category);
  }
}
