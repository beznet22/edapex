# API, Validation, & PBAC (Edge-Gateway)

Direct interaction with edge traffic and security evaluation, guided by `api-design-principles` and `api-patterns`.

## 1. Zod Exclusivity
- **Validator Authority**: All Hono controllers MUST parse incoming payloads via Zod before touching a Service.
- **Tool Output schemas**: Every Mastra tool MUST have a defined Zod output schema to ensure API response consistency.

## 2. Hono RPC (Standard Responses)
- **BaseController**: Use `BaseController.sendSuccess` and `BaseController.sendError` for unified envelopes.
- **Error Anonymization**: No database tracebacks or stack traces can leak to the client.

## 3. PBAC Evaluation
- **Pre-execution evaluation**: Evaluation happens at the Gateway/Middleware layer *before* the service fires.
- **Context injection**: Resolve `tenant_id` and `actor_id` early. Inject into Hono `Context`.
- **Policy DSL**: Use the DSL defined in `docs/domains/pbac.md`.

## 4. Contextual Configuration
- **Cloudflare Bindings**: Map Environment variables and KV/D1 bindings to the Hono `c.env` type.
- **Config Singleton**: Application code only uses `src/config/index.ts`.

