# PROMPT: EdApex Finance Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Finance** domain. 

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/AdminFeesController.php` and related Models.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `fm_fees_masters`, `fm_fees_groups`, `fm_fees_types`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-finance.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/finance.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Multi-tenancy isolation for ledger entries.
- Recommendations for physical foreign key enforcement between fee assignments and the student ledger.
