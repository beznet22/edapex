# PROMPT: EdApex Communication Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Communication** domain (Chat, Notices, Events, Notifications).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Communicate/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_notices`, `sm_events`, `sm_news`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-communication.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/communication.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Moving from simple "Notices" to an Omni-channel Notification system.
- Recommendations for an AI-moderated chat architecture.
