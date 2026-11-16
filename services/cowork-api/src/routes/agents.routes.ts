import { Hono } from "hono";
import { z } from "zod";

import type { CapabilityRole, TenantFeature } from "@edapex/contracts";

import type { AppContext } from "../env";
import { apiError } from "../schema";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  setAgentGrants
} from "../services/agent/agents";

/**
 * Agent lifecycle routes.
 *
 * Every write here can only **narrow** authority. The ceiling comes from the acting
 * user's role and the tenant feature mask, and the service re-checks it on every
 * mutation rather than trusting a stored grant — a role change or a disabled feature
 * shrinks the ceiling and every dependent agent with it.
 *
 * The feature mask is read from the request the same way `agentCapabilities` reads it:
 * an unlisted feature means enabled, so a missing query parameter cannot silently
 * strip every capability.
 */

const createBodySchema = z.object({
  name: z.string().min(1).max(120),
  purpose: z.string().min(1).max(600),
  model: z.string().min(1).max(120),
  kind: z.enum(["local", "remote"]),
  operationIds: z.array(z.string().min(1).max(120)).max(64),
  channelId: z.string().min(1).max(200).nullable().optional()
});

const grantsBodySchema = z.object({
  operationIds: z.array(z.string().min(1).max(120)).max(64)
});

function parseFeatures(raw: readonly string[]): TenantFeature[] {
  const features: TenantFeature[] = [];
  for (const entry of raw) {
    try {
      const value: unknown = JSON.parse(entry);
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { enabled?: unknown }).enabled === "boolean"
      ) {
        features.push({
          id: (value as { id: string }).id,
          enabled: (value as { enabled: boolean }).enabled
        });
      }
    } catch {
      continue;
    }
  }
  return features;
}

/**
 * The acting user's role, from the identity `sms-api` resolved.
 *
 * Mirrors `resolveRole` in `agent-capabilities.routes.ts`. Duplicated deliberately
 * rather than imported: that module owns the manifest response and this one owns
 * authority, and a future change to one should not silently move the other.
 */
function roleOf(identity: AppContext["Variables"]["identity"]): {
  readonly role: CapabilityRole;
  readonly isAdmin: boolean;
} {
  if (identity.isAdmin) return { role: "admin", isAdmin: true };
  if (identity.staffId !== null) return { role: "teacher", isAdmin: false };
  if (identity.isParent) return { role: "parent", isAdmin: false };
  return { role: "student", isAdmin: false };
}

/**
 * Reads `workspaceId`, requiring it.
 *
 * A query parameter rather than a context variable, matching the connector routes:
 * the workspace is chosen by the client and must match the identity's tenant. An
 * absent value returns null so the caller answers 400 rather than querying with `""`
 * — which would silently match nothing and read as "no agents".
 */
function requireWorkspace(context: import("hono").Context<AppContext>): string | null {
  const workspaceId = context.req.query("workspaceId") ?? "";
  return workspaceId.length === 0 ? null : workspaceId;
}

export const agentRoutes = new Hono<AppContext>()
  .get("/agents", async (context) => {
    const workspaceId = requireWorkspace(context);
    if (workspaceId === null) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const identity = context.get("identity");
    const { role } = roleOf(identity);
    const features = parseFeatures(context.req.queries("feature") ?? []);

    const agents = await listAgents(context, {
      workspaceId,
      creatorRole: role,
      features
    });

    context.header("Cache-Control", "private, no-store");
    return context.json({ agents }, 200);
  })

  .get("/agents/:agentId", async (context) => {
    const workspaceId = requireWorkspace(context);
    if (workspaceId === null) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const identity = context.get("identity");
    const { role } = roleOf(identity);
    const features = parseFeatures(context.req.queries("feature") ?? []);

    const agent = await getAgent(context, {
      workspaceId,
      agentId: context.req.param("agentId"),
      creatorRole: role,
      features
    });

    if (agent === null) {
      return context.json(apiError("Agent not found.", "invalid_request"), 404);
    }
    context.header("Cache-Control", "private, no-store");
    return context.json(agent, 200);
  })

  .post("/agents", async (context) => {
    const workspaceId = requireWorkspace(context);
    if (workspaceId === null) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const parsed = createBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json(apiError("Invalid agent draft.", "invalid_request"), 400);
    }

    const identity = context.get("identity");
    const { role, isAdmin } = roleOf(identity);
    const features = parseFeatures(context.req.queries("feature") ?? []);

    const result = await createAgent(context, {
      workspaceId,
      creatorId: context.get("userId"),
      creatorRole: role,
      creatorIsAdmin: isAdmin,
      features,
      name: parsed.data.name,
      purpose: parsed.data.purpose,
      model: parsed.data.model,
      kind: parsed.data.kind,
      operationIds: parsed.data.operationIds,
      channelId: parsed.data.channelId ?? null
    });

    if (result.kind === "rejected") {
      // A name clash is a conflict; everything else is authority, which is a 403.
      // The distinction matters to a client deciding whether to change the name or
      // the grant.
      const status = result.reason.code === "name_taken" ? 409 : 403;
      return context.json(
        {
          ...apiError(
            result.reason.code === "name_taken"
              ? "An agent with that name already exists."
              : "This agent asks for more authority than you have.",
            "invalid_request"
          ),
          proposal: result.reason.code === "not_proposable" ? result.reason.proposal : null
        },
        status
      );
    }

    context.header("Cache-Control", "private, no-store");
    return context.json(result.agent, 201);
  })

  .put("/agents/:agentId/grants", async (context) => {
    const workspaceId = requireWorkspace(context);
    if (workspaceId === null) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const parsed = grantsBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      return context.json(apiError("Invalid grant set.", "invalid_request"), 400);
    }

    const identity = context.get("identity");
    const { role, isAdmin } = roleOf(identity);
    const features = parseFeatures(context.req.queries("feature") ?? []);

    const result = await setAgentGrants(context, {
      workspaceId,
      agentId: context.req.param("agentId"),
      actorId: context.get("userId"),
      creatorRole: role,
      creatorIsAdmin: isAdmin,
      features,
      operationIds: parsed.data.operationIds
    });

    if (result.kind === "rejected") {
      return context.json(
        {
          ...apiError(
            "This grant exceeds your authority.",
            "invalid_request"
          ),
          proposal: result.reason.code === "not_proposable" ? result.reason.proposal : null
        },
        403
      );
    }

    context.header("Cache-Control", "private, no-store");
    return context.json(result.agent, 200);
  })

  .delete("/agents/:agentId", async (context) => {
    const workspaceId = requireWorkspace(context);
    if (workspaceId === null) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    await deleteAgent(context, {
      workspaceId,
      agentId: context.req.param("agentId")
    });
    return context.body(null, 204);
  });
