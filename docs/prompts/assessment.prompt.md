# PROMPT: EdApex Assessment Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Assessment** domain (Exams, Setups, Marks, Results).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Examinations/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_exams`, `sm_exam_types`, `sm_mark_stores`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-assessment.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/assessment.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- The transition from a flat `sm_mark_stores` to a structured `exam_marks` + `computed_results` architecture.
- Recommendations for AI-driven result computation triggers.
