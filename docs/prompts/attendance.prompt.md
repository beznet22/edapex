# PROMPT: EdApex Attendance Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Attendance** domain (Student, Staff, Subject).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Http/Controllers/Admin/StudentAttendance/`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_student_attendances`, `sm_staff_attendances`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-attendance.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/attendance.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Unified `attendances` table structure in V2 vs split tables in V1.
- Recommendations for AI-driven anomaly detection (e.g., mass-absenteeism alerts).
