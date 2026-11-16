# Agent Instructions — legacy app

The SvelteKit + Mastra monolith that **serves production today**. It lives in
`legacy/` so that the new system can be built alongside it without either one
inheriting the other's configuration.

**Shared rules live at [`../AGENTS.md`](../AGENTS.md).** Read that first: the
non-negotiable code-quality and TypeScript rules apply here unchanged, and they are
not duplicated in this file so the two cannot drift apart.

## Status

This tree is in **maintenance only**. It accepts fixes that keep production working.
It does not accept restructuring, new features, or migrations — those belong to the
new system. A change that has to touch both trees is a migration step; say so.

## Package Manager & Scripts

`legacy/` is its own pnpm project: it has a `pnpm-workspace.yaml` with no members and
its own `pnpm-lock.yaml`, so it does **not** participate in the repository workspace
and has no `@edapex/*` dependency.

```bash
pnpm --dir legacy install --frozen-lockfile
pnpm --dir legacy run dev
pnpm --dir legacy run build
```

Scripts shared with the new system (for example `scripts/check-agent-size.mjs`) live
at the repository root and are referenced with `../scripts/`. Legacy-only tooling
lives in `legacy/scripts/`.

## File-Scoped Commands

| Task | Command |
|---|---|
| Typecheck | `pnpm --dir legacy run svelte-check --workspace path/to/file.svelte` |
| Lint | `pnpm --dir legacy run lint path/to/file.ts` |

## Key Conventions (EdApex Mastra Migration)

- **Architecture**: Modular monolith using Svelte 5 and the Mastra AI Framework.
  Never create global singletons.
- **Isolation Boundaries**: Always bind queries and AI agents to the active
  `TenantContext` (`classId`, `schoolId`). Use Drizzle ORM.
- **Sovereign Storage**: Legacy MySQL `ai_` tables are deprecated. Mastra memory,
  configurations and states run natively on `libSQL` (`mastra.db`).
- **Tool Organization**: Tools live in `src/lib/server/mastra/tools/operations/<group>/`
  where group is one of `context`, `read`, `write`, `destructive`, `reporting`,
  `parent`. Each group has an `index.ts` re-export. Shared utilities (e.g.
  `context-tool`, `choose-document`, `tinyfish-client`, `selection-tools`) live in
  `src/lib/server/mastra/tools/internal/`.
- **Marksheet Schema**: Use `marksheetSchema` and `Marksheet` from
  `src/lib/schema/marksheet.ts`. Persist validated marksheets via
  `AssessmentService.upsertMarksheet(marksheet: Marksheet, staffId: number):
  Promise<Marksheet>`.
- **ActionBar Architecture**: `src/lib/components/ai-elements/ActionBar.svelte` is the
  unified action-required surface rendered above `ChatComposer`. It handles tool
  approvals, option selection, ambiguity Q&A and workflow resume — one component for
  every "user must decide" moment.
- **Skills**: Domain skills live in
  `src/lib/server/mastra/skills/<name>.skill.md` — `default`, `assistant`, `read`,
  `write`, `destructive`, `academic`, `reporting`, `parent` (one per operation group
  plus `default` and `assistant`).
- **UI/UX Guidelines**: The design system for this tree is `src/routes/layout.css`,
  with "Gold on Slate" `oklch` tokens and shadcn-svelte components in
  `src/lib/components/ui/*`, `src/lib/components/ai-elements/*` and
  `src/lib/components/prompt-kit/*`.
  **`src/routes/layout.css` is not the design authority for `apps/web`** — that app
  has its own tokens in `apps/web/app/globals.css` and its own spec
  (`docs/workspace/specs/19-design-system.md`). Do not change either file's tokens
  without a spec amendment.
- **Device Responsiveness Guidelines**: Follow
  [`../docs/responsive_design.md`](../docs/responsive_design.md).
- **Safety**: Apply `.omit()` on Zod schema mutations to prevent mass-assignment.
  Supervised LLM intents must reach a 90% confidence threshold to execute state
  mutations. See [`../docs/workspace/specs/60-security-privacy.md`](../docs/workspace/specs/60-security-privacy.md).

## MCP Usage (Svelte 5 / SvelteKit)

- Run `list-sections` FIRST for new frontend topics.
- Run `get-documentation` based on `use_cases`.
- Run `svelte-autofixer` repeatedly until every Svelte-specific issue resolves
  cleanly before submitting code.

## Verification

```bash
pnpm --dir legacy run check     # svelte-kit sync && svelte-check
pnpm --dir legacy run build     # the artifact the Docker image ships
```

The production build needs `TELEGRAM_BOT_TOKEN` and `MASTRA_DB_URL` because postbuild
analysis imports server modules that validate at module scope. The Dockerfile's
builder stage and `.github/workflows/legacy.yml` both supply placeholders; a bare
`pnpm run build` in a shell without them may fail for that reason rather than a code
fault.

Deployment: `.github/workflows/docker.yml` builds `legacy/Dockerfile` on a push to
`main` and pushes the image to GHCR, then tags it to trigger Dokploy.
