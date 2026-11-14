import { Hono } from "hono";

import { AuthError } from "../../services";
import type { AppContext } from "../env";

/**
 * Model passthrough.
 *
 * The browser must reach the model router, but the session cookie is
 * `__Host-edapex_session` — bound to this exact host and carrying no `Domain` —
 * so no other hostname can receive it. This route therefore terminates on
 * `api.llacademy.ng` and forwards over a service binding.
 *
 * It is deliberately **thin**: it resolves the session, stamps the caller
 * identity, and streams the response back untouched. It holds no provider
 * credential and adds no agent logic. `services/model-router` remains the only
 * process that can reach AI Gateway or read a provider key.
 *
 * The body is OpenAI-shaped but the path is EdApex's own: `/api/v1` is this API's
 * version prefix and the OpenAI-style `/v1` belongs only to `model-router`,
 * which is the surface actually impersonating a provider. Stacking them would
 * read as `/api/v1/agent/model/v1/...` and imply two independent version axes.
 */
export const agentModel = new Hono<AppContext>().post("/chat/completions", async (c) => {
  const user = c.get("user");
  if (user === null) throw new AuthError();

  const secret = c.env.MODEL_ROUTER_SECRET;
  const router = c.env.MODEL_ROUTER;
  if (router === undefined || secret === undefined || secret.length === 0) {
    return c.json(
      {
        error: {
          message: "Model routing is not configured.",
          type: "server_error",
          code: "not_configured"
        }
      },
      503
    );
  }

  const body = await c.req.text();
  // Forward only the provider selector; nothing else from the caller is relayed.
  const provider = c.get("providerSelector") ?? undefined;

  const upstream = await router.fetch("https://model-router/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: c.get("acceptHeader"),
      authorization: `Bearer ${secret}`,
      "x-edapex-user-id": String(user.id),
      // A tenant-less identity is valid: a non-school workspace still uses models.
      "x-edapex-school-id": user.schoolId === null ? "" : String(user.schoolId),
      "x-edapex-role": String(user.roleId ?? ""),
      ...(provider === undefined ? {} : { "x-edapex-provider": provider })
    },
    body
  });

  // Stream through untouched: the Rust core parses SSE, so rewriting here would
  // create a second implementation.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no"
    }
  });
});
