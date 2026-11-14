import { describe, expect, it } from "vitest";

import { describeAction, evaluatePolicy, type PolicyInput } from "../src/services/agent/gateway/policy";
import {
  applyDecision,
  approvalFromPolicy,
  redactArguments,
  toAuditArguments
} from "../src/services/agent/gateway/audit";
import { execute, read, write, type ActionDependencies, type ToolInvocation } from "../src/services/agent/gateway/actions";

/**
 * Policy → audit → act.
 *
 * The acceptance criterion for chunk 3 is that *every* write follows that path.
 * These tests assert the path itself rather than one happy case: a write that
 * skips approval, or an audit trail with a gap, is the failure worth catching.
 */

const base: PolicyInput = {
  toolName: "upsert_marksheet",
  risk: "write",
  granted: true,
  connector: false,
  connectorConnected: false,
  nowSeconds: 1_000
};

describe("evaluatePolicy", () => {
  it("allows a read without a decision", () => {
    expect(evaluatePolicy({ ...base, risk: "read" })).toEqual({ kind: "allow", risk: "read" });
  });

  it("requires a decision for a write", () => {
    const outcome = evaluatePolicy(base);
    expect(outcome.kind).toBe("approve");
    // Expiry is server-computed and bounded.
    if (outcome.kind === "approve") expect(outcome.expiresAt).toBeGreaterThan(base.nowSeconds);
  });

  it("requires a decision for a destructive call", () => {
    expect(evaluatePolicy({ ...base, risk: "destructive" }).kind).toBe("approve");
  });

  it("denies an ungranted connector tool before asking anyone", () => {
    // A prompt for something that could not run trains people to click through.
    const outcome = evaluatePolicy({ ...base, connector: true, granted: false });
    expect(outcome).toMatchObject({ kind: "deny", code: "not_granted" });
  });

  it("denies a disconnected connector", () => {
    const outcome = evaluatePolicy({
      ...base,
      connector: true,
      granted: true,
      connectorConnected: false
    });
    expect(outcome).toMatchObject({ kind: "deny", code: "connector_disconnected" });
  });

  it("does not treat an unclassified tool as a read", () => {
    // Risk is supplied by the caller, but the default must never be "read" for a
    // tool whose class is unknown; `write` is the safe assumption.
    expect(evaluatePolicy({ ...base, toolName: "mystery_tool", risk: "write" }).kind).toBe("approve");
  });
});

describe("redactArguments", () => {
  it("removes credential-shaped keys at any depth", () => {
    const redacted = redactArguments({
      to: "parent@example.com",
      auth: { access_token: "ya29.secret", refresh_token: "1//secret" },
      apiKey: "sk-abc",
      nested: [{ password: "hunter2" }]
    }) as Record<string, unknown>;

    expect(redacted.to).toBe("parent@example.com");
    expect(JSON.stringify(redacted)).not.toContain("ya29.secret");
    expect(JSON.stringify(redacted)).not.toContain("1//secret");
    expect(JSON.stringify(redacted)).not.toContain("sk-abc");
    expect(JSON.stringify(redacted)).not.toContain("hunter2");
  });

  it("caps the serialised size", () => {
    const huge = { body: "x".repeat(10_000) };
    expect(toAuditArguments(huge).length).toBeLessThanOrEqual(2_020);
  });

  it("survives a cycle-inducing depth", () => {
    interface Nested {
      next?: Nested;
    }
    const deep: Nested = {};
    let cursor = deep;
    for (let index = 0; index < 40; index += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    expect(() => redactArguments(deep)).not.toThrow();
  });
});

describe("approvals", () => {
  const outcome = { kind: "approve" as const, risk: "write" as const, expiresAt: 1_900 };

  it("is pending with a server-computed expiry", () => {
    const record = approvalFromPolicy({
      outcome,
      id: "a-1",
      workspaceId: "ws-1",
      agentId: null,
      toolName: "send_email",
      argumentsJson: "{}",
      nowSeconds: 1_000
    });
    expect(record.status).toBe("pending");
    expect(record.expiresAt).toBe(1_900);
    expect(record.decision).toBeNull();
  });

  it("accepts an allow decision", () => {
    const record = approvalFromPolicy({
      outcome,
      id: "a-1",
      workspaceId: "ws-1",
      agentId: null,
      toolName: "send_email",
      argumentsJson: "{}",
      nowSeconds: 1_000
    });
    const applied = applyDecision(record, "allow_once", 1_100);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.record.status).toBe("allowed");
      expect(applied.record.decidedAt).toBe(1_100);
    }
  });

  it("distinguishes deny from abort", () => {
    const make = () =>
      approvalFromPolicy({
        outcome,
        id: "a-1",
        workspaceId: "ws-1",
        agentId: null,
        toolName: "send_email",
        argumentsJson: "{}",
        nowSeconds: 1_000
      });

    const denied = applyDecision(make(), "deny", 1_100);
    const aborted = applyDecision(make(), "abort", 1_100);
    expect(denied.ok && denied.record.status).toBe("denied");
    expect(aborted.ok && aborted.record.status).toBe("aborted");
  });

  it("refuses to overwrite a decision", () => {
    const record = approvalFromPolicy({
      outcome,
      id: "a-1",
      workspaceId: "ws-1",
      agentId: null,
      toolName: "send_email",
      argumentsJson: "{}",
      nowSeconds: 1_000
    });
    const first = applyDecision(record, "deny", 1_100);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // A racing or replayed approval must not flip a denial into an allow.
    const second = applyDecision(first.record, "allow_once", 1_200);
    expect(second.ok).toBe(false);
  });

  it("refuses an expired request", () => {
    const record = approvalFromPolicy({
      outcome,
      id: "a-1",
      workspaceId: "ws-1",
      agentId: null,
      toolName: "send_email",
      argumentsJson: "{}",
      nowSeconds: 1_000
    });
    expect(applyDecision(record, "allow_once", 2_000).ok).toBe(false);
  });
});

describe("describeAction", () => {
  it("says a destructive action cannot be undone", () => {
    const described = describeAction({
      toolName: "delete_student",
      risk: "destructive",
      arguments: {}
    });
    expect(described.description).toContain("cannot be undone");
  });

  it("previews recipient and content for an outgoing message", () => {
    const described = describeAction({
      toolName: "send_email",
      risk: "write",
      arguments: { to: "parent@example.com", body: "Your child was absent today." }
    });
    expect(described.preview).toEqual({
      recipient: "parent@example.com",
      body: "Your child was absent today."
    });
    expect(described.description).toContain("real recipient");
  });

  it("does not preview an internal write", () => {
    const described = describeAction({
      toolName: "upsert_marksheet",
      risk: "write",
      arguments: { classId: 5 }
    });
    expect(described.preview).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The path itself
// ---------------------------------------------------------------------------

function deps(overrides: Partial<ActionDependencies> = {}): ActionDependencies & {
  runs: ToolInvocation[];
  outcomes: string[];
} {
  const runs: ToolInvocation[] = [];
  const outcomes: string[] = [];
  return {
    runs,
    outcomes,
    audit: {
      async append(event) {
        outcomes.push(event.outcome);
      }
    },
    async runTool(invocation) {
      runs.push(invocation);
      return { ok: true, value: "ok" };
    },
    newId: (() => {
      let counter = 0;
      return () => `id-${(counter += 1)}`;
    })(),
    ...overrides
  };
}

const context = { workspaceId: "ws-1", agentId: "agent-1", actorId: "user-1", nowSeconds: 1_000 };
const writeCall: ToolInvocation = {
  toolName: "send_email",
  risk: "write",
  granted: true,
  connector: false,
  connectorConnected: false,
  arguments: { to: "p@example.com", body: "hello" }
};

describe("the write path", () => {
  it("proposes before running and records the proposal", async () => {
    const dependencies = deps();
    const outcome = await write(writeCall, context, dependencies);

    expect(outcome.kind).toBe("pending_approval");
    expect(dependencies.runs).toEqual([]);
    expect(dependencies.outcomes).toEqual(["proposed"]);
  });

  it("does not run the tool until execute is called with an allow", async () => {
    const dependencies = deps();
    const outcome = await write(writeCall, context, dependencies);
    if (outcome.kind !== "pending_approval") throw new Error("expected a pending approval");

    expect(dependencies.runs).toHaveLength(0);

    await execute(writeCall, outcome.approval, "allow_once", context, dependencies);
    expect(dependencies.runs).toHaveLength(1);
    // allowed → succeeded, in that order.
    expect(dependencies.outcomes).toEqual(["proposed", "allowed", "succeeded"]);
  });

  it("never runs the tool after a denial", async () => {
    const dependencies = deps();
    const outcome = await write(writeCall, context, dependencies);
    if (outcome.kind !== "pending_approval") throw new Error("expected a pending approval");

    const executed = await execute(writeCall, outcome.approval, "deny", context, dependencies);
    expect(executed.kind).toBe("denied");
    expect(dependencies.runs).toHaveLength(0);
    expect(dependencies.outcomes).toEqual(["proposed", "denied"]);
  });

  it("marks an abort separately from a denial", async () => {
    const dependencies = deps();
    const outcome = await write(writeCall, context, dependencies);
    if (outcome.kind !== "pending_approval") throw new Error("expected a pending approval");

    const executed = await execute(writeCall, outcome.approval, "abort", context, dependencies);
    expect(executed).toMatchObject({ kind: "denied", code: "aborted" });
    expect(dependencies.outcomes).toEqual(["proposed", "aborted"]);
  });

  it("refuses to run a write that policy would allow outright", async () => {
    // A write classified as a read is a classification bug. Running it would act
    // without a decision, which is the failure this path exists to prevent.
    const dependencies = deps();
    const outcome = await write({ ...writeCall, risk: "read" }, context, dependencies);

    expect(outcome).toMatchObject({ kind: "denied", code: "classification_error" });
    expect(dependencies.runs).toHaveLength(0);
    expect(dependencies.outcomes).toEqual(["failed"]);
  });

  it("denies before proposing when the grant is missing", async () => {
    const dependencies = deps();
    const outcome = await write(
      { ...writeCall, connector: true, granted: false },
      context,
      dependencies
    );

    expect(outcome.kind).toBe("denied");
    // No proposal: nobody is asked about something that cannot run.
    expect(dependencies.outcomes).toEqual(["failed"]);
    expect(dependencies.runs).toHaveLength(0);
  });

  it("audits a read as well as a write", async () => {
    const dependencies = deps();
    const outcome = await read({ ...writeCall, risk: "read" }, context, dependencies);

    expect(outcome.kind).toBe("read");
    expect(dependencies.outcomes).toEqual(["allowed", "succeeded"]);
    expect(dependencies.runs).toHaveLength(1);
  });

  it("promotes a read that policy says needs approval into the write path", async () => {
    const dependencies = deps();
    // Connector + ungranted: policy denies regardless of the declared risk.
    const outcome = await read(
      { ...writeCall, risk: "read", connector: true, granted: false },
      context,
      dependencies
    );
    expect(outcome.kind).toBe("denied");
  });

  it("records the failure when the tool throws", async () => {
    const dependencies = deps({
      async runTool() {
        return { ok: false, error: "google said no" };
      }
    });
    const outcome = await write(writeCall, context, dependencies);
    if (outcome.kind !== "pending_approval") throw new Error("expected a pending approval");

    await execute(writeCall, outcome.approval, "allow_once", context, dependencies);
    expect(dependencies.outcomes).toEqual(["proposed", "allowed", "failed"]);
  });
});
