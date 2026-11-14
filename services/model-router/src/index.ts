import { Hono } from "hono";

import {
  isIdentityFailure,
  resolveCaller,
  type Caller,
  type IdentityFailure
} from "./identity";
import { ALLOWED_MODELS, byokAliasFor, gatewayTarget, type ProviderId } from "./policy";
import {
  chatRequestSchema,
  errorBody,
  toProviderBody,
  validateChatRequest
} from "./schema";

export interface ModelRouterEnv {
  readonly CF_ACCOUNT_ID: string;
  readonly AI_GATEWAY_ID: string;
  /** Shared secret proving the caller is an EdApex Worker. */
  readonly CALLER_SECRET?: string;
  /** Authorises requests to AI Gateway. The provider key lives in BYOK. */
  readonly CF_AIG_TOKEN?: string;
}

type Variables = { caller: Caller };

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

/**
 * Failures use the OpenAI error envelope.
 *
 * The endpoint is OpenAI-compatible, so an SDK that retries or surfaces a
 * provider error must be able to read the shape it already understands.
 */
const failure = (message: string, code: string, status: number): Response =>
  json(
    errorBody(
      message,
      code,
      status === 401 || status === 403
        ? "authentication_error"
        : status >= 500
          ? "server_error"
          : "invalid_request_error"
    ),
    status
  );

export const app = new Hono<{ Bindings: ModelRouterEnv; Variables: Variables }>()
  .get("/health", (c) =>
    json(
      {
        status: "ok",
        gateway: c.env.AI_GATEWAY_ID,
        configured:
          typeof c.env.CF_AIG_TOKEN === "string" &&
          c.env.CF_AIG_TOKEN.length > 0 &&
          typeof c.env.CF_ACCOUNT_ID === "string" &&
          c.env.CF_ACCOUNT_ID.length > 0
      },
      200
    )
  )

  /**
   * The model list, in OpenAI format.
   *
   * Returns the allowlist rather than everything the gateway can reach, so a
   * caller only discovers what it is permitted to use.
   */
  .get("/v1/models", () =>
    json(
      {
        object: "list",
        data: ALLOWED_MODELS.map((id) => ({
          id,
          object: "model",
          owned_by: "edapex"
        }))
      },
      200
    )
  )

  /**
   * Stream a chat completion.
   *
   * The response is passed through byte for byte. Parsing happens in the Rust
   * core (`crates/agent`), so there is exactly one SSE implementation across
   * desktop, mobile and the browser.
   */
  .post("/v1/chat/completions", async (c) => {
    const identity: Caller | IdentityFailure = resolveCaller(
      c.req.raw.headers,
      c.env.CALLER_SECRET
    );
    if (isIdentityFailure(identity)) {
      return failure(identity.message, "invalid_api_key", identity.status);
    }

    const accountId = c.env.CF_ACCOUNT_ID;
    const gatewayId = c.env.AI_GATEWAY_ID;
    const token = c.env.CF_AIG_TOKEN;
    if (
      accountId.length === 0 ||
      gatewayId.length === 0 ||
      token === undefined ||
      token.length === 0
    ) {
      return failure("The model router is not configured.", "not_configured", 503);
    }

    const provider = parseProvider(c.req.raw.headers.get("x-edapex-provider"));
    if (provider === null) {
      return failure("Unsupported model provider.", "invalid_provider", 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return failure("The request body is not valid JSON.", "invalid_json", 400);
    }

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure("The request is not a valid chat completion request.", "invalid_request", 400);
    }

    const invalid = validateChatRequest(parsed.data);
    if (invalid !== null) {
      return failure(
        invalid.message,
        invalid.code,
        invalid.code === "model_not_allowed" ? 403 : 400
      );
    }

    const target = gatewayTarget({
      accountId,
      gatewayId,
      provider,
      path: "/chat/completions",
      token,
      byokAlias: byokAliasFor(identity.schoolId)
    });

    let upstream: Response;
    try {
      upstream = await fetch(target.url, {
        method: "POST",
        headers: {
          ...target.headers,
          "content-type": "application/json",
          // A stream must not be buffered by an intermediary.
          accept: "text/event-stream"
        },
        body: JSON.stringify(toProviderBody(parsed.data, parsed.data.model))
      });
    } catch (cause) {
      return failure(
        cause instanceof Error ? cause.message : "The model provider is unreachable.",
        "provider_unreachable",
        502
      );
    }

    if (!upstream.ok) {
      // Read a bounded excerpt so a provider error page cannot flood the client.
      const text = (await upstream.text().catch(() => "")).slice(0, 500);
      return failure(
        text.length > 0 ? text : `The model provider returned ${upstream.status}.`,
        "provider_error",
        upstream.status === 401 || upstream.status === 403 ? 401 : 502
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no"
      }
    });
  })

  .notFound(() => failure("Unknown route.", "not_found", 404))

  .onError((error) => {
    // Never echo an internal message: it can contain provider detail.
    console.error("model-router failure", error instanceof Error ? error.message : "unknown");
    return failure("The model router failed.", "internal_error", 500);
  });

function parseProvider(value: string | null): ProviderId | null {
  if (value === null) return "openrouter";
  if (value === "openrouter" || value === "anthropic" || value === "openai" || value === "google") {
    return value;
  }
  return null;
}
