# PROMPT: EdApex Documents Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Documents** domain (File Storage, Student Docs, Staff Docs).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/storage` and related Controllers.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_student_documents`, `sm_staff_documents`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-documents.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/documents.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Moving to an S3-based, tenant-prefixed storage architecture.
- Recommendations for AI-driven OCR and document verification tools.
