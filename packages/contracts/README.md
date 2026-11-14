# `@edapex/contracts`

Shared wire contracts and Zod schemas. Every type that crosses a boundary —
browser to Worker, Rust to TypeScript, Worker to Worker — is declared once here.

| | |
|---|---|
| Package | `@edapex/contracts` (library, never deployed) |
| Runtime deps | `zod` only |
| Consumed by | `apps/web`, `services/*`, `packages/chat`, `packages/genui` |

## Why it exists

The Rust core and the TypeScript clients must agree on field names exactly. When
they drift, both sides compile and the failure appears at runtime in a client.
`crates/agent/tests/contract_parity.rs` round-trips the JSON fixtures in
`fixtures/` through the Rust enum, so drift fails a test on one side or the other.

## Modules

| Entry point | Contents |
|---|---|
| `@edapex/contracts` | Everything below, re-exported |
| `/agent` | `AgentEvent` union, approval decisions, dynamic tools, `AgentError`, `AGENT_CONTRACT_VERSION` |
| `/agui` | AG-UI transport event union — the external-agent boundary |
| `/capabilities` | `CapabilityPack`/`Tool`/`Operation`, `CAPABILITY_ROLES`, `buildCapabilityManifest`, `TenantFeature`, `AgentGrant` |
| `/chat` | `ChatMessage`, `ChatMessagePart`, queue and turn state |
| `/issues` | Admin issue records |
| `/json` | `JsonValue` and its schema |
| `/platform` | Error codes and host/server capability flags |
| `/public-applications` | Resumable progressive draft — the pattern provisioning reuses |
| `/web` | Web search and fetch request schemas |

## Invariants

- **Imports must stay pure.** This package must never import server runtime code;
  it is loaded into the browser and into Workers alike.
- **Schemas are the source of truth.** Derive types with `z.infer<typeof schema>`
  rather than writing an interface beside it.
- **Strict at trust boundaries.** A schema that validates input from a client or a
  provider uses `.strict()` unless it is deliberately OpenAI-compatible, where
  unknown keys are tolerated and dropped (see `services/model-router`).
- **The capability budget is enforced here.** `validateAllRolePacks` caps packs at
  5 tools and 8 operations per tool; that is what keeps an agent's tool surface
  inside the model's reliable range.
- **Unknown roles fail closed.** A tenant-defined role with no pack entry gets
  zero tools, never the union of every pack.

## Fixtures

`fixtures/agent-events.json` is the canonical sample of every `AgentEvent`
variant. Adding a variant without a fixture fails
`crates/agent/tests/contract_parity.rs`.

## Working on it

```bash
pnpm --dir packages/contracts exec tsc --noEmit
cargo test -p edapex-agent --test contract_parity
```

Any change to a wire shape needs **both**: the TypeScript schema and, when it
crosses into Rust, the fixture plus the parity test.
