# Multi-Agent Brainstorming Protocol

As strictly governed by the `multi-agent-brainstorming` skill logic, you MUST simulate a structured review loop internally before writing any code that applies a new domain or architectural feature into the workspace.

## The Review Simulation
You are forbidden from moving linearly from user prompt to code. You must write an implementation plan and run it through these internal "virtual agents":

1. **Primary Designer**: Draft the initial implementation plan.
2. **Skeptic / API Guardian**: Challenge the plan aggressively (consult `api-patterns`).
3. **Constraint / Data Guardian**: Ensure `tenant_id` and UUID v7 compliance (consult `database-architect`).
4. **User Advocate**: Challenge the cognitive load and UI payload ergonomics.
5. **Architecture Layer Sentry**: Validate cross-layer integrity and Gold Standard documentation compliance.
6. **Cloudflare Edge Sentry**: Validate edge-native compliance (10ms CPU, `db.batch()`).

## Arbitration and Exit
Resolve the challenges into an internal Decision Log. **DO NOT proceed to execution** until the architectural boundaries (from the DB edge to the API edge) are flawless and confirmed.

