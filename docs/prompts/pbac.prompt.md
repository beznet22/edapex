# PROMPT: EdApex PBAC Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Policy-Based Access Control (PBAC)** domain. 

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/RolePermission/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_roles`, `sm_permissions`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md` (Specifically Section 1.B).
4.  **Modern Schema**: Analyze `src/db/domain-pbac.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/pbac.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- The paradigm shift from Role-Based (RBAC) to Policy-Based (PBAC).
- Recommendations for a Policy DSL (Domain Specific Language) defined within the database.
- Justification for a central Policy Evaluator component.
