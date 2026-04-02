# LMS Domain Architecture: AI-Native Learning System

## 1. Vision: AI-First Personalization
The EdApex LMS is designed from the ground up to be **AI-Native**, leveraging the Hierarchical Multi-Agent System (HMAS) to provide a 1-to-1 tutoring experience at scale. Unlike traditional LMS platforms that are static content repositories, EdApex LMS is a dynamic system where content adapts to the learner's progress, cognitive load, and feedback.

### Key AI Workflow (HMAS)
- **Personalized Pathing**: The `lms_supervisor` analyzes `lms_analytics_events` and performance data to dynamically adjust `lms_learning_paths`.
- **Autonomous Tutoring**: The `tutor_agent` uses RAG (Retrieval Augmented Generation) over course materials to provide context-aware assistance in `lms_tutoring_sessions`. *Note: For immersive, real-time live tutoring over OpenMAIC LangGraph, the LMS heavily syndicates with **Domain 18 (Agentic Classroom)**.*
- **Automated Grading**: The `grading_agent` evaluates `lms_submissions` using `ai_grading_config` (rubrics and prompts), providing instant, high-fidelity feedback.

## 2. Entity Design (V2 Schema)
The V2 schema (`src/db/domain-lms.ts`) is designed for **Planet-Scale** education by using JSON abstractions for metadata and strict tenant isolation.

### A. Course Management (`lms_courses`, `lms_modules`, `lms_lessons`)
- **JSON Metadata**: Stores rich syllabus and prerequisites without schema bloat.
- **Lesson Types**: Native support for `ai_tutoring` lessons that trigger specialized agent interfaces.
- **B2C Monetization & Standalone Mode**: `lms_courses` natively pairs with the Finance domain via `fee_master_id` and an `is_free` flag. Controlled by `LmsConfig` in the Settings domain, the LMS can operate entirely decoupled from the SMS (like Udemy). This enables courses to be sold for lifetime access (`academic_id` is null) rather than being rigidly chained to school semesters.

### B. Adaptive Learning (`lms_learning_paths`, `lms_progress`)
- **Academic Bound**: Strict foreign keys linking to `academic_id` inherently structure progress to the conventional school year to satisfy legal reports. 
- **Pathing Steps**: Supports `locked`/`available` states based on prerequisite fulfillment tracked by the `lms_supervisor`.
- **Analytics Loop**: `lms_analytics_events` provides the "Observed Reality" to the AI agent loop (ReAct), allowing for real-time course corrections.

### C. Competency Engine (`lms_competencies`, `lms_competency_records`)
- **Evidence-Based Mastery**: Links actual submissions and teacher/AI feedback to specific pedagogical goals, enabling "Mastery Learning" paradigms.
- **Multi-Tenant Isolation**: Fully constrained by `tenant_id` allowing individual B2B micro-schools to configure unique competency requirements securely.

## 3. Agent & Tool Integration
The LMS domain integrates deeply with the **Mastra SDK** to manage agent state and tool execution.

### Agents
| Agent | Role | Responsibility |
| :--- | :--- | :--- |
| `lms_supervisor` | Domain Supervisor | Decomposes educational goals, manages enrollment lifecycles, and triggers re-pathing. |
| `tutor_agent` | Task Agent | 1-on-1 student interaction. Uses RAG tools to query lesson content. |
| `grading_agent` | Task Agent | Analyzes submission attachments/text against rubrics. |

### Tools
- **`enroll_student.tool`**: Handles the PBAC-validated student registration to a course.
- **`publish_course.tool`**: Triggers content indexing (vectorization) for RAG support.
- **`evaluate_submission.tool`**: Invokes the `grading_agent` with student work and grading rubrics.

## 4. PBAC (LMS Specific)
Security is enforced via **Policy-Based Access Control**, ensuring data privacy in multi-tenant environments.

- **Content Access Policy**: Students can only `read` lessons if `enrollment_status == "active"` and prerequisites are met.
- **Evaluation Privacy**: Feedback from the `grading_agent` is restricted to the student and their authorized instructors until `status == "graded"`.
- **Federated Anonymization**: Insights about course effectiveness (e.g., "Lesson 5 causes 30% drop-off") are aggregated across tenants using `anonymized_analytics` schemas, preserving school-specific privacy while improving global pedagogy.

## 5. Architectural Recommendations

### A. Vector Embedding Support (CRITICAL)
**Proposal**: Add a `vector_embedding` column to `lms_lessons` or a specialized `lms_content_embeddings` table.
- **Justification**: Necessary for the `tutor_agent` to perform accurate RAG. Without this, tutoring is limited to basic LLM knowledge rather than specific course material.

### B. Event-Driven Adaptive Learning
**Proposal**: Integrate `lms_analytics_events` with the central **Event Bus**.
- **Justification**: Enables the `lms_supervisor` to react instantly to student struggle (e.g., repeating a video 3 times) by offering a tutoring session or a simplified lesson version.

### C. Multimedia Interaction Metadata
**Proposal**: Expand `LMSLessonMetadata` to include interactive hotspots or timestamps.
- **Justification**: Allows agents to guide students to specific moments in a video or specific paragraphs in a long text.

---

## Hono API Routes

```
Routes → LmsController → LmsService → LmsRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/lms/courses` | List courses | Authenticated |
| `POST` | `/api/v1/lms/courses` | Create course | Teacher+ |
| `POST` | `/api/v1/lms/courses/:id/publish` | Publish course (triggers RAG indexing) | Teacher+ |
| `GET` | `/api/v1/lms/courses/:id/modules` | List course modules/lessons | Enrolled |
| `POST` | `/api/v1/lms/enrollments` | Enroll student | `TenantAdmin` |
| `GET` | `/api/v1/lms/progress/:userId` | Get learning path progress | Self + Teacher |
| `POST` | `/api/v1/lms/submissions` | Submit assignment | Student |
| `POST` | `/api/v1/lms/submissions/:id/grade` | Grade submission (AI or manual) | Teacher |
| `GET` | `/api/v1/lms/tutoring/:sessionId` | Get tutoring session | Student |
| `POST` | `/api/v1/lms/tutoring` | Start tutoring session | Student |
| `GET` | `/api/v1/lms/competencies/:userId` | Get competency records | Self + Teacher |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `lms.course_published` | `{ courseId, tenantId }` | AI (RAG indexing), Events (audit) |
| `lms.student_enrolled` | `{ enrollmentId, courseId, userId }` | Communication (welcome), Events (audit) |
| `lms.submission_graded` | `{ submissionId, score, gradedBy }` | Communication (notify student), Assessment (sync) |
| `lms.path_rerouted` | `{ userId, oldPath, newPath, reason }` | Events (audit), Communication (notify student) |
| `lms.tutoring_completed` | `{ sessionId, tokenUsage }` | Finance (token billing), Events (audit) |
