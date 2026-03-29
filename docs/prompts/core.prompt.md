# PROMPT: EdApex Core Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Core** domain (Tenants, Academic Years, Identity, Accounts).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Models/User.php` and `GeneralSettings`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_schools`, `sm_academic_years`, `users`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-core.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/core.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Multi-tenant hull design (Centrally managed `tenants`).
- Separation of platform identity (`users`) from domain-specific `accounts`.
- Recommendations for tenant-level feature flags.
