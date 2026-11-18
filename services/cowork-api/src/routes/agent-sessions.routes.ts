import {
  sessionCommandSchema,
  sessionSyncPushSchema,
  type SessionCommand
} from "@edapex/contracts";
import { Hono } from "hono";

import type { AppContext } from "../env";
import { apiError } from "../schema";
import {
  acquireLease,
  releaseLease,
  renewLease,
  type SessionOwner
} from "../services/session-lease";
import {
  MAX_PULL_LIMIT,
  MIN_PULL_LIMIT,
  deleteSession,
  pullSessionEvents,
  pushSessionEvents,
  type RelayFailure
} from "../services/session-relay";

/**
 * Agent session relay.
 *
 * Mounted at `/api/v1/agent` behind `authenticate`, so `userId` here is always
 * the session's owner. The workspace is part of every call — a session id alone
 * is not enough authority, and the relay refuses a workspace mismatch rather
 * than moving a conversation between tenants.
 *
 * The request bodies are the shared contracts, not copies: a change to the wire
 * shape is a contracts change with its fixture and parity test, not a route edit.
 */
export const agentSessions = new Hono<AppContext>()
  .post("/sessions/:sessionId/commands", async (context) => {
    const sessionId = context.req.param("sessionId");
    const workspaceId = context.req.query("workspaceId");
    if (workspaceId === undefined || workspaceId === "") {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(apiError("A JSON body is required.", "invalid_request"), 400);
    }

    const parsed = sessionCommandSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        apiError(parsed.error.issues[0]?.message ?? "Invalid command.", "invalid_request"),
        400
      );
    }
    const command = parsed.data;
    if (command.sessionId !== sessionId) {
      return context.json(
        apiError("The command names a different session.", "invalid_request"),
        400
      );
    }

    const owner: SessionOwner = { sessionId, userId: context.get("userId"), workspaceId };
    const now = Date.now();
    const failure = (result: RelayFailure) =>
      context.json(result.error, result.status);

    switch (command.type) {
      case "acquire_lease": {
        const result = await acquireLease(
          context.env.AGENT_DB,
          owner,
          command.clientId,
          command.leaseTtlMs,
          now
        );
        return result.ok
          ? context.json({ lease: result.lease }, 200)
          : failure(result);
      }
      case "renew_lease": {
        const result = await renewLease(
          context.env.AGENT_DB,
          owner,
          command.clientId,
          command.expectedFence,
          60_000,
          now
        );
        return result.ok
          ? context.json({ lease: result.lease }, 200)
          : failure(result);
      }
      case "release_lease": {
        const result = await releaseLease(
          context.env.AGENT_DB,
          owner,
          command.clientId,
          command.expectedFence,
          now
        );
        return result.ok
          ? context.json({ released: true }, 200)
          : failure(result);
      }
      case "delete_session": {
        const result = await deleteSession(
          context.env.AGENT_DB,
          owner,
          command.clientId,
          command.commandId,
          now
        );
        return result.ok
          ? context.json(
              {
                sessionId,
                deletionEventId: result.deletionEventId,
                position: result.position
              },
              200
            )
          : failure(result);
      }
      default:
        // Commands such as enqueue_text belong to the tick that holds the lease;
        // relaying them here would be a second execution path.
        return context.json(
          apiError(
            `Command ${unsupported(command)} is executed by the lease holder, not relayed.`,
            "invalid_request"
          ),
          422
        );
    }
  })

  .post("/sessions/:sessionId/events", async (context) => {
    const sessionId = context.req.param("sessionId");
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(apiError("A JSON body is required.", "invalid_request"), 400);
    }

    const parsed = sessionSyncPushSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        apiError(parsed.error.issues[0]?.message ?? "Invalid push.", "invalid_request"),
        400
      );
    }
    if (parsed.data.sessionId !== sessionId) {
      return context.json(
        apiError("The push names a different session.", "invalid_request"),
        400
      );
    }

    const owner: SessionOwner = {
      sessionId,
      userId: context.get("userId"),
      workspaceId: parsed.data.workspaceId
    };
    const result = await pushSessionEvents(
      context.env.AGENT_DB,
      owner,
      parsed.data,
      Date.now()
    );
    return result.ok
      ? context.json(result.result, 200)
      : context.json(result.error, result.status);
  })

  .get("/sessions/:sessionId/events", async (context) => {
    const sessionId = context.req.param("sessionId");
    const workspaceId = context.req.query("workspaceId");
    if (workspaceId === undefined || workspaceId === "") {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const after = parseCount(context.req.query("after"), 0);
    if (after === null) {
      return context.json(apiError("after must be a non-negative integer.", "invalid_request"), 400);
    }
    const limit = parseCount(context.req.query("limit"), MAX_PULL_LIMIT);
    if (limit === null || limit < MIN_PULL_LIMIT || limit > MAX_PULL_LIMIT) {
      return context.json(
        apiError(`limit must be between ${MIN_PULL_LIMIT} and ${MAX_PULL_LIMIT}.`, "invalid_request"),
        400
      );
    }

    const owner: SessionOwner = { sessionId, userId: context.get("userId"), workspaceId };
    const result = await pullSessionEvents(context.env.AGENT_DB, owner, after, limit);
    return result.ok
      ? context.json(result.result, 200)
      : context.json(result.error, result.status);
  });

function parseCount(value: string | undefined, fallback: number): number | null {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** The command's own type, for an error a human can act on. */
function unsupported(command: SessionCommand): string {
  return command.type;
}
