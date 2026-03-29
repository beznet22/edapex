# PROMPT: EdApex Academic Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Academic** domain (Classes, Sections, Subjects, Routines).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Academics/` (Classes, Sections, Subjects).
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_academic_years`, `sm_classes`, `sm_sections`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-academic.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/academic.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Handling of "Class-Section" relationships (Physical junction tables in V2).
- Recommendations for a more flexible "Class Routine" structure using V2 academic years.
