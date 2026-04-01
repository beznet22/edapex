# Multi-Agent Brainstorming Protocol

As strictly governed by the `multi-agent-brainstorming` skill logic, you MUST simulate a structured review loop internally before writing any code that applies a new domain or architectural feature into the workspace.

## The Review Simulation
You are forbidden from moving linearly from user prompt to code. You must write an implementation plan (in your working memory or an artifact) and run it through these internal "virtual agents":

1. **Primary Designer**: Draft the initial implementation plan (e.g., "I will add a `transport` table, a `TransportService`, and a `TanStack DB` collection").
2. **Skeptic / API Guardian**: Challenge the plan aggressively. 
   - *"Does the API definition leak the database schema? Do we have Zod validators for the `POST` payload?"*
   - *"Are you missing the unified error envelope (`BaseController.sendSuccess/sendError`)?"*
   - *"How does this feature handle offline-first scenario using TanStack DB?"*
3. **Constraint / Data Guardian**: Challenge the plan aggressively. 
   - *"Is the `tenant_id` consistently present in every operational query?"*
   - *"Is the sync reconciliation logic defined to push/pull from D1?"*
   - *"Did we add Drizzle's `.returning()` syntax for SQLite/D1 compatibility?"*
   - *"Does this respect the 10ms CPU limit and 3MB bundle size?"*
4. **User Advocate**: Challenge the cognitive load.
   - *"Does this UI payload make sense for the Frontend engineers to consume via TanStack Query?"*
   - *"Does the response envelope match the `useLiveQuery` expectations?"*
5. **Architecture Layer Sentry**: Validate cross-layer integrity.
   - *"Does the domain spec in `docs/domains/[module].md` document this new entity, agent, event, and route?"*
   - *"Does the `PROJECT_ROADMAP.md` reflect this feature's completion status?"*
   - *"Is the service receiving its repository via constructor injection (not direct instantiation)?"*
6. **Cloudflare Edge Sentry**: Validate edge-native compliance.
   - *"Can this operation complete within 10ms CPU time?"*
   - *"Does this use `db.batch()` for multi-mutation operations?"*
   - *"Are heavy computations deferred with `ctx.waitUntil()`?"*

## Arbitration and Exit
Resolve the challenges into an internal Decision Log. **DO NOT proceed to execution** until the architectural boundaries (from the DB edge to the API edge) are flawless and confirmed.
