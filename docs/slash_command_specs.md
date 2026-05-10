# Mastra Slash Command Execution Flow Specifications

This document defines the high-level execution flows for slash commands in the Mastra-native EdApex orchestration layer. Each flow is designed to ensure zero feature loss from legacy tools while maintaining strict workspace boundaries and tenant isolation.

## 0. Global Supervisor Confidence Gate & Routing
- **Storage Sovereignty**: Command execution state (Worker job IDs, OCR buffers) is persisted in **libSQL (`mastra.db`)**. Legacy `ai_` tables and MySQL-based routing are decommissioned.
- **Provider Routing**: Handled by **`EdApexGateway`**. All commands use standard model IDs (`edapex/[provider]/[model]`) and benefit from **Intelligent Auto-Failover** logic initialized per-request via `libSQL`.
- **Supervisor Confidence**: 90% threshold for mutation-based intents (e.g., `/extract`, `/validate`, `/publish`, `/update`, `/edit`), agent **refuses** to execute the tool automatically. 70% threshold for read-based intents (e.g., `/search`, `/find`, `/grade`, `/mark`, `/attendance`, `/register`, `/enroll`, `/assign`), agent **refuses** to execute the tool automatically.
- **NEEDS_CONFIRMATION**: Supervisor yields a validation card for low-confidence intents.
- **Explicit Slash Commands**: Intent classification is bypassed if a user starts a prompt with a literal slash command (e.g., `/extract`). This is treated as 100% confidence.

## 1. Core Skill Flow

### 1.1 `/search`, `/find` (searchEntity)
**Business Intent**: Unified fuzzy search across all user and class repositories within the active context.

**Logic Flow**:
1. **Input Reception**: Agent receives `/search [query]` or autocomplete intent for a specific entity. `query` can be a name, part of a name, or an admission number.
2. **Context Resolution**: The tool checks the caller's designation via `TenantContext`.
   - *Class Teacher*: Search is restricted to students within the `activeClassId` and `activeSectionId`.
   - *Coordinator/IT*: Search spans across the `schoolId`. Callers must provide an `@Class` context for disambiguation if the query is too broad.
3. **Execution Routing**:
   - If `query` is empty but `classId/sectionId` is in context: Fetches the full list of students for that class (replaces `getClassStudentList` / `getStudentList`).
   - If `query` is provided: Performs fuzzy search matching on names, emails, or admission numbers (replaces `searchStudent` / `searchStaff`).
4. **Disambiguation Protocol**:
   - If a single exact match is found, the tool returns the entity ID and metadata.
   - If multiple candidates are found, the tool returns a `NEEDS_CLARIFICATION` status along with a candidate list (Name, Class, Section). The Gateway Agent pauses execution and asks the user to select the correct target.
5. **Output**: Returns structured data (IDs, names, admission numbers) injected into the Agent's "Lookup Index" for subsequent actions.
6. **Workspace Lock Cross-Reference (Security Gate)**: Every resolved `@mention` entity's `classId` is validated against `event.locals.tenantContext.workspaceLock`. If there is a mismatch (e.g., stale mention from a prior context before a `/switch`), the tool returns a `WORKSPACE_MISMATCH` error and the Gateway Agent hard-rejects the parent command, prompting the user to re-confirm or re-issue the command with the correct context.
7. **Audit**: Logs the resolution strategy with `source: "fuzzy_match"` if multiple candidates were winnowed.

**Usage Example**:
- `/search John` -> Searches for "John" in the current `@Class` context.
- `/find @JohnDoe` -> Immediately resolves if `@JohnDoe` is a valid, distinct mention.

---

## 2. Grading Skill Flow

### 2.1 `/grade`, `/mark`, `/attendance` (manageResults)
**Business Intent**: Unified handler for result-related mutations (Marks, Attendance, Remarks) with type discrimination.

**Logic Flow**:
1. **Input Reception**: Agent receives `/grade`, `/mark`, or `/attendance` along with a natural language mutation string or a structured schema (e.g., "Math 85, English 90 for @John").
2. **Context Resolution**: Extracts the target `studentId` and `examTypeId` from the current thread metadata or `@mentions`.
   - If missing, the agent triggers a `NEEDS_CLARIFICATION` prompt: "Which student and exam are you updating?"
   - Enforces workspace bounds: Class Teachers can only mutate results for their assigned `classId_sectionId`.
3. **Type Discrimination**: The Supervisor evaluates the input payload to route to the correct sub-schema:
   - *Academic Marks*: Routes to `upsertMarkStore` / `upsertStudentResult`.
   - *Attendance*: Routes to `upsertAttendance` (days opened, present, absent).
   - *Qualitative*: Routes to `upsertTeacherRemark` (free text comment).
   - *Behavioral*: Routes to `upsertStudentRatings` (affective/psychomotor domains).
4. **Execution**:
   - Performs a read check if the intent is purely informational.
   - For mutations, it constructs the validated Zod schema (`marksInputSchema`, `attendanceSchema`, etc.).
   - Calls the `ScopedRepositoryProvider` for atomic database transactions.
5. **Output**: Returns the `status` ("approved" | "denied") and the updated record data. Updates the domain timeline for audit traceability.

**Usage Example**:
- `/mark @John Math 85` -> Updates John's Math score to 85.
- `/attendance @John present 50, absent 2` -> Updates attendance records for John.

---

## 3. Onboard Skill Flow

### 3.1 `/register`, `/enroll`, `/assign` (onboardEntity)
**Business Intent**: Transactional registration and enrolment flow with role-based profile creation.

**Logic Flow**:
1. **Input Reception**: Agent receives `/register`, `/enroll`, or `/assign` command.
2. **Context Requirement**: 
   - Operations require the Gateway Agent to pre-fetch dropdown choices (classes, sections, student categories, etc.) into its context before proceeding.
3. **Sub-Routine Selection**:
   - *Transfer/Enrollment* (`/assign @student to @Class`): Resolves the `studentId` and the target `classId_sectionId`. Executes the `assignClassSection` atomic transfer.
   - *New Registration* (`/register`): Checks if the required structured transaction payload (firstName, lastName, class, section, gender, category, parent/guardian info) is available.
4. **Conversational Form Filling**:
   - If the payload is incomplete, the Supervisor agent enters a conversational data-gathering loop, prompting the user for missing required fields based on the fetched options.
   - Inspired by the backend agent guidelines (`assessment.ts`), the enrollment schema strictly requires the following structured blocks:
     - **STUDENT DETAILS**: First Name, Last Name, Gender (Male | Female), and Category (e.g., DAYCARE | LOWER BASIC).
     - **GUARDIAN DETAILS**: Relation (Father | Mother | Other), Guardian Name, Phone, and Email.
     - **CLASS & SECTION**: Pre-validated Class and Section assignments.
     - **OPTIONAL**: Sibling Admission No (for automatic parent-account linkage), DOB, Student Email, Student Phone.
5. **Execution**:
   - Once the schema is satisfied, executes `studentRepo.creatStudentIfNotExists` (or the Mastra equivalent tool for onboarding).
   - This performs a multi-table atomic transaction (User, Profile, Parent, Enrollment).
6. **Error Recovery**: If the system returns `USER_EXISTS`, the agent intercepts the error and responds: "A user with this email or identity already exists. Did you mean to `/update` their profile instead?"
7. **Output**: Returns the newly minted IDs (including auto-generated admission numbers) and temporary passwords for secure handover.

**Usage Example**:
- `/register` -> Triggers conversational flow to gather student details.
- `/assign @student to @Class10A` -> Transfers the mentioned student to Class 10A.

---

## 4. Gov Skill Flow

### 4.1 `/update`, `/edit`, `/rename` (patchEntity)
**Business Intent**: Targeted updates to entity properties using the generic patch pattern.

**Logic Flow**:
1. **Input Reception**: Agent intercepts a command like `/rename @student to "John Doe"` or `/update exam title to "Midterm"`.
2. **Context Resolution**: Extracts the target entity (Student, Exam, Parent) and the specific property to mutate.
3. **Zod Masking (Security Gate)**:
   - The raw mutation payload is piped through a strict, entity-specific **Zod update schema** before touching the ORM.
   - Protected fields (`id`, `role`, `schoolId`, encryption keys) are forcefully stripped via `.omit()` to prevent **Mass Assignment vulnerabilities** from hallucinated or manipulated AI payloads.
4. **Execution**:
   - The Zod-verified dictionary is passed to the generic `patchEntity` Drizzle handler.
   - Verifies designation/role permissions before any write.
5. **Validation**: Updates the relevant field and returns a success confirmation to the UI without forcing a full page reload (relies on SvelteKit invalidation).

**Usage Example**:
- `/rename @student to "Jane Doe"` -> Directly updates the student's full name.
- `/update exam title to "Midterm 2026"` -> Updates the active exam's title.

### 4.2 `/ban`, `/reset`, `/suspend` (manageAccess)
**Business Intent**: Lifecycle and access state mutations for system entities.

**Logic Flow**:
1. **Input Reception**: Agent receives commands like `/ban @student`, `/suspend`, or `/reset password`.
2. **Entity Disambiguation**: Identifies the target user (Student or Staff) using the `searchEntity` protocol. If ambiguous, triggers the `NEEDS_CLARIFICATION` loop.
3. **Confirmation Gate (CRITICAL)**: For destructive or major access changes (like deletion or banning), the Gateway Agent mandates an explicit human confirmation prompt ("Are you sure you want to permanently suspend John Doe?") before proceeding.
4. **Execution**: Routes to `updateStudentStatus`, `deleteStudent`, `resetPassword`, or `updateStaffStatus`.
5. **Output**: Returns the mutated lifecycle state and clears any active sessions for the target user if banned/deleted.

**Usage Example**:
- `/suspend @student` -> Disables the student's active status.
- `/reset password @student` -> Resets credentials and returns a temporary password.

---

## 5. Context Skill Flow

### 5.1 `/switch @Class/Section` (switchContext) — Coordinator/IT Only
**Business Intent**: Atomically switch the active workspace lock to a different class/section without starting a new session.

**Logic Flow**:
1. **Input Reception**: Agent receives `/switch @Class/Section`.
2. **Cache Bust (Critical)**: Synchronously **flushes and rebuilds** the `Map<sessionId, TenantContext>` entry for this session before any response is returned. The 5-minute passive TTL does not apply to active `/switch` operations.
3. **Context Re-hydration**: Rebuilds the full `TenantContext` from the new `@Class/Section` target, re-hydrates the discovery sidebar, and locks all subsequent `@mention` lookups to the newly selected class.
4. **Workspace Badge Update**: Sends a live update to the Active Workspace Badge in the UI User Profile Dropdown to reflect the new `Class:Section`.
5. **Output**: Confirms the context switch and lists available entities (students, staff) in the new class for quick reference.

**Usage Example**:
- `/switch @JSS3_Math` → Switches context from current class to JSS3 Math section.

---

## 6. Workflows Skill Flow

### 5.1 `/extract`, `/generate` (ExtractionWorkflow)
**Business Intent**: End-to-end ingestion and initial processing of documents/images via OCR.

**Logic Flow**:
1. **Input Reception**: User uploads an image and types `/extract`, or uses the `/generate` command.
2. **Context Resolution**: The Gateway Agent checks for target context (e.g., `@Class`). If missing, it prompts for the class/section.
3. **Execution Routing (Dual-Path)**:
   - *Instant Path*: For <4 images, routes to the direct OCR API, maps results into the current Mastra Workflow State via `setState`, and immediately suspends the workflow pending `/validate`.
   - *Batch Path*: For volume uploads, dispatches a `worker_thread`. On completion, the thread posts the mapped JSON back to the parent, which resolves the Mastra Workflow State. The workflow is then suspended awaiting human confirmation.
4. **Isolation Contract**: The OCR output is stored exclusively within the **Mastra Workflow State** (never in the school DB). The school management layer receives no writes until `/validate` completes. The `TenantContext` and `MappingManifest` are injected as `initialState` into the workflow, not stored as DB artifacts.
5. **Trace Logging**: On completion (success or error), the full step history is persisted to the `mastra_runs` table in libSQL.
6. **Output**: The suspended Workflow Run ID is surfaced in the UI Inspector Panel as a resumable staging buffer.

**Usage Example**:
- *Drag and drop 3 images into chat* -> Agent auto-extracts.
- `/extract` (with image attachments) -> Instantly processes the attached report cards via Mistral.

### 5.2 `/validate` (ValidationWorkflow)
**Business Intent**: Integrity check and permanent transactional write of extracted data.

**Logic Flow**:
1. **Input Reception**: Agent receives `/validate` either standalone or sequentially after extraction completion.
2. **Workflow Resume**: The Gateway Agent resumes the **suspended Mastra Workflow Run** associated with this thread's `TenantContext`. All OCR state is loaded directly from the Workflow State snapshot — no DB read required.
3. **Execution**:
   - `validateSchema`: Validates the OCR state against the strict `resultInputSchema`.
   - `applyBusinessLogic`: Calculates cumulative grades, GPAs, and formats attendance natively in-memory.
   - `commitToDB`: Only at this final step does the data cross into the school management layer — safely executing `assessment.upsertStudentResult` atomically via `TenantContext`.
4. **Trace Logging**: Final run status and step results are persisted to `mastra_runs` in libSQL for auditability.
5. **Output**: Exposes verification markers per student and unlocks the `/publish` command.

**Usage Example**:
- `/validate` -> Runs integrity checks on all staging extractions in the Workspace Panel.
- `/validate @student` -> Validates only the selected student.

### 5.3 `/publish` (PublishResultsWorkflow)
**Business Intent**: Sequential workflow for batch emailing results and updating longitudinal timelines.

**Logic Flow**:
1. **Input Reception**: User invokes `/publish`. Can specify a single `@student` or the entire active `@Class`.
2. **Prerequisite Check**: Validates that the results have passed the Validation step and exist in the DB.
3. **Execution (Off Main Thread via `worker_threads`)**:
   - `generatePDFs`: Dispatched to a **Node.js `worker_thread`** to run intensive PrinceXML binary operations off the main event loop, preventing UI stalling.
   - `dispatchEmails`: Handed off to the existing worker architecture (`send-email` job type).
   - `auditTimeline`: Injects `Result Notification` timeline events into each student's persistent history.
4. **Trace Logging**: The progress of PrinceXML and SMTP jobs is periodically synced to the `mastra_runs` libSQL trace, ensuring failures are visible in the UI.
5. **State Communication (SSE)**: Worker threads emit progress via `parentPort.postMessage()`. The primary SvelteKit thread relays these updates to the browser using **Server-Sent Events (SSE)**.
6. **Output**: Streams real-time progress to the UI. Once complete, outputs delivery success/failure counts.

**Usage Example**:
- `/publish` -> Triggers PDF generation and email batch payload for all validated students.
- `/publish @student` -> Publishes the result strictly for the mentioned student.
