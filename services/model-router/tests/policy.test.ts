import { describe, expect, it } from "vitest";

import {
  ALLOWED_MODELS,
  byokAliasFor,
  gatewayTarget,
  isModelAllowed,
  isProviderId,
  REQUEST_LIMITS
} from "../src/policy";
import { callerHeaders, resolveCaller, isIdentityFailure } from "../src/identity";
import {
  chatRequestSchema,
  errorBody,
  toProviderBody,
  validateChatRequest
} from "../src/schema";

const TARGET = {
  accountId: "acct",
  gatewayId: "edapex",
  provider: "openrouter" as const,
  path: "/chat/completions",
  token: "gw-token",
  byokAlias: "school-42"
};

describe("gateway target", () => {
  it("always suppresses log collection", () => {
    const target = gatewayTarget(TARGET);
    // Prompts carry school records; this header must never be omitted.
    expect(target.headers["cf-aig-collect-log"]).toBe("false");
  });

  it("suppresses logging even when no tenant key is configured", () => {
    const target = gatewayTarget({ ...TARGET, byokAlias: null });
    expect(target.headers["cf-aig-collect-log"]).toBe("false");
    expect(target.headers["cf-aig-byok-alias"]).toBeUndefined();
  });

  it("uses direct provider passthrough, never Unified Billing", () => {
    const target = gatewayTarget(TARGET);
    // A Unified Billing path would fall through to Cloudflare billing when the
    // BYOK key is missing. Passthrough requires the stored key instead.
    expect(target.url).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/edapex/openrouter/chat/completions"
    );
    expect(target.url).not.toContain("/ai/v1");
  });

  it("selects the tenant key by alias", () => {
    expect(gatewayTarget(TARGET).headers["cf-aig-byok-alias"]).toBe("school-42");
  });

  it("maps a school to a stable alias and no school to none", () => {
    expect(byokAliasFor(42)).toBe("school-42");
    expect(byokAliasFor(null)).toBeNull();
    expect(byokAliasFor(0)).toBeNull();
    expect(byokAliasFor(-1)).toBeNull();
    expect(byokAliasFor(1.5)).toBeNull();
  });

  it("rejects unknown providers", () => {
    expect(isProviderId("openrouter")).toBe(true);
    expect(isProviderId("not-a-provider")).toBe(false);
  });
});

describe("caller identity", () => {
  const SECRET = "shared-secret";

  it("accepts a caller presenting the shared secret", () => {
    const headers = new Headers(callerHeaders({ userId: 7, schoolId: 3, role: "admin" }, SECRET));
    const caller = resolveCaller(headers, SECRET);
    expect(isIdentityFailure(caller)).toBe(false);
    expect(caller).toEqual({ userId: 7, schoolId: 3, role: "admin" });
  });

  it("rejects a wrong secret", () => {
    const headers = new Headers(callerHeaders({ userId: 7, schoolId: 3, role: "admin" }, "wrong"));
    const caller = resolveCaller(headers, SECRET);
    expect(isIdentityFailure(caller) && caller.status).toBe(401);
  });

  it("accepts the bearer scheme case-insensitively", () => {
    const headers = new Headers(callerHeaders({ userId: 7, schoolId: 3, role: "admin" }, SECRET));
    headers.set("authorization", `bEaReR   ${SECRET}`);
    expect(isIdentityFailure(resolveCaller(headers, SECRET))).toBe(false);
  });

  it("rejects a token sent without the bearer scheme", () => {
    const headers = new Headers(callerHeaders({ userId: 7, schoolId: 3, role: "admin" }, SECRET));
    headers.set("authorization", SECRET);
    expect(isIdentityFailure(resolveCaller(headers, SECRET))).toBe(true);
  });

  it("rejects a missing secret header", () => {
    const caller = resolveCaller(new Headers(), SECRET);
    expect(isIdentityFailure(caller) && caller.status).toBe(401);
  });

  it("fails closed when the worker secret is unconfigured", () => {
    const headers = new Headers(callerHeaders({ userId: 7, schoolId: 3, role: "admin" }, ""));
    const caller = resolveCaller(headers, undefined);
    expect(isIdentityFailure(caller) && caller.status).toBe(401);
  });

  it("rejects a non-numeric user id", () => {
    const headers = new Headers({
      ...callerHeaders({ userId: 1, schoolId: 1, role: "admin" }, SECRET),
      "x-edapex-user-id": "abc"
    });
    const caller = resolveCaller(headers, SECRET);
    expect(isIdentityFailure(caller)).toBe(true);
  });

  it("allows a tenant-less caller so a zero-pack tenant can use the model", () => {
    const headers = new Headers(callerHeaders({ userId: 9, schoolId: null, role: "member" }, SECRET));
    const caller = resolveCaller(headers, SECRET);
    expect(isIdentityFailure(caller)).toBe(false);
    expect(caller).toEqual({ userId: 9, schoolId: null, role: "member" });
  });
});

describe("request validation", () => {
  const base = {
    model: "openrouter/auto",
    messages: [{ role: "user" as const, content: "hello" }]
  };

  it("accepts an allowlisted model", () => {
    expect(validateChatRequest(chatRequestSchema.parse(base))).toBeNull();
  });

  it("rejects a model outside the allowlist", () => {
    const parsed = chatRequestSchema.parse({ ...base, model: "someone/expensive" });
    const failure = validateChatRequest(parsed);
    expect(failure?.code).toBe("model_not_allowed");
    expect(isModelAllowed("someone/expensive")).toBe(false);
  });

  it("tolerates unknown OpenAI keys but does not forward them", () => {
    const parsed = chatRequestSchema.parse({
      ...base,
      seed: 42,
      logprobs: true,
      presence_penalty: 0.5
    });
    const body = toProviderBody(parsed, base.model);
    // Accepted by the schema so real OpenAI clients work, stripped before the
    // provider sees them so policy stays in control.
    expect("seed" in body).toBe(false);
    expect("logprobs" in body).toBe(false);
    expect("presence_penalty" in body).toBe(false);
  });

  it("forces streaming even when the caller asks otherwise", () => {
    const parsed = chatRequestSchema.parse({ ...base, stream: false });
    expect(toProviderBody(parsed, base.model).stream).toBe(true);
  });

  it("rejects an over-long conversation", () => {
    const parsed = chatRequestSchema.parse({
      ...base,
      messages: [{ role: "user", content: "x".repeat(REQUEST_LIMITS.maxInputChars + 1) }]
    });
    expect(validateChatRequest(parsed)?.code).toBe("invalid_input");
  });

  it("caps output tokens regardless of caller input", () => {
    const body = toProviderBody(chatRequestSchema.parse(base), base.model);
    expect(body.max_tokens).toBe(REQUEST_LIMITS.maxOutputTokens);
    expect(body.stream).toBe(true);
  });

  it("omits tools when none are offered", () => {
    const body = toProviderBody(chatRequestSchema.parse(base), base.model);
    expect("tools" in body).toBe(false);
  });

  it("builds an OpenAI error envelope", () => {
    const body = errorBody("nope", "invalid_request", "invalid_request_error");
    expect(body).toEqual({
      error: { message: "nope", code: "invalid_request", type: "invalid_request_error" }
    });
  });

  it("passes tool calls through in OpenAI shape", () => {
    const parsed = chatRequestSchema.parse({
      ...base,
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c1", function: { name: "web_search", arguments: "{}" } }]
        }
      ]
    });
    const body = toProviderBody(parsed, base.model);
    const messages = body.messages as readonly Record<string, unknown>[];
    expect(messages[0]?.tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "web_search", arguments: "{}" } }
    ]);
  });

  it("counts tool arguments toward the input cap", () => {
    const parsed = chatRequestSchema.parse({
      ...base,
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "c1", function: { name: "web_fetch", arguments: "x".repeat(REQUEST_LIMITS.maxInputChars + 1) } }
          ]
        }
      ]
    });
    expect(validateChatRequest(parsed)?.code).toBe("invalid_input");
  });

  it("publishes a non-empty allowlist", () => {
    expect(ALLOWED_MODELS.length).toBeGreaterThan(0);
    expect(ALLOWED_MODELS).toContain("openrouter/auto");
  });
});
