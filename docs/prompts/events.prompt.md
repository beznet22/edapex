# PROMPT: EdApex Domain Events Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Domain Events** domain (Event Bus, Triggers, Consumers).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify` (InfixEdu) for any relevant logic.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
1.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md` (Section 15, 23).
2.  **Modern Schema**: Analyze `src/db/domain-events.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/events.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Event-driven reliability (At-least-once delivery).
- Integration of `edx_domain_events` with regional AI nodes for federated learning triggers.
