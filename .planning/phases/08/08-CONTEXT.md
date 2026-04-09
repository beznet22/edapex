# Phase 8: The Maximizer & Intelligence - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the system-wide optimization engine (The Maximizer) and the portability layer. This phase focuses on proactive auditing, context compaction intelligence, and the standardization of school/agent manifests for global portability.

</domain>

<decisions>
## Implementation Decisions

### The Maximizer & Auditing
- **D-01: Proactive Audit Loop**: The Maximizer agent runs as a background routine that audits school state for "quality-density" gaps. It identifies missing metadata, redundant artifacts, and fiscal inefficiencies.
- **D-02: Proposal-Based Optimization**: Audit findings are published as `BoardProposals` (WorkProducts). The system does not self-modify core academic or financial data without human-in-the-loop approval.
- **D-03: Intelligence Registry**: A centralized performance log of AI reasoning steps to guide the Principal in selecting the most cost-effective model for specific goal types.

### Portability & Manifests
- **D-04: Portable Manifests**: `SCHOOL.md` (Institutional configuration) and `AGENTS.md` (HMAS orchestration logic) are codified as the canonical export/import formats.
- **D-05: UUID-Native Linking**: All manifest entries use UUID v7 to ensure persistent relationship integrity during export/import migrations.

</decisions>

<canonical_refs>
## Canonical References

### Governance
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §9 — Governance & The Maximizer.
- `docs/MASTER_ARCHITECTURE.md` §1 — System self-correction vision.

### Portability
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §38 — Portable school formats.

</canonical_refs>

<code_context>
## Existing Code Insights

### Routine Infrastructure
- `src/services/core/RoutineEngine.ts`: The host for the Maximizer's periodic audit cycles.

### Artifacts System
- `src/db/sqlite/domain-documents.ts`: The registry for BoardProposals and WorkProducts.

</code_context>

<deferred>
## Deferred Ideas

- Cross-school "Intelligence Swarm" (Decentralized learning) — Post-V2 Roadmap.
- Automated PRD-to-School generation — Future Research.

</deferred>

---

*Phase: 08-the-maximizer-intelligence*
*Context gathered: 2026-04-09*
