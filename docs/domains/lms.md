# LMS (Learning Management System) Domain Architecture

## Overview
The LMS domain in EdApex V2 is a fully AI-native, standalone-capable learning platform. It supports both B2B institutional coursework (linked to Academic subjects) and B2C retail education (standalone courses with monetization). The domain features AI tutoring sessions, competency-based tracking, adaptive learning paths, and granular analytics.

### Key Business Logic
- **Course Hierarchy**: Courses → Modules → Lessons → Assignments. Each level is independently manageable.
- **Dual Mode**: Can operate as an Academic extension (linked to `subjects` via `subjectId`) or standalone B2C platform (linked to `feeMasters` for pricing).
- **AI Tutoring**: Real-time AI tutoring sessions with full message history stored per-lesson context.
- **Competency Tracking**: Mastery-based learning with evidence-backed competency records.
- **Adaptive Learning Paths**: AI-generated personalized curricula with prerequisite-locked steps.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-lms.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_courses` / `sm_course_categories` | `lmsCourses` | Education level + grade level support. B2C monetization via `feeMasterId`. |
| — (new) | `lmsModules` | Course → Module grouping with sort order. |
| `sm_lessons` / `sm_lesson_details` | `lmsLessons` | Lesson types: `video`, `text`, `quiz`, `interactive`, `ai_tutoring`. |
| `sm_lesson_topics` / `sm_lesson_topic_details` | `lmsLearningObjectives` | Per-lesson/module learning objectives. |
| `sm_homeworks` / `sm_upload_homework_contents` | `lmsAssignments` | AI grading config with rubric and style. |
| `sm_homework_students` / `sm_student_homeworks` | `lmsSubmissions` | AI + teacher feedback, resubmit support. |
| — (new) | `lmsEnrollments` | Course enrollment with progress tracking. |
| — (new) | `lmsProgress` | Per-lesson completion + time tracking. |
| — (new) | `lmsCompetencies` | Competency definitions per education level. |
| — (new) | `lmsCompetencyRecords` | Evidence-backed attainment records. |
| `sm_online_classes` | `lmsTutoringSessions` | AI tutoring with full chat history. |
| — (new) | `lmsLearningPaths` | AI-generated adaptive learning paths. |
| — (new) | `lmsLearningPathSteps` | Prerequisite-locked sequential steps. |
| — (new) | `lmsAnalyticsEvents` | Granular event tracking (page_view, quiz_submit, video_pause). |

---

## Technical Implementation

### Core Entities

#### [LmsCourses](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L56)
Top-level course entity. `educationLevel` enum: `k1_k12`, `tertiary`, `professional`, `hobby`. Optional link to Academic `subjects` and Finance `feeMasters`.

#### [LmsModules](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L77)
Groups lessons within a course. Sorted by `sortOrder`.

#### [LmsLessons](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L90)
Content delivery unit. `lessonType` enum: `video`, `text`, `quiz`, `interactive`, `ai_tutoring`. Supports media URLs and metadata.

#### [LmsAssignments](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L119)
Coursework with AI grading config (rubric, max marks, prompt, grading style).

#### [LmsSubmissions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L133)
Student submissions with AI feedback, teacher feedback, and resubmit workflow.

#### [LmsEnrollments / LmsProgress](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L149)
Course enrollment with aggregate `progressPercent` and per-lesson time tracking.

#### [LmsCompetencies / LmsCompetencyRecords](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L175)
Competency framework with mastery levels (`learning`, `proficient`, `mastery`) and evidence linking.

#### [LmsTutoringSessions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L197)
AI tutoring chat sessions with full message history per student-lesson context.

#### [LmsLearningPaths / LmsLearningPathSteps](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L210)
Adaptive learning paths with prerequisite-locked steps. AI generates paths based on competency gaps.

#### [LmsAnalyticsEvents](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-lms.ts#L232)
Granular event tracking for learning analytics (`page_view`, `video_pause`, `quiz_submit`).

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `lms.createModule(courseId, data)`: Creates a new module/lesson within a course.
- `lms.generateQuiz(lessonId)`: AI-generates quiz questions from lesson content.
- `lms.enrollStudent(courseId, studentId)`: Enrolls a student with progress tracking initialization.
- `lms.trackProgress(enrollmentId)`: Updates completion percentage and learning path status.
- `lms.publishCourse(courseId)`: Transitions course from draft to published.
- `lms.gradeSubmission(submissionId)`: AI or manual grading of assignment submissions.
- `generate_learning_path`: AI-driven adaptive curriculum based on competency gaps and goals.
- `generate_ai_tutor_response`: Contextual tutoring response using RAG over course content.
- `sync_gradebook`: Bidirectional sync between LMS grades and Assessment domain.
- `import_scorm_package`: SCORM/xAPI content import with integrity validation.

### [STRESS DEFENSE] Tools
- `content_version_control`: Ensures content consistency across sections during concurrent edits.
- `scorm_integrity_validator`: Validates SCORM/xAPI package structure and metadata during import.
- `student_context_preserver`: Prevents context amnesia between semesters for enrolled students.
- `sis_sync_reconciler`: Handles gradebook sync timeouts during peak SIS reconciliation.
- `offline_content_packer`: Packages course content for offline/low-bandwidth delivery.
- `plagiarism_detection_engine`: Detects academic dishonesty across submissions with configurable thresholds.
- `grade_drift_auditor`: Detects and flags inconsistencies between AI grading and manual teacher feedback.

---

## PBAC & Security
- **Tenant Isolation**: All LMS data scoped by `tenantId`.
- **TenantAdmin**: Full control over courses, modules, lessons.
- **Teacher/Facilitator**: Create/manage courses and grade assignments within assigned scope.
- **Student**: Enroll in courses, submit assignments, access tutoring. Read-only for own progress/grades.
- **Parent**: Read-only access to their child's progress and grades.

---

## Hono API Routes

```
Routes → LMSController → LMSService → LMSRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/lms/courses` | List courses | Authenticated |
| `POST` | `/api/v1/lms/courses` | Create course | Teacher+ |
| `GET` | `/api/v1/lms/courses/:id/modules` | List modules | Enrolled+ |
| `GET` | `/api/v1/lms/lessons/:id` | Get lesson content | Enrolled+ |
| `POST` | `/api/v1/lms/assignments/:id/submit` | Submit assignment | Student |
| `GET` | `/api/v1/lms/enrollments` | List enrollments | Self + `TenantAdmin` |
| `POST` | `/api/v1/lms/enrollments` | Enroll in course | Authenticated |
| `GET` | `/api/v1/lms/progress/:enrollmentId` | Get progress | Self + Teacher |
| `POST` | `/api/v1/lms/tutoring/start` | Start AI tutoring session | Enrolled |
| `GET` | `/api/v1/lms/analytics` | Learning analytics | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `lms_supervisor` | Supervisor | Course curation, content quality, enrollment management |
| `content_architect` | Task | Course/module/lesson generation, media validation |
| `ai_tutor` | Task | Real-time AI tutoring, session summarization |
| `grading_agent` | Task | AI-powered auto-grading, plagiarism detection |
| `learning_path_agent` | Task | Adaptive curriculum generation, competency gap analysis |
| `analytics_agent` | Task | Progress reporting, engagement insights, retention alerts |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `lms.course_published` | `{ courseId, tenantId }` | Communication (catalog update), Events (audit) |
| `lms.student_enrolled` | `{ enrollmentId, userId, courseId }` | Finance (invoice), Communication (welcome) |
| `lms.assignment_submitted` | `{ submissionId, assignmentId }` | AI (auto-grading trigger) |
| `lms.lesson_completed` | `{ progressId, lessonId, userId }` | LMS (path unlock), Events (audit) |
| `lms.tutoring_session_ended` | `{ sessionId, userId, messageCount }` | AI (summarization), Events (audit) |
| `lms.competency_attained` | `{ recordId, userId, level }` | Communication (certificate trigger), Events (audit) |
