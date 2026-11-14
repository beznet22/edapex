# EdApex — Model Router

The model routing and policy service on Cloudflare Workers. This directory is a
**deployable, UI-less backend**. It is the only process that holds a provider
credential, and it has **no public hostname** — it is reached exclusively by
`services/cowork-api` over a service binding.

| | |
|---|---|
| Workers | `edapex-model-router` |
| Entry | `src/worker.ts` → `src/index.ts` |
| Calls | Cloudflare AI Gateway (direct provider passthrough) |
| Called by | `services/cowork-api` (service binding only) |
| Tests | `tests/policy.test.ts` |

## Why this is a separate Worker

A Worker's bindings are readable by every route inside it. If the provider
credential lived in `sms-api`, every school endpoint — mark entry, admissions,
parent portals — would run in a process that can read it. Keeping it here means
the **only** code that can reach a provider key is a stateless pipe that stores
nothing.

It is also the enforcement point for a guarantee a browser cannot be trusted to
keep: AI Gateway stores prompt and response bodies **by default**, and prompts in
this product contain marksheet OCR text and parent conversations. Every request
carries `cf-aig-collect-log: false`, which is only possible because the browser
never talks to the gateway itself.

## Reachability

| Setting | Value | Why |
|---|---|---|
| `routes` | *(none)* | No hostname to discover or attack |
| `workers_dev` | `false` | Not addressable from the internet |
| Callers | `cowork-api` via service binding | Cloudflare-authenticated, not a shared network |

A service binding proves the *Worker*, not the *person*, and the model budget
belongs to a school. Every request therefore carries a shared secret plus an
identity that `cowork-api` supplies only after validating the session cookie
against `sms-api`. This Worker never parses a cookie and never touches D1, so it
cannot be talked into authenticating anyone.

## Policy

All of it lives in `src/policy.ts` and `src/schema.ts`, and each rule has a test.

| Rule | Detail |
|---|---|
| Logging | `cf-aig-collect-log: false` on every request. Non-negotiable. |
| Passthrough | Direct provider URL (`/{provider}/chat/completions`). **Never** the Unified Billing path — there a missing BYOK key falls through to Cloudflare billing. |
| Tenant key | `cf-aig-byok-alias: school-<id>` selects the tenant's stored key; `default` when none is configured. |
| Models | Explicit allowlist. A model name reaches a third party, and a typo is a billed request to an unexpected model. |
| Caps | `maxOutputTokens`, `maxInputChars`, `maxMessages`, `maxTools` in `REQUEST_LIMITS`. |
| Body | OpenAI Chat Completions. Unknown keys are **dropped, not rejected** — real clients send `seed`/`logprobs`/penalties — but the body sent upstream is rebuilt from validated fields only, so nothing unvalidated is forwarded. |
| Streaming | Forced `stream: true`. The core consumes SSE, and a buffered reply would break the UI. |
| Callers | `crates/agent-wasm` (browser) and the Tauri host both send OpenAI-shaped bodies — `tool_calls` / `tool_call_id` in `snake_case`, with tool calls wrapped in `function`. See `crates/agent/README.md`. |
| Decisions | An unrecognised approval string fails closed to `Deny`. |

## Secrets

Set outside git:

```bash
pnpm exec wrangler secret put CF_AIG_TOKEN      # authorises the request to AI Gateway
pnpm exec wrangler secret put CALLER_SECRET     # shared with cowork-api
```

Provider keys are **not** held here. They live in AI Gateway via BYOK (Secrets
Store) and are referenced by alias. `wrangler.jsonc` also needs `CF_ACCOUNT_ID`
and `AI_GATEWAY_ID` set as vars.

## Quickstart

```bash
# typecheck
pnpm exec tsc --noEmit

# regenerate Worker types after editing wrangler.jsonc
pnpm exec wrangler types

# tests
pnpm exec vitest run

# local Worker (reached through cowork-api's binding, not the browser)
pnpm exec wrangler dev
```

## Layout

| Path | Contents |
|---|---|
| `src/worker.ts` | Worker entry |
| `src/index.ts` | Hono app: `/health`, `GET /v1/models`, `POST /v1/chat/completions` |
| `src/policy.ts` | Gateway URL, logging, BYOK alias, model allowlist, caps |
| `src/schema.ts` | OpenAI request schema, provider body mapping, error envelope |
| `src/identity.ts` | Bearer token + forwarded identity, constant-time compare |
| `tests/policy.test.ts` | Policy and identity tests |

## Routes

| Route | Purpose |
|---|---|
| `GET /health` | Reports gateway config presence. Never reports key material. |
| `GET /v1/models` | The model allowlist, in OpenAI list format. |
| `POST /v1/chat/completions` | Validates, then streams the provider response byte for byte. |

SSE parsing is **not** done here. The response is passed through untouched and
parsed by `crates/agent`, so desktop, mobile and the browser share exactly one
implementation.

## OpenAI compatibility

The endpoint speaks the OpenAI Chat Completions wire format, deliberately:

- **The caller already speaks it.** `crates/agent` parses OpenAI SSE, and its
  `ProviderRequestWire` is OpenAI-shaped. Using the format natively removes a
  translation layer that would otherwise need to be kept in sync.
- **Any OpenAI SDK can exercise it** during development, with no special client.
- **Errors use the OpenAI envelope** — `{"error": {message, type, code}}` — so an
  SDK's retry and error handling work unchanged.

Auth is `Authorization: Bearer <CALLER_SECRET>`. The forwarded identity
(`x-edapex-user-id`, `x-edapex-school-id`, `x-edapex-role`) is set by
`cowork-api`, never by a browser.

One consequence worth knowing: unknown top-level body keys are **tolerated and
dropped**, not rejected, because real OpenAI clients send `seed`, `logprobs`,
`presence_penalty` and others. Safety comes from rebuilding the upstream body
from validated fields only, not from refusing the request.

OpenAI-compatible describes the **wire format, not reachability** — there is
still no public hostname.

## Target feature set

The destination is the freellmapi feature set — routing strategies, failover
with cooldowns, unified model entries, per-key quota tracking, a self-updating
catalog, and an admin dashboard. Today this service implements the policy
foundation only; routing lands in a later chunk.

**Supply is deliberately narrower than freellmapi.** Free-tier stacking is not
part of v1: a school workspace must not depend on accounts a provider can ban
without notice. Free pools remain an operator-enabled upstream, off by default.

### A constraint worth knowing before extending this

Workers Free allows Durable Objects, but only with SQLite storage and a
**100,000 rows-written/day** cap. Per-request quota counters written to storage
would exhaust that at a few hundred turns a day. Counters must live in Durable
Object memory and checkpoint on an interval — never one write per token, and
preferably not one per request.

## Before opening a PR

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

Every policy rule that protects a tenant — logging suppression, passthrough
choice, allowlist, tenant alias, fail-closed decisions — must keep a test.
