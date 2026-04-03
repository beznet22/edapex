# Agent Instructions

## Package Manager
Use **pnpm**: `pnpm install`, `pnpm run db:push`, `pnpm run dev`

## Frontend Tech Stack
- **Framework**: TanStack Start (React 19)
- **Styling**: Tailwind CSS v4
- **Components**: Shadcn UI + AI Elements
- **Loading**: `boneyard-js` (Skeleton screens)

## Commit Attribution
AI commits MUST include:
```
Signed-off-by: Beznet <[EMAIL_ADDRESS]>
Co-Authored-By: Antigravity <antigravity@google.com>
```

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `pnpm tsc --noEmit src/path/to/file.ts` |
| Lint | `pnpm eslint src/path/to/file.ts` |
| Format | `pnpm prettier --write src/path/to/file.ts` |
| Test | `pnpm vitest run src/path/to/file.test.ts` |

## CLI Commands
| Task | Command |
|------|---------|
| Edge Dev | `pnpm wrangler dev src/server.ts` |
| D1 Migrate | `pnpm wrangler d1 migrations apply edapex_db --local` |
| Drizzle Push | `pnpm run db:push` |

## Key Conventions
- **Multi-Tenant Isolation**: Every database query MUST include a `tenant_id` filter.
- **Layered Arch**: Follow `src/` hierarchy (`controllers/`, `services/`, `domain/`, `db/`).
- **HMAS**: Mastra AI SDK orchestration (Executive -> Domain Supervisors -> Task Agents).
- **Provider-Agnostic AI**: Define capabilities; pick provider (`workers-ai`, `openai`) at runtime.
- **PBAC Security**: Evaluation happens *before* tool execution.
- **Agentic Classroom**: Domain 18 logic lives in `domain-classroom`. Respect edge execution constraints (stateless memory ledgers).
- **UI Skeletons (Boneyard)**: Use `boneyard-js` for pixel-perfect skeleton screens in all high-density views.

## Documentation
- see `docs/AGENTIC_SCHOOL_V2_PLAN.md` for the low-level technical specification.
- See `docs/MASTER_ARCHITECTURE.md` for architectural overview.
- See `docs/domains/` for 18-domain module details.
