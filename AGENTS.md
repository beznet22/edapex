# Agent Instructions

## Package Manager & Scripts
Use **pnpm**: `pnpm install`, `pnpm run dev`, `pnpm run build`.
Use `pnx` or Aliases: `pnpm dlx`, `pnpx` to run any package or script that is not installed globally. 
Do not assume any package or script is installed globally.



## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: Beznet AI <[EMAIL_ADDRESS]>
```

## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `pnpm run svelte-check --workspace path/to/file.svelte` |
| Lint | `pnpm run lint path/to/file.ts` |
| Test | `pnpm test path/to/file.test.ts` |

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
