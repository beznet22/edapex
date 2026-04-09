/**
 * ==========================================
 * Layer: SYSTEM EVENTS (EDA)
 * Protocol: @backend-architect
 * ==========================================
 * Purpose:
 *   Lightweight, edge-safe event bus for cross-domain communication.
 *   Optimized for Cloudflare Workers (stateless, sub-ms overhead).
 */

import { logger } from "../utils/logger.js";

const log = logger.child({ layer: "events" });

export type DomainEvent = 
  | 'ACADEMIC_ENROLLMENT'
  | 'FINANCE_DEBIT'
  | 'HR_LEAVE_REQUESTED'
  | 'AI_TASK_HANDOFF'
  | 'CLASSROOM_SESSION_START';

export interface EventPayload<T = any> {
  tenantId: string;
  timestamp: number;
  data: T;
}

type Handler<T = any> = (payload: EventPayload<T>) => void | Promise<void>;

class EventBus {
  private handlers: Map<DomainEvent, Handler[]> = new Map();

  /**
   * Subscribe to a domain event.
   */
  subscribe<T>(event: DomainEvent, handler: Handler<T>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    log.debug(`Subscribed to event: ${event}`);
  }

  /**
   * Emit a domain event with a payload.
   */
  async emit<T>(event: DomainEvent, tenantId: string, data: T): Promise<void> {
    const payload: EventPayload<T> = {
      tenantId,
      timestamp: Date.now(),
      data,
    };

    const handlers = this.handlers.get(event) || [];
    
    log.info(`Emitting event: ${event}`, { tenantId, handlerCount: handlers.length });

    // Execute handlers in parallel, but handle errors gracefully
    const promises = handlers.map(async (handler) => {
      try {
        await handler(payload);
      } catch (err) {
        log.error(`Error in event handler for ${event}`, {
          error: err instanceof Error ? err.message : String(err),
          tenantId,
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Unsubscribe from an event.
   */
  unsubscribe(event: DomainEvent, handler: Handler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      this.handlers.set(event, handlers.filter(h => h !== handler));
    }
  }
}

// Export singleton instance
export const eventBus = new EventBus();
