import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";

/**
 * Agent creation and the narrowing invariant.
 *
 * The failure this guards is privilege escalation: a teacher creates an agent,
 * grants it an administrator operation, and then holds admin authority through a
 * proxy. Every test here is a version of that attempt.
 */

const app = createApp();

interface Session {
  readonly id: number;
  readonly isAdmin: boolean;
  readonly staffId: number | null;
  readonly schoolId: number | null;
}

const ADMIN: Session = { id: 1, isAdmin: true, staffId: 10, schoolId: 1 };
const TEACHER: Session = { id: 2, isAdmin: false, staffId: 20, schoolId: 1 };
const STUDENT: Session = { id: 3, isAdmin: false, staffId: null, schoolId: 1 };

const WORKSPACE = "ws-agents-test";

/**
 * The test stub encodes identity in the cookie so a case can be an admin, a teacher
 * or a student. A cookie without roles resolves to a student — the emptiest ceiling —
 * which is why the first version of these tests passed for the wrong reason.
 */
function headers(session: Session): Record<string, string> {
  const suffix = `${session.isAdmin ? ".admin" : ""}${
    session.staffId === null ? "" : `.staff-${session.staffId}`
  }`;
  return {
    cookie: `edapex_session=user-${session.id}${suffix}`,
    "content-type": "application/json"
  };
}

async function post(
  path: string,
  body: unknown,
  session: Session = TEACHER
): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: headers(session), body: JSON.stringify(body) },
    env
  );
}

async function get(path: string, session: Session = TEACHER): Promise<Response> {
  return app.request(path, { headers: headers(session) }, env);
}

async function put(path: string, body: unknown, session: Session = TEACHER): Promise<Response> {
  return app.request(
    path,
    { method: "PUT", headers: headers(session), body: JSON.stringify(body) },
    env
  );
}

const draft = {
  name: "Homework Helper",
  purpose: "Drafts homework feedback for my class.",
  model: "claude-sonnet-4",
  kind: "local" as const,
  operationIds: ["get"]
};

beforeEach(async () => {
  // Each test starts from an empty workspace: a leftover agent would make a name
  // clash look like a rejection of authority, which is the wrong diagnosis.
  await env.AGENT_DB.prepare("DELETE FROM agent_grants WHERE workspace_id = ?")
    .bind(WORKSPACE)
    .run();
  await env.AGENT_DB.prepare("DELETE FROM agents WHERE workspace_id = ?").bind(WORKSPACE).run();
});

describe("creating an agent", () => {
  it("creates one within the creator's ceiling", async () => {
    const response = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      id: string;
      name: string;
      operations: string[];
      revokedByPolicy: string[];
    };
    expect(body.name).toBe("Homework Helper");
    expect(body.operations).toEqual(["get"]);
    expect(body.revokedByPolicy).toEqual([]);
  });

  it("rejects an operation the creator does not hold", async () => {
    // `get` is a teacher operation; an admin-only one must not be inheritable.
    const response = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, {
      ...draft,
      operationIds: ["apply", "decide"]
    });

    // `apply`/`decide` are admin operations, so a teacher's ceiling excludes them and
    // nothing is left within it.
    expect(response.status).toBe(403);
    const body = (await response.json()) as { proposal: { kind: string; exceeding?: string[] } };
    expect(body.proposal.kind).toBe("rejected");
  });

  it("reports what exceeded instead of trimming silently", async () => {
    // `proposeAgent` returns `within` *and* `exceeding`, so a mixed draft succeeds with
    // the excess named. Silently dropping it would leave the teacher believing both
    // were granted; refusing the whole draft would discard the part that was valid.
    const response = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, {
      ...draft,
      operationIds: ["get", "apply"]
    });
    expect(response.status).toBe(201);

    const body = (await response.json()) as { operations: string[] };
    expect(body.operations).toEqual(["get"]);
    expect(body.operations).not.toContain("apply");
  });

  it("refuses a name that already exists", async () => {
    await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    const second = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    expect(second.status).toBe(409);
  });

  it("refuses a remote agent unless the creator is an administrator", async () => {
    const response = await post(
      `/api/v1/agent/agents?workspaceId=${WORKSPACE}`,
      { ...draft, kind: "remote" },
      TEACHER
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { proposal: { reason: string } };
    expect(body.proposal.reason).toBe("remote_requires_admin");
  });

  it("allows an administrator to create a remote agent", async () => {
    const response = await post(
      `/api/v1/agent/agents?workspaceId=${WORKSPACE}`,
      { ...draft, kind: "remote" },
      ADMIN
    );
    expect(response.status).toBe(201);
  });

  it("requires a workspace id", async () => {
    const response = await post("/api/v1/agent/agents", draft);
    expect(response.status).toBe(400);
  });
});

describe("the ceiling shrinks after creation", () => {
  it("drops an operation when its feature is disabled", async () => {
    const created = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    expect(created.status).toBe(201);

    // `search` belongs to the people tool. Disabling that feature must remove it from
    // the agent's effective grant without touching the stored row — the ceiling is
    // re-derived on read, never cached.
    await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, {
      ...draft,
      name: "Search Bot",
      operationIds: ["search"]
    });

    const before = (await (
      await get(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`)
    ).json()) as { agents: { name: string; operations: string[]; revokedByPolicy: string[] }[] };
    const searched = before.agents.find((agent) => agent.name === "Search Bot");
    expect(searched?.operations).toContain("search");

    const after = (await (
      await get(
        `/api/v1/agent/agents?workspaceId=${WORKSPACE}&feature=${encodeURIComponent(
          JSON.stringify({ id: "people", enabled: false })
        )}`
      )
    ).json()) as { agents: { name: string; operations: string[]; revokedByPolicy: string[] }[] };

    const shrunk = after.agents.find((agent) => agent.name === "Search Bot");
    expect(shrunk?.operations).not.toContain("search");
    // Surfaced, not hidden: the teacher needs to know which grant stopped resolving.
    expect(shrunk?.revokedByPolicy).toContain("search");
  });
});

describe("updating grants", () => {
  it("rejects a grant wider than the actor's authority", async () => {
    const created = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    const { id } = (await created.json()) as { id: string };

    const response = await put(`/api/v1/agent/agents/${id}/grants?workspaceId=${WORKSPACE}`, {
      operationIds: ["apply"]
    });
    expect(response.status).toBe(403);

    // The original grant must survive a rejected update: a failed widening that
    // still cleared the old grants would be a denial of service on the agent.
    const after = (await (
      await get(`/api/v1/agent/agents/${id}?workspaceId=${WORKSPACE}`)
    ).json()) as { operations: string[] };
    expect(after.operations).toEqual(["get"]);
  });

  it("applies a narrower grant", async () => {
    const created = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    const { id } = (await created.json()) as { id: string };

    // `search` is in the teacher ceiling; `status` is not.
    const response = await put(`/api/v1/agent/agents/${id}/grants?workspaceId=${WORKSPACE}`, {
      operationIds: ["search"]
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { operations: string[] };
    expect(body.operations).toEqual(["search"]);
  });
});

describe("mutating someone else's agent", () => {
  it("uses the creator's ceiling, not the actor's", async () => {
    // Spec 10: `agent.effectiveGrant ⊆ capabilityManifest(creator.role, features)`.
    // An administrator editing a teacher's agent must not grant an admin operation —
    // that would build a channel handing a teacher authority they cannot hold.
    const created = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft, TEACHER);
    const { id } = (await created.json()) as { id: string };

    const widened = await put(
      `/api/v1/agent/agents/${id}/grants?workspaceId=${WORKSPACE}`,
      { operationIds: ["apply"] },
      ADMIN
    );
    expect(widened.status).toBe(403);

    // And the administrator may still narrow it, because narrowing never escalates.
    const narrowed = await put(
      `/api/v1/agent/agents/${id}/grants?workspaceId=${WORKSPACE}`,
      { operationIds: ["search"] },
      ADMIN
    );
    expect(narrowed.status).toBe(200);
  });
});

describe("students", () => {
  it("can create an agent, but only within their own ceiling", async () => {
    // Students hold `get`, `get_marksheet`, `get_report_card`, `get_student`,
    // `get_transcript` and `search` — six read operations. Narrowing permits an agent
    // over those; it does not forbid agents outright.
    const allowed = await post(
      `/api/v1/agent/agents?workspaceId=${WORKSPACE}`,
      { ...draft, name: "Student Helper", operationIds: ["get_transcript"] },
      STUDENT
    );
    expect(allowed.status).toBe(201);

    // And an admin-only operation is still out of reach.
    const denied = await post(
      `/api/v1/agent/agents?workspaceId=${WORKSPACE}`,
      { ...draft, name: "Escalation Attempt", operationIds: ["apply"] },
      STUDENT
    );
    expect(denied.status).toBe(403);
  });
});

describe("listing", () => {
  it("excludes soft-deleted agents", async () => {
    const created = await post(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`, draft);
    const { id } = (await created.json()) as { id: string };

    await app.request(
      `/api/v1/agent/agents/${id}?workspaceId=${WORKSPACE}`,
      { method: "DELETE", headers: headers(TEACHER) },
      env
    );

    const listing = (await (
      await get(`/api/v1/agent/agents?workspaceId=${WORKSPACE}`)
    ).json()) as { agents: unknown[] };
    expect(listing.agents).toHaveLength(0);
  });
});
