# PROMPT: EdApex Library Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Library** domain (Books, Members, Transactions).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/Library/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_books`, `sm_book_members`, `sm_book_issues`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-library.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/library.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Unified member IDs linking to `edx_accounts`.
- Recommendations for AI-based book recommendation agents.
