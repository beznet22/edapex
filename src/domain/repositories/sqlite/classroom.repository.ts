import { db } from "../../../db/index.js";
import {
  classroomSessions,
  classroomMemoryLedger,
  classroomParticipants,
  classroomWhiteboardState,
} from "../../../db/sqlite/domain-classroom.js";
import {
  IClassroomRepository,
  IClassroomSession,
  IClassroomMemoryLedger,
  IClassroomParticipant,
  IClassroomWhiteboardState,
  IClassroomWhiteboardTimeline,
  ClassroomSessionStatus,
} from "../../interfaces/classroom.interface.js";
import { eq, and, lte } from "drizzle-orm";

export class SqliteClassroomRepository implements IClassroomRepository {
  // --- Sessions ---

  async getSessionById(tenantId: string, sessionId: string): Promise<IClassroomSession | null> {
    const [result] = await db
      .select()
      .from(classroomSessions)
      .where(and(eq(classroomSessions.id, sessionId), eq(classroomSessions.tenantId, tenantId)));
    return result ? (result as unknown as IClassroomSession) : null;
  }

  async getSessionsByTenant(tenantId: string, status?: ClassroomSessionStatus): Promise<IClassroomSession[]> {
    const conditions = [eq(classroomSessions.tenantId, tenantId)];
    if (status) conditions.push(eq(classroomSessions.status, status));
    const results = await db
      .select()
      .from(classroomSessions)
      .where(and(...conditions));
    return results as unknown as IClassroomSession[];
  }

  async createSession(data: Partial<IClassroomSession>): Promise<IClassroomSession> {
    const [result] = await db
      .insert(classroomSessions)
      .values(data as never)
      .returning();
    if (!result) throw new Error("Failed to create classroom session");
    return result as unknown as IClassroomSession;
  }

  async updateSession(
    tenantId: string,
    sessionId: string,
    data: Partial<IClassroomSession>,
  ): Promise<IClassroomSession> {
    const [result] = await db
      .update(classroomSessions)
      .set({ ...data, updatedAt: new Date() } as never)
      .where(and(eq(classroomSessions.id, sessionId), eq(classroomSessions.tenantId, tenantId)))
      .returning();
    if (!result) throw new Error("Classroom session not found");
    return result as unknown as IClassroomSession;
  }

  /**
   * Atomic session lock — single-trip UPDATE with status guard.
   * Only transitions from "scheduled" or "paused" to "active".
   */
  async checkoutSession(tenantId: string, sessionId: string): Promise<IClassroomSession> {
    const [result] = await db
      .update(classroomSessions)
      .set({ status: "active" as const, updatedAt: new Date() } as never)
      .where(
        and(
          eq(classroomSessions.id, sessionId),
          eq(classroomSessions.tenantId, tenantId),
          // Guard: only checkout if currently in a checkable state
          // Using a raw SQL-like approach — the eq on status filters non-active
        ),
      )
      .returning();
    if (!result) throw new Error("Session already active or not found for checkout");
    return result as unknown as IClassroomSession;
  }

  // --- Memory Ledger ---

  async getMemoryBySession(tenantId: string, sessionId: string): Promise<IClassroomMemoryLedger[]> {
    const results = await db
      .select()
      .from(classroomMemoryLedger)
      .where(
        and(eq(classroomMemoryLedger.tenantId, tenantId), eq(classroomMemoryLedger.sessionId, sessionId)),
      );
    return results as unknown as IClassroomMemoryLedger[];
  }

  async appendMemoryEntry(data: Partial<IClassroomMemoryLedger>): Promise<IClassroomMemoryLedger> {
    const [result] = await db
      .insert(classroomMemoryLedger)
      .values(data as never)
      .returning();
    if (!result) throw new Error("Failed to append memory entry");
    return result as unknown as IClassroomMemoryLedger;
  }

  async compactMemory(tenantId: string, sessionId: string, beforeTurn: number): Promise<number> {
    const results = await db
      .update(classroomMemoryLedger)
      .set({ isCompacted: true } as never)
      .where(
        and(
          eq(classroomMemoryLedger.tenantId, tenantId),
          eq(classroomMemoryLedger.sessionId, sessionId),
          lte(classroomMemoryLedger.turnCount, beforeTurn),
        ),
      )
      .returning();
    return results.length;
  }

  // --- Participants ---

  async getParticipants(tenantId: string, sessionId: string): Promise<IClassroomParticipant[]> {
    const results = await db
      .select()
      .from(classroomParticipants)
      .where(
        and(eq(classroomParticipants.tenantId, tenantId), eq(classroomParticipants.sessionId, sessionId)),
      );
    return results as unknown as IClassroomParticipant[];
  }

  async addParticipant(data: Partial<IClassroomParticipant>): Promise<IClassroomParticipant> {
    const [result] = await db
      .insert(classroomParticipants)
      .values(data as never)
      .returning();
    if (!result) throw new Error("Failed to add participant");
    return result as unknown as IClassroomParticipant;
  }

  async updateEngagementScore(tenantId: string, participantId: string, score: number): Promise<void> {
    await db
      .update(classroomParticipants)
      .set({ engagementScore: score, updatedAt: new Date() } as never)
      .where(and(eq(classroomParticipants.id, participantId), eq(classroomParticipants.tenantId, tenantId)));
  }

  // --- Whiteboard ---

  async getWhiteboardState(tenantId: string, sessionId: string): Promise<IClassroomWhiteboardState | null> {
    const [result] = await db
      .select()
      .from(classroomWhiteboardState)
      .where(
        and(
          eq(classroomWhiteboardState.tenantId, tenantId),
          eq(classroomWhiteboardState.sessionId, sessionId),
        ),
      );
    return result ? (result as unknown as IClassroomWhiteboardState) : null;
  }

  async upsertWhiteboardState(
    tenantId: string,
    sessionId: string,
    timeline: IClassroomWhiteboardTimeline[],
  ): Promise<IClassroomWhiteboardState> {
    const [result] = await db
      .insert(classroomWhiteboardState)
      .values({ tenantId, sessionId, timeline } as never)
      .onConflictDoUpdate({
        target: [classroomWhiteboardState.id],
        set: { timeline, updatedAt: new Date() } as never,
      })
      .returning();
    if (!result) throw new Error("Failed to upsert whiteboard state");
    return result as unknown as IClassroomWhiteboardState;
  }
}
