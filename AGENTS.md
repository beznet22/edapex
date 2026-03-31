# Agent Instructions

## Package Manager
Use **pnpm**: `pnpm install`, `pnpm run db:push` / `pnpm wrangler d1 migrations apply`
OR **bun**: `bun install`, `bun run db:push`

## Commit Attribution
AI commits MUST include:
```
Signed-off-by: Beznet <[EMAIL_ADDRESS]>
Co-Authored-By: Antigravity <antigravity@google.com>
```

## CLI Commands
| Task | Command |
|------|---------|
| Typecheck | `pnpm tsc --noEmit src/path/to/file.ts` |
| Edge Dev | `pnpm wrangler dev` |
| D1 Migrate | `pnpm wrangler d1 migrations apply edapex_db --local` |

## Key Conventions
- **Multi-Tenant Isolation**: Every database query MUST include a `tenant_id` filter. Composite indexes are optimized for `(tenant_id, id)`.
- **Layered Architecture**: Follow the strict `src/` hierarchy:
  - `controllers/`: Hono route handlers via `BaseController`.
  - `services/`: Business logic & AI orchestration.
  - `domain/`: `IRepository<T>` interfaces and concrete Drizzle implementations.
  - `db/`: Siloed Drizzle schemas by dialect (`mysql`, `postgres`, `sqlite`, `d1`).
- **HMAS (Hierarchical Multi-Agent System)**: Built on **Mastra AI SDK**.
  - Layers: Executive Orchestrator -> Domain Supervisors -> Task Agents.
  - All tools must be validated against JSON schemas.
- **Provider-Agnostic AI**: Define agents by capability; select provider (`workers-ai`, `openai`, etc.) at runtime based on budget/intent.
- **PBAC Security**: Evaluation happens *before* tool execution.
- **No Dual-Write**: Use polymorphic `owner_type/owner_id` constraints.

## Documentation
- See `docs/MASTER_ARCHITECTURE.md` for the technical specification.
- Per-module details in `docs/domains/`.
