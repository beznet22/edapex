/**
 * ==========================================
 * Layer: SERVICE — ClassroomService (Domain 18)
 * ==========================================
 * Purpose:
 *   Session lifecycle management, memory buffer dehydration,
 *   SSE event generation, and Routine Engine integration.
 *
 * STRESS AWARENESS:
 *   - Atomic session checkout (same pattern as AI task checkout).
 *   - Memory buffer persistence on every yield (10ms CPU yield compliance).
 *   - Stateless SSE events — no in-memory session state.
 *
 * Spec Reference: AGENTIC_SCHOOL_V2_PLAN.md Sections 6.3, 11.6
 */

import { logger } from "../../utils/logger.js";
import type {
  IClassroomRepository,
  IClassroomSession,
  IClassroomMemoryLedger,
  IClassroomMemoryContent,
} from "../../domain/interfaces/classroom.interface.js";
import type { StatelessEvent } from "../../types/ai.types.js";

const log = logger.child({ layer: "service" });

export class ClassroomService {
  private repo: IClassroomRepository;

  constructor(repo: IClassroomRepository) {
    this.repo = repo;
  }

  // --- Session Lifecycle ---

  /**
   * ON_SESSION_START — atomic checkout with same guarantees as HMAS heartbeat.
   * Transitions session from "scheduled" to "active" in a single-trip UPDATE.
   */
  async startSession(tenantId: string, sessionId: string): Promise<IClassroomSession> {
    const sessionLog = log.child({ tenantId, sessionId });

    const session = await this.repo.checkoutSession(tenantId, sessionId);
    sessionLog.info("Classroom session started (atomic checkout)", { status: session.status });

    return session;
  }

  /**
   * CLASSROOM_TURN_COMPLETE — end the session, persisting final state.
   */
  async endSession(tenantId: string, sessionId: string): Promise<IClassroomSession> {
    const sessionLog = log.child({ tenantId, sessionId });

    const session = await this.repo.updateSession(tenantId, sessionId, { status: "completed" });
    sessionLog.info("Classroom session completed", { status: session.status });

    return session;
  }

  async pauseSession(tenantId: string, sessionId: string): Promise<IClassroomSession> {
    return this.repo.updateSession(tenantId, sessionId, { status: "paused" });
  }

  async getSession(tenantId: string, sessionId: string): Promise<IClassroomSession | null> {
    return this.repo.getSessionById(tenantId, sessionId);
  }

  // --- Memory Buffer Persistence ---

  /**
   * Dehydrate a StatelessEvent stream into classroomMemoryLedger entries.
   * Called on every LangGraph node yield before releasing the edge CPU slice.
   */
  async dehydrateMemoryBuffer(
    tenantId: string,
    sessionId: string,
    turnCount: number,
    events: StatelessEvent[],
  ): Promise<IClassroomMemoryLedger[]> {
    const entries: IClassroomMemoryLedger[] = [];

    for (const event of events) {
      // Map SSE event type to memory ledger role
      const role = event.type === "text" ? "assistant" as const : "director_node_log" as const;
      const parsedContent: IClassroomMemoryContent[] = [
        { type: event.type === "text" ? "text" : "action", content: event.data },
      ];

      const entry = await this.repo.appendMemoryEntry({
        tenantId,
        sessionId,
        turnCount,
        role,
        parsedContent,
      });

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Compact old memory entries to reduce ledger size.
   * Marks entries before `beforeTurn` as compacted.
   */
  async compactMemory(tenantId: string, sessionId: string, beforeTurn: number): Promise<number> {
    const count = await this.repo.compactMemory(tenantId, sessionId, beforeTurn);
    log.child({ tenantId, sessionId }).info("Memory compacted", { beforeTurn, compactedCount: count });
    return count;
  }

  // --- SSE Event Generation ---

  /**
   * Build a StatelessEvent for SSE streaming.
   * Ensures chunks are edge-safe (minimal allocation, JSON-serializable).
   */
  buildStatelessEvent(
    type: StatelessEvent["type"],
    data: unknown,
    sessionId: string,
    turnCount?: number,
  ): StatelessEvent {
    return {
      type,
      data,
      sessionId,
      turnCount,
      timestamp: Date.now(),
    };
  }
}
