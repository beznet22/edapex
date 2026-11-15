/**
 * Agent lifecycle client.
 *
 * The server enforces the narrowing invariant; this module does not re-implement it.
 * But the *form* needs the same ceiling to render a picker that only offers what the
 * person can actually grant — offering an operation that the server will reject is a
 * worse experience than not offering it, because the person only learns after writing
 * the whole draft.
 *
 * So the picker is built from `buildCapabilityManifest`, the same function the server
 * uses. One computation, two consumers.
 */

import {
  buildCapabilityManifest,
  type CapabilityManifest,
  type CapabilityOperation,
  type CapabilityRole,
  type CapabilityTool
} from "@edapex/contracts";

import { apiBase } from "@/lib/api";

export interface AgentView {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly kind: "local" | "remote";
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly operations: readonly string[];
  /** Stored grants that no longer resolve against today's ceiling. */
  readonly revokedByPolicy: readonly string[];
  readonly ceilingSnapshot: readonly string[];
}

export interface AgentDraftInput {
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly kind: "local" | "remote";
  readonly operationIds: readonly string[];
}

/**
 * Request timeout.
 *
 * `fetch` has no default timeout, so a request that never settles leaves the surface
 * pinned in a loading state forever with no retry affordance. Twelve seconds is longer
 * than any honest response and short enough that the person is still looking at the
 * screen when it fails.
 */
const REQUEST_TIMEOUT_MS = 12_000;

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
  } catch (cause) {
    throw new Error(
      cause instanceof DOMException && cause.name === "AbortError"
        ? "The request timed out. Check your connection and try again."
        : cause instanceof Error
          ? cause.message
          : "Could not reach the server."
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const workspaceQuery = (workspaceId: string): string =>
  `?workspaceId=${encodeURIComponent(workspaceId)}`;

export const listAgents = async (workspaceId: string): Promise<readonly AgentView[]> => {
  const body = await request<{ agents: AgentView[] }>(
    `/api/v1/agent/agents${workspaceQuery(workspaceId)}`
  );
  return body.agents;
};

export const createAgent = async (
  workspaceId: string,
  draft: AgentDraftInput
): Promise<AgentView> =>
  request<AgentView>(`/api/v1/agent/agents${workspaceQuery(workspaceId)}`, {
    method: "POST",
    body: JSON.stringify(draft)
  });

export const setAgentGrants = async (
  workspaceId: string,
  agentId: string,
  operationIds: readonly string[]
): Promise<AgentView> =>
  request<AgentView>(
    `/api/v1/agent/agents/${encodeURIComponent(agentId)}/grants${workspaceQuery(workspaceId)}`,
    { method: "PUT", body: JSON.stringify({ operationIds }) }
  );

export const deleteAgent = async (workspaceId: string, agentId: string): Promise<void> =>
  request<void>(
    `/api/v1/agent/agents/${encodeURIComponent(agentId)}${workspaceQuery(workspaceId)}`,
    { method: "DELETE" }
  );

/** One selectable operation, with the tool that owns it. */
export interface GrantOption {
  readonly operationId: string;
  readonly toolId: string;
  readonly toolDescription: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
}

export interface GrantCatalog {
  readonly tools: readonly {
    readonly id: string;
    readonly description: string;
    readonly operations: readonly GrantOption[];
  }[];
  readonly byId: ReadonlyMap<string, GrantOption>;
}

/**
 * Builds the picker from the person's own manifest.
 *
 * Only operations this role can perform appear, which is the whole point: an agent
 * cannot hold what its creator does not hold, so offering more would be offering a
 * rejection.
 *
 * A `CapabilityOperation` is reachable through several tools (`get` appears in people,
 * academics and more). The first tool wins for grouping, and `byId` keeps one entry —
 * duplicates in a checkbox list read as separate permissions when they are one.
 */
export function grantCatalog(manifest: CapabilityManifest): GrantCatalog {
  const byId = new Map<string, GrantOption>();
  const tools = manifest.packs.flatMap((pack) =>
    pack.tools.map((tool: CapabilityTool) => ({
      id: tool.id,
      description: tool.description,
      operations: tool.operations
        .filter((operation) => !byId.has(operation.id))
        .map((operation: CapabilityOperation) => {
          const option: GrantOption = {
            operationId: operation.id,
            toolId: tool.id,
            toolDescription: tool.description,
            description: operation.description,
            risk: operation.risk
          };
          byId.set(operation.id, option);
          return option;
        })
    }))
  );

  return {
    tools: tools.filter((tool) => tool.operations.length > 0),
    byId
  };
}

/**
 * Builds a picker for an arbitrary role.
 *
 * Used when an administrator edits someone else's agent: the picker must show the
 * *creator's* ceiling, not the administrator's, because that is what the server will
 * validate against. Showing the wider set would offer grants that fail on save.
 */
export function grantCatalogWith(role: CapabilityRole): GrantCatalog {
  return grantCatalog(buildCapabilityManifest(role));
}
