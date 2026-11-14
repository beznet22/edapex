/**
 * Connector contracts.
 *
 * These are the *shapes* the server exchanges with the UI. Connector code and
 * credentials live in `services/cowork-api` only: the spec forbids connector
 * bytes in any app bundle, so a client can display a catalogue and request an
 * action, but can never contain the implementation or a token.
 */

export const CONNECTOR_KINDS = ["mcp", "google"] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export const CONNECTOR_STATUSES = ["disconnected", "connected", "revoked", "error"] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

/**
 * Read versus write.
 *
 * A tool is a read only when it is positively classified as one. Anything
 * unclassified is a write, because the failure mode of guessing "read" is acting
 * without a decision.
 */
export const CONNECTOR_ACCESS = ["read", "write"] as const;
export type ConnectorAccess = (typeof CONNECTOR_ACCESS)[number];

export interface ConnectorToolView {
  readonly name: string;
  readonly description: string;
  readonly access: ConnectorAccess;
  /** Parameters as JSON Schema, for display and validation only. */
  readonly inputSchema: Record<string, unknown>;
}

export interface ConnectorView {
  readonly id: string;
  readonly kind: ConnectorKind;
  readonly name: string;
  readonly status: ConnectorStatus;
  /** Present only for connectors that authenticate per person. */
  readonly account: string | null;
  readonly tools: readonly ConnectorToolView[];
  readonly lastError: string | null;
}

/**
 * A grant is per agent, per tool.
 *
 * Validated at call time rather than at connect time: a connector being
 * connected says nothing about whether this agent may use this tool right now.
 */
export interface ConnectorGrant {
  readonly connectorId: string;
  readonly agentId: string;
  readonly toolName: string;
  readonly access: ConnectorAccess;
  readonly grantedBy: string;
  readonly grantedAt: number;
  readonly revokedAt: number | null;
}

export interface ConnectorGrantCheck {
  readonly allowed: boolean;
  readonly reason:
    | "granted"
    | "no_grant"
    | "revoked"
    | "connector_disconnected"
    | "access_mismatch"
    | "not_a_tool";
}

/**
 * Evaluates a connector call against its grants.
 *
 * Pure and shared, so the decision is the same whether it is checked in the
 * server, in a test, or in a dry run before a turn.
 */
export function checkConnectorGrant(input: {
  readonly connector: Pick<ConnectorView, "id" | "status" | "tools">;
  readonly grants: readonly ConnectorGrant[];
  readonly agentId: string;
  readonly toolName: string;
  readonly requestedAccess: ConnectorAccess;
}): ConnectorGrantCheck {
  const tool = input.connector.tools.find((candidate) => candidate.name === input.toolName);
  if (tool === undefined) return { allowed: false, reason: "not_a_tool" };

  if (input.connector.status !== "connected") {
    return { allowed: false, reason: "connector_disconnected" };
  }

  const grant = input.grants.find(
    (candidate) =>
      candidate.connectorId === input.connector.id &&
      candidate.agentId === input.agentId &&
      candidate.toolName === input.toolName
  );

  if (grant === undefined) return { allowed: false, reason: "no_grant" };
  if (grant.revokedAt !== null) return { allowed: false, reason: "revoked" };

  // A read grant does not authorise a write, and a write grant does authorise a
  // read: the narrower permission is never implied by the wider one in the
  // dangerous direction.
  if (input.requestedAccess === "write" && grant.access !== "write") {
    return { allowed: false, reason: "access_mismatch" };
  }

  return { allowed: true, reason: "granted" };
}

/**
 * Classifies an unlabelled tool.
 *
 * Name-based and deliberately blunt: an unclassified tool becomes a `write`, so a
 * new connector cannot slip through needing no approval because nobody tagged it.
 */
export function classifyAccess(toolName: string, declared?: ConnectorAccess): ConnectorAccess {
  if (declared !== undefined) return declared;
  const writeVerbs = /(^|[_.])(send|create|update|delete|write|post|put|patch|remove|share|invite|upload)/i;
  return writeVerbs.test(toolName) ? "write" : "read";
}
