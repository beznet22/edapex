# PROMPT: EdApex LMS Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Architect a modern, AI-first Learning Management System (LMS) within the EdApex ecosystem. 
**NOTE:** This module is entirely NEW and does not exist in the legacy `schoolify` project. Your analysis must be grounded in modern educational pedagogy and AI-native workflows.

## 📂 SOURCE CONTEXT
1.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md` for high-level HMAS and PBAC requirements.
2.  **Modern Schema**: Analyze `src/db/domain-lms.ts` for the current V2 Drizzle implementation. Use this as your structural starting point.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/lms.md` covering:

### 1. LMS Vision
- How AI agents (HMAS) facilitate personalized learning paths.
- Integration of autonomous tutoring and progress monitoring.

### 2. Entity Design (V2)
- Detailed breakdown of tables in `src/db/domain-lms.ts` (Courses, Lessons, Submissions, Quizzes).
- Justification for why these entities enable a planet-scale LMS.

### 3. Agent & Tool Integration
- Roles for `lms_supervisor`, `grading_agent`, and `tutor_agent`.
- Defined tools: `enroll_student.tool`, `publish_course.tool`, `evaluate_submission.tool`.

### 4. PBAC (LMS Specific)
- Policies for student-content access vs internal evaluation privacy.
- Federated Intelligence: How course effectiveness insights are anonymized across tenants.

### 5. Recommendations & Justifications (IMPORTANT)
- **Deep Code Review** of `src/db/domain-lms.ts`.
- **Proposals** for making the current schema more AI-ready (e.g., adding vector embedding support for course content).
- **WARNING**: Do NOT modify the schema files directly. All proposals require User Approval.
