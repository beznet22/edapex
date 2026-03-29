# PROMPT: EdApex Facilities Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Facilities** domain (Hostel, Transport, Inventory).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Inventory/` and `Transport/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_dormitory_lists`, `sm_vehicles`, `sm_item_stores`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-facilities.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/facilities.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Transitioning from monolithic inventory to a multi-tenant facility management system.
- Recommendations for AI-driven route optimization tools.
