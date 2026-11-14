import { Hono } from "hono";

import type { AppContext } from "../env";
import { apiError } from "../schema";

/**
 * Connector surface.
 *
 * Everything here is a summary of server state. The catalogue comes from
 * `@edapex/connectors`, which is server-only: no tool implementation, no token
 * and no server URL is returned, because the client is not allowed to hold any of
 * those.
 */

export const connectors = new Hono<AppContext>()
  .get("/", async (context) => {
    // Connectors are workspace-scoped rows, not school rows: a platform-only
    // tenant has them too, which is the point of tier 1.
    const workspaceId = context.req.query("workspaceId") ?? "";
    if (workspaceId.length === 0) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const { results } = await context.env.AGENT_DB.prepare(
      "SELECT connector_id, account_email, scopes, revoked_at, last_used_at \
       FROM connector_accounts WHERE workspace_id = ? AND user_id = ? ORDER BY connector_id"
    )
      .bind(workspaceId, context.get("userId"))
      .all<{
        connector_id: string;
        account_email: string | null;
        scopes: string;
        revoked_at: number | null;
        last_used_at: number | null;
      }>();

    context.header("Cache-Control", "private, no-store");
    return context.json({
      connectors: results.map((row) => ({
        id: row.connector_id,
        account: row.account_email,
        // Scopes are display data: the person is entitled to know what they
        // granted. The token itself never leaves the secret box.
        scopes: row.scopes.length === 0 ? [] : row.scopes.split(" "),
        status: row.revoked_at === null ? "connected" : "revoked",
        lastUsedAt: row.last_used_at
      }))
    }, 200);
  })

  .get("/grants", async (context) => {
    const workspaceId = context.req.query("workspaceId") ?? "";
    const agentId = context.req.query("agentId") ?? "";
    if (workspaceId.length === 0 || agentId.length === 0) {
      return context.json(apiError("workspaceId and agentId are required.", "invalid_request"), 400);
    }

    const { results } = await context.env.AGENT_DB.prepare(
      "SELECT connector_id, agent_id, tool_name, access, granted_by, granted_at, revoked_at \
       FROM connector_grants WHERE workspace_id = ? AND agent_id = ?"
    )
      .bind(workspaceId, agentId)
      .all<{
        connector_id: string;
        agent_id: string;
        tool_name: string;
        access: string;
        granted_by: string;
        granted_at: number;
        revoked_at: number | null;
      }>();

    context.header("Cache-Control", "private, no-store");
    return context.json({
      grants: results.map((row) => ({
        connectorId: row.connector_id,
        agentId: row.agent_id,
        toolName: row.tool_name,
        access: row.access,
        grantedBy: row.granted_by,
        grantedAt: row.granted_at,
        revokedAt: row.revoked_at
      }))
    }, 200);
  })

  /**
   * Revoke a connector for the calling person.
   *
   * A tombstone, never a delete: the row is the audit trail of what was
   * authorised and when it stopped being authorised.
   */
  .delete("/:id", async (context) => {
    const workspaceId = context.req.query("workspaceId") ?? "";
    if (workspaceId.length === 0) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const result = await context.env.AGENT_DB.prepare(
      "UPDATE connector_accounts SET revoked_at = ? \
       WHERE workspace_id = ? AND user_id = ? AND connector_id = ? AND revoked_at IS NULL"
    )
      .bind(Date.now(), workspaceId, context.get("userId"), context.req.param("id"))
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return context.json(apiError("Unknown connector.", "device_unknown"), 404);
    }
    return context.body(null, 204);
  });
