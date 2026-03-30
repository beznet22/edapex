# Multi-Agent Brainstorming Protocol

As strictly governed by the `multi-agent-brainstorming` skill logic, you MUST simulate a structured review loop internally before writing any code that applies a new domain or architectural feature into the workspace.

## The Review Simulation
You are forbidden from moving linearly from user prompt to code. You must write an implementation plan (in your working memory or an artifact) and run it through these internal "virtual agents":

1. **Primary Designer**: Draft the initial implementation plan (e.g., "I will add a `transport` table and a `TransportService`").
2. **Skeptic / API Guardian**: Challenge the plan aggressively. 
   - *"Does the API definition leak the database schema? Do we have Zod validators for the `POST` payload?"*
   - *"Are you missing the unified error envelope?"*
3. **Constraint / Data Guardian**: Challenge the plan aggressively. 
   - *"Is the `tenant_id` consistently present?"*
   - *"Did we add Drizzle's `.returning()` syntax for Postgres compatibility while handling MySQL gracefully?"*
4. **User Advocate**: Challenge the cognitive load.
   - *"Does this UI payload make sense for the Frontend engineers to consume?"*

## Arbitration and Exit
Resolve the challenges into an internal Decision Log. **DO NOT proceed to execution** until the architectural boundaries (from the DB edge to the API edge) are flawless and confirmed.
