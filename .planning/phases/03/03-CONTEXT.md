# Phase 3: Cognitive Core - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the core HMAS (Hierarchical Multi-Agent System) arbitration logic, recursive memory summarization, and the dynamic tool-registry integration. This establishes the "brain" of the platform, enabling cross-domain reasoning and infinite context management via the Memory Ledger.

</domain>

<decisions>
## Implementation Decisions

### HMAS Arbitration
- **D-01:** Implement a custom **LLM-based Dispatcher** for the Principal Agent, utilizing `src/services/ai/strategy/SOUL.md` as the core behavioral directive.
- **D-02:** Use the Dispatcher to route multi-domain goals to specialized Supervisors rather than relying on Mastra's native router for top-level arbitration.

### Memory & Context Management
- **D-03:** Trigger **Recursive Memory Summarization** on **Task Completion** events. This ensures that the logical flow of work is preserved in the persistent memory ledger.
- **D-04:** Summaries must be stored as "Context Snapshots" in the `domain-ai` persistence layer, mapped to the specific `thread_id` and `tenant_id`.

### Dynamic Tool Discovery
- **D-05:** Inject **Domain-Vetted Tools** into Supervisors at initialization. A Supervisor for `finance` should NOT have visibility into `hr` tools unless explicitly delegated by the Principal.
- **D-06:** Tool Registry must cross-reference `SKILL.md` metadata to determine capability mapping and PBAC requirements.

### the agent's Discretion
- Exact prompt structure for the Summarizer agent.
- Selection of the "Memory Threshold" before a summary is forced (as a safety fallback for long-running tasks).

</decisions>

<canonical_refs>
## Canonical References

### AI Orchestration
- `docs/MASTER_ARCHITECTURE.md` §3 — HMAS Design Patterns.
- `docs/MASTER_ARCHITECTURE.md` §15 — Dynamic Skill Discovery.
- `src/services/ai/strategy/SOUL.md` — Principal Assistant behavioral directives.

### Memory Systems
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §4 — Memory Ledger and Recursive Summarization.
- `AGENTS.md` — Supervisor and Specialist definitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/ai/strategy/registry.ts`: The core registry engine for discovering skills and mapping them to agents.
- `src/services/ai/strategy/provider.ts`: Provider-agnostic AI factory for creating Mastra agents.

### Established Patterns
- **Skill Scoping**: Skills are identified by their directory path in `src/services/ai/skills/`.
- **SOUL-Led Routing**: All Principal reasoning must be grounded in the instructions defined in `SOUL.md`.

### Integration Points
- `src/services/ai/skills/supervisors/`: The interface for domain-specific orchestration.

</code_context>

<deferred>
## Deferred Ideas

- Evolutionary Learning (Agent self-optimization) — Post-V2 Backlog.
- Visual Agent Pulse telemetry — Phase 4.

</deferred>

---

*Phase: 03-role-library-hmas*
*Context gathered: 2026-04-09*
