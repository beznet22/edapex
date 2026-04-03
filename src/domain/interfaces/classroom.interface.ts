/**
 * Classroom Domain Interfaces (Domain 18)
 *
 * Aligned with docs/domains/classroom.md
 * Encapsulates OpenMAIC-powered Agentic Classroom state.
 */

export type ClassroomSessionStatus = "scheduled" | "active" | "paused" | "completed";
export type ClassroomMemoryRole = "user" | "assistant" | "director_node_log";
export type ClassroomParticipantRole = "student" | "human_observer";

export interface IClassroomSessionMetadata {
  langGraphNodeState?: Record<string, unknown>;
  directorConfig?: Record<string, unknown>;
  standaloneMode?: boolean;
}

export interface IClassroomMemoryContent {
  type: "action" | "text";
  content: unknown;
}

export interface IClassroomWhiteboardTimeline {
  timestamp: number;
  action: string;
  payload: Record<string, unknown>;
}

export interface IClassroomSession {
  id: string;
  tenantId: string;
  courseId: string | null;
  directorAgentId: string | null;
  status: ClassroomSessionStatus;
  metadata: IClassroomSessionMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassroomMemoryLedger {
  id: string;
  tenantId: string;
  sessionId: string;
  parentLedgerId: string | null;
  turnCount: number;
  role: ClassroomMemoryRole;
  parsedContent: IClassroomMemoryContent[] | null;
  isCompacted: boolean | number | null;
  createdAt: Date | null;
}

export interface IClassroomParticipant {
  id: string;
  tenantId: string;
  sessionId: string;
  userId: string;
  role: ClassroomParticipantRole;
  engagementScore: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassroomWhiteboardState {
  id: string;
  tenantId: string;
  sessionId: string;
  timeline: IClassroomWhiteboardTimeline[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IClassroomRepository {
  // --- Sessions ---
  getSessionById(tenantId: string, sessionId: string): Promise<IClassroomSession | null>;
  getSessionsByTenant(tenantId: string, status?: ClassroomSessionStatus): Promise<IClassroomSession[]>;
  createSession(data: Partial<IClassroomSession>): Promise<IClassroomSession>;
  updateSession(tenantId: string, sessionId: string, data: Partial<IClassroomSession>): Promise<IClassroomSession>;

  /**
   * Atomic session lock — prevents concurrent mutations on the same session.
   * Returns the session only if it was successfully transitioned to "active".
   * Mirrors the atomic checkout pattern from the AI task system.
   */
  checkoutSession(tenantId: string, sessionId: string): Promise<IClassroomSession>;

  // --- Memory Ledger ---
  getMemoryBySession(tenantId: string, sessionId: string): Promise<IClassroomMemoryLedger[]>;
  appendMemoryEntry(data: Partial<IClassroomMemoryLedger>): Promise<IClassroomMemoryLedger>;
  compactMemory(tenantId: string, sessionId: string, beforeTurn: number): Promise<number>; // returns compacted count

  // --- Participants ---
  getParticipants(tenantId: string, sessionId: string): Promise<IClassroomParticipant[]>;
  addParticipant(data: Partial<IClassroomParticipant>): Promise<IClassroomParticipant>;
  updateEngagementScore(tenantId: string, participantId: string, score: number): Promise<void>;

  // --- Whiteboard ---
  getWhiteboardState(tenantId: string, sessionId: string): Promise<IClassroomWhiteboardState | null>;
  upsertWhiteboardState(tenantId: string, sessionId: string, timeline: IClassroomWhiteboardTimeline[]): Promise<IClassroomWhiteboardState>;
}
