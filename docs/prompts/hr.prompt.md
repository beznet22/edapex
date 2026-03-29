# PROMPT: EdApex HR Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Human Resources** domain (Staff, Payroll, Leaves).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Hr/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_staffs`, `sm_leave_requests`, `sm_hr_payroll_generates`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-hr.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/hr.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Staff persona attributes vs platform User identity.
- Recommendations for automated payroll triggers based on attendance events.
