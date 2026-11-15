# EdApex

An agentic school operations platform, plus the cowork workspace that runs its
agents.

This repository is mid-migration and holds **two systems**. Which one you are
looking at matters:

| Path | What | Status |
|---|---|---|
| [`legacy/`](legacy/) | SvelteKit + Mastra monolith | **Serves production today.** See [`legacy/README.md`](legacy/README.md) |
| [`apps/web`](apps/web/) | Workspace web app (vinext + React) | The replacement surface |
| [`apps/desktop`](apps/desktop/) | Tauri desktop and mobile shell | New |
| [`services/`](services/) | `sms-api`, `cowork-api`, `model-router` | Cloudflare Workers |
| [`packages/`](packages/) | Shared TypeScript contracts and UI | New |
| [`crates/`](crates/) | Rust agent core, local store, OCR | New |
| [`docs/`](docs/) | Specs and research | New |

Working agreements for each tree: [`AGENTS.md`](AGENTS.md) at the root for the new
system, [`legacy/AGENTS.md`](legacy/AGENTS.md) for the app in production.

## Quick start

```bash
pnpm install
pnpm --dir apps/web dev          # workspace on :5181
pnpm --dir legacy dev            # legacy app on :5173
```

`legacy/` is a standalone pnpm project with its own lockfile; a root install does
not touch it.

## Authority

- [`docs/cloudflare-port/`](docs/cloudflare-port/) — the backend port: schema,
  auth, D1/R2, cutover.
- [`docs/workspace/specs/`](docs/workspace/specs/) — UI, the local agent, storage and
  sync, deployment boundaries.
- [`DESIGN.md`](DESIGN.md) — the design system, machine-checked in CI.

A document that contradicts a spec is a bug in the document.

## Verification

```bash
pnpm --dir apps/web run check
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test
pnpm --dir services/sms-api run typecheck && pnpm --dir services/sms-api test
pnpm --dir services/cowork-api run typecheck && pnpm --dir services/cowork-api test
cargo test -p edapex-agent -p edapex-store
node scripts/check-agent-size.mjs
```
