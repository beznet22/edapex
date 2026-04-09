# Phase 5: Academic Domain - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the Student Management and Curriculum Engine modules. This includes enrollment workflows, immutable academic records (Ledger), and hierarchical course modeling (Department > Course > Module). This phase establishes the core educational data layer of the EdApex V2 platform.

</domain>

<decisions>
## Implementation Decisions

### Academic Records & Integrity
- **D-01:** Implement an **Append-only Academic Ledger** for all grade assignments, credit completions, and certification awards. This ensures maximum auditability and supports future "Verifiable Credentials" integration.
- **D-02:** Standard CRUD operations on records are prohibited; all changes must be submitted as "Transcript Events."

### Curriculum Engine
- **D-03:** Use a **Fixed Hierarchy** for curriculum modeling: **Department > Course > Module > Lesson**. This ensures compatibility with traditional LMS logic and simplifies the initial V2 rollout.
- **D-04:** Use **Metadata Tags** for skill-mapping and cross-disciplinary prerequisite detection (instead of a complex Knowledge Graph).

### HMAS Academic Specialists
- **D-05:** Create separate **EnrollmentCoordinator** and **CurriculumDesigner** specialist agents under the Academic Supervisor.
- **D-06:** The `EnrollmentCoordinator` has write-access to Student Profiles and Enrollment records, while `CurriculumDesigner` is scoped to course content and module structures.

### the agent's Discretion
- Exact schema for "Transcript Event" payload (e.g., whether to include rubric details or just final scores).
- Naming conventions for curriculum tags (e.g., `skill:python`, `std:high-school-v3`).

</decisions>

<canonical_refs>
## Canonical References

### Domain Modeling
- `docs/MASTER_ARCHITECTURE.md` §12 — Academic Domain Overview.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §5 — Academic Data Model and Verifiable Credentials spec.

### Agent Governance
- `AGENTS.md` — Supervisor and Specialist definitions for the Academic domain.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/sqlite/domain-academic.ts`: Initial schema definitions for students and courses.
- `src/services/academic/academic.service.ts`: Core service wrapper for academic logic.

### Established Patterns
- **Ledger-Backing**: Mirror the patterns found in the Finance domain (`domain-finance`) for the Academic Ledger implementation.

### Integration Points
- `src/services/ai/skills/supervisors/academic/`: Target for HMAS specialist injection.

</code_context>

<deferred>
- Automated Peer Review (Phase 11).
- Knowledge Graph prerequisite detection (Post-V2 Backlog).

</deferred>

---

*Phase: 05-maximizer*
*Context gathered: 2026-04-09*
