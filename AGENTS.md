# Agent Instructions

## Package Manager & Scripts
Use **pnpm**: `pnpm install`, `pnpm run dev`, `pnpm run build`.
Use `pnx` or Aliases: `pnpm dlx`, `pnpx` to run any package or script that is not installed globally. 
Do not assume any package or script is installed globally.


## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `pnpm run svelte-check --workspace path/to/file.svelte` |
| Lint | `pnpm run lint path/to/file.ts` |

## Key Conventions (EdApex Mastra Migration)
- **Architecture**: Modular monolith using Svelte 5 and Mastra AI Framework. Never create global singletons.
- **Isolation Boundaries**: Always bind queries and AI agents to the active `TenantContext` (`classId`, `schoolId`). Use Drizzle ORM.
- **Sovereign Storage**: Legacy MySQL `ai_` tables are deprecated. Mastra memory, configurations, and states run natively on `libSQL` (`mastra.db`).
- **Tool Organization**: Tools live in `src/lib/server/mastra/tools/operations/<group>/` where group is one of `context`, `read`, `write`, `destructive`, `reporting`, `parent`. Each group has an `index.ts` re-export. Shared utilities (e.g. `context-tool`, `choose-document`, `tinyfish-client`, `selection-tools`) live in `src/lib/server/mastra/tools/internal/`.
- **Marksheet Schema**: Use `marksheetSchema` and `Marksheet` from `src/lib/schema/marksheet.ts`. Persist validated marksheets via `AssessmentService.upsertMarksheet(marksheet: Marksheet, staffId: number): Promise<Marksheet>`.
- **ActionBar Architecture**: `src/lib/components/ai-elements/ActionBar.svelte` is the unified action-required surface rendered above `ChatComposer`. It handles tool approvals, option selection, ambiguity Q&A, and workflow resume — one component for every "user must decide" moment.
- **Skills**: Domain skills live in `src/lib/server/mastra/skills/<name>.skill.md` — `default`, `assistant`, `read`, `write`, `destructive`, `academic`, `reporting`, `parent` (one per operation group plus `default` and `assistant`).
- **UI/UX Guidelines**: Adhere to the design system defined in `src/routes/layout.css`. Utilize "Gold on Slate" `oklch` tokens and shadcn-svelte components in `src/lib/components/ui/*`, `src/lib/components/ai-elements/*` and `src/lib/components/prompt-kit/*`. All UI updates, style and design must conform to `src/routes/layout.css`. Do not change `src/routes/layout.css`.
- **Device Responsiveness Guidelines**: Adhere to the responsive design guidelines defined in `docs/responsive_design.md`.
- **Safety**: Apply `.omit()` on Zod schema mutations to prevent mass-assignment. Supervised LLM intents must reach a 90% confidence threshold to execute state mutations. See `docs/agent_migration_prompt.md`.

# Code Quality Constraints (NON-NEGOTIABLE)
- **Absolute Production Readiness**: You must write complete, production-ready code. 
- **No Placeholders**: Never write logic like `// implementation goes here` or `// TODO: add validation`. You must execute the full implementation.
- **No Instructional Comments**: Do not riddle the codebase with comments explaining what the code is doing (e.g., `// This function fetches users`). Only comment on complex business logic tradeoffs (e.g., `// Debounced by 500ms to allow bulk Svelte reactivity batches to flush`).
- **Complete End-to-End**: If a task requires modifying an interface, writing a repository method, and exposing it via a Server Action, you must fully complete all three. Leaving tasks half-finished is a failure of your mission.

## TypeScript Type Safety (NON-NEGOTIABLE)

Every line of TypeScript must be **fully type-safe**. Loose types erode correctness silently and are forbidden.

### Banned Types
| Type | Why | Use Instead |
|------|-----|-------------|
| `any` | Disables all type checking | A concrete type, generic `<T>`, or `unknown` with a type guard |
| `never` (as annotation) | Masks unreachable logic bugs | Exhaustive `switch` returns; let TS infer `never` |
| `unknown` (raw) | Defers safety to runtime without a guard | `unknown` + an immediate type guard / assertion function |
| `object` | Too broad; allows any non-primitive | A specific interface or `Record<string, V>` |
| `Function` | Untyped callable | `(...args: A) => R` with explicit params and return |
| `{}` | Matches any non-nullish value | A named interface or `Record<string, unknown>` |

### Required Practices
- **Utility types over manual rewriting**: Use `Omit<T, K>`, `Pick<T, K>`, `Partial<T>`, `Required<T>`, and `Readonly<T>` to derive types from a single source of truth.
- **Infer from Zod schemas**: Derive runtime types with `z.infer<typeof schema>` instead of duplicating interfaces.
- **Explicit return types on exported functions**: Every exported function, server action, and API handler must declare its return type.
- **Const assertions for literals**: Use `as const` for fixed string unions, config objects, and enum-like values.
- **Strict generics**: Generic functions must constrain type params (`<T extends Base>`) — never use bare `<T>` when a bound exists.
- **No type assertions (`as`)**: Avoid `as Type` casts. Use type guards (`is`), assertion functions (`asserts x is T`), or `satisfies` instead. The only exception is `as const`.
- **Discriminated unions for variants**: Model mutually exclusive states with tagged unions (`{ kind: 'a'; ... } | { kind: 'b'; ... }`) — never optional fields that are "sometimes present."
- **Index signatures must be narrow**: Prefer `Record<SpecificKey, V>` over `Record<string, V>`. If a dynamic key is unavoidable, the value type must not be `any`.
- **Event handlers**: Type event callbacks with the framework's event type (e.g., `FormEventHandler<HTMLInputElement>`, SvelteKit `RequestEvent`) — never `(e: any) => void`.
- **Error handling**: Catch blocks must narrow `unknown` immediately: `if (err instanceof AppError)` or a type guard. Never cast `catch (e: any)`.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix the underlying type issue. If a third-party type is genuinely wrong, wrap it in a thin typed adapter and document why.

### Verification
Run `pnpm run svelte-check --workspace path/to/file.svelte` and `pnpm run lint path/to/file.ts` after every change. Zero type errors is the only acceptable state.

## MCP Usage (Svelte 5 / SvelteKit)
- Run `list-sections` FIRST for new frontend topics.
- Run `get-documentation` based on `use_cases`.
- Run `svelte-autofixer` repeatedly until all Svelte specific issues resolve cleanly before submitting code.
