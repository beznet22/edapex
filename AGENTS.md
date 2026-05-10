# Agent Instructions

## Package Manager & Scripts
Use **bun**: `bun install`, `bun run dev`, `bun run build`.

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: AI Agent <noreply@example.com>
```

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `bun run svelte-check --workspace path/to/file.svelte` |
| Lint | `bun run lint path/to/file.ts` |
| Test | `bun test path/to/file.test.ts` |

## Key Conventions (EdApex Mastra Migration)
- **Architecture**: Modular monolith using Svelte 5 and Mastra AI Framework. Never create global singletons.
- **Isolation Boundaries**: Always bind queries and AI agents to the active `TenantContext` (`classId`, `schoolId`). Use Drizzle ORM.
- **Sovereign Storage**: Legacy MySQL `ai_` tables are deprecated. Mastra memory, configurations, and states run natively on `libSQL` (`mastra.db`).
- **UI/UX Guidelines**: Adhere to the robust 4-panel "Hermes" layout. Utilize "Gold on Slate" `oklch` tokens and shadcn-svelte.
- **Safety**: Apply `.omit()` on Zod schema mutations to prevent mass-assignment. Supervised LLM intents must reach a 90% confidence threshold to execute state mutations. See `docs/agent_migration_prompt.md`.

## MCP Usage (Svelte 5 / SvelteKit)
- Run `list-sections` FIRST for new frontend topics.
- Run `get-documentation` based on `use_cases`.
- Run `svelte-autofixer` repeatedly until all Svelte specific issues resolve cleanly before submitting code.
