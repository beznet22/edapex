# TDD-Driven Implementation Checklist

This document serves as the master checklist for the EdApex Mastra migration. Every item MUST be verified with a corresponding automated test (Vitest/Playwright) as part of our Test Driven Development (TDD) workflow.

## 1. Phase 1: Foundation & Identity (specs/mastra_migration_specs.md) [REQUIRED: `@[/mastra]`, `@[/agent-orchestrator]`, `@[/writing-skills]`]

### 1.1 Storage & Isolation
- [x] **Test: libSQL Initialization**: Verify `mastra.db` is created and accessible via `@mastra/storage-libsql`.
- [x] **Test: Singleton Guard**: Verify that `createMastra()` returns unique instances and no global singletons exist.
- [x] **Test: Concurrent Isolation**: Spawn two requests with different `schoolId` and verify no cross-tenant memory leakage.
- [x] **Test: Scoped Repository**: Verify `ScopedRepositoryProvider` correctly injects `schoolId`, `classId`, `sectionId`, `examId` into all Drizzle queries.

### 1.2 The Sovereign Gateway & Redundancy
- [x] **Test: Key Retrieval**: Mock `libSQL` and verify `EdApexGateway.getApiKey()` fetches and decrypts correctly.
- [x] **Test: Provider Failover (429/503)**: Mock errors from highest priority; verify transparent failover through the hierarchy (`Groq` -> `Deepseek` -> `Mistral` -> `NVIDIA` -> `OpenCode`).
- [x] **Test: Model Mapping**: Verify task-specific requests (`OCR` vs `Chat`) correctly map to task-optimized model IDs in `libSQL`.
- [x] **Test: TenantContext Cache**: Verify 5-minute TTL for `Map<sessionId, TenantContext>` and immediate cache-bust on `/switch`.
- [x] **Test: Thread Metadata**: Verify every thread is tagged with `{ schoolId, classId, sectionId, examId }` for inheritance.
- [x] **Test: Route Guard Hydration**: Verify `hooks.server.ts` redirects to `/pending-assignment` if context hydration yields a null `workspaceManifest`.

### 1.3 Skill Discovery & Discovery Engine
- [x] **Test: Skill Validation CI**: Implement `bun run mastra:validate` to verify `.skill.md` Zod schema and tool existence.
- [x] **Test: Skill Build Manifest**: Verify `skills.json` manifest generates correctly on production build for zero-latency discovery without file watchers.
- [x] **Test: Real-time Watcher**: Verify `chokidar` auto-healing, 500ms debounce, and **Agent-Lock** (watcher pause during `WriteTurn`).
- [x] **Test: Transactional Writes**: Verify `tempfile` -> `fs.rename` pattern for all agent filesystem operations to prevent watcher thrashing.
- [x] **Test: State Residency**: Verify active skill state persistence in `mastra_metadata` table to survive crashes.
- [x] **Test: Autonomous Switch**: Verify `switchSkill` trigger when user intent (e.g., "/grade") is detected outside a locked "/extract" session.
- [x] **Test: Conversational Interruption Recovery**: Verify Gateway Agent safely pauses to ask for confirmation during ambiguous cross-domain requests.
- [x] **Test: Lock Bypass**: Verify `manageAccess` and `systemStatus` tools remain executable even during a high-priority "Lock" turn.
- [x] **Test: Contextual Hydration for `@Mentions`**: Verify IT/Coordinator `@Class` mentions trigger background fetch and inject student IDs into the agent's lookup index.
- [x] **Test: Health Endpoint**: Verify `/api/mastra/health` reports status of Watcher, DB Pool, and Workflow Queue.

## 2. Phase 2: UI Orchestration (specs/ui_spec.md) [REQUIRED: `@[/ui-ux-pro-max]`]

### 2.2 Functional UI Components
- [x] **Component: Unified Sidebar (Panel 1+2)**: Combined `app-sidebar.svelte` using `collapsible="icon"`. Implements horizontal AppRail (Brand, Primary Apps, Activity Badges) and vertical Context Sidebar (Thread List, Workspace Switcher, Context Chips, Footer).
- [x] **Component: ChatComposer**: Renamed from `chat-input.svelte` → `ChatComposer.svelte`. Built "Input Island" with 3-column Action Tool Tray (Attach/Voice | ChatMenu | Send/Stop).
- [x] **Component: Mobile Mastery**: `env(safe-area-inset-*)` via `.gesture-zone-*` utilities, ResponsiveSheet overlay for Panel 4 on mobile.
- [x] **Component: Adaptive Depth**: `@media (prefers-reduced-motion)` reduces blur from 12px→4px, opacity from 0.7→0.85 in `.hermes-glass`.
- [x] **Component: Workspace Switcher**: "Unassigned ⚠" badge in `nav-user.svelte`, `workspaceLock` enforcement across all panels.
- [x] **Component: Temporal Sidebar**: Preserved existing `history.svelte` temporal grouping (Today, Yesterday, Earlier).
- [x] **Component: Mobile Gestures**: `.gesture-zone-left`/`.gesture-zone-right` CSS zones for Sidebar/Inspector swipe on <768px.
- [x] **Component: User Avatar Dropdown**: `nav-user.svelte` with Designation badge (IT/Coordinator/Teacher), workspace badge, full menu spec.
- [x] **Component: Sidebar Footer**: Panel 2 sticky bottom via NavSecondary + NavUser trigger in unified `app-sidebar.svelte`.
- [x] **Component: Chat Stage & Header**: `chat-header.svelte` glassmorphic sticky header with thread title, Inspector toggle button.
- [x] **Component: Chat Action Tool Tray**: ChatComposer 3-column layout: Left (Attachment/Voice), Center (ChatMenu), Right (Send/Stop).
- [x] **Component: File Explorer Tree**: `WorkspacePane.svelte` with Lucide SVG icons, recursive tree, collapsible dirs, file size metadata.
- [x] **Component: Managed Editor Canvas**: `editor-canvas.svelte` for text/image/PDF preview with maximize/minimize.
- [x] **Component: File Metadata Badging**: Pin indicators, file size display, and MAIN workspace badge in WorkspacePane header.
- [x] **Component: Intent Validation Card**: `intent-validation-card.svelte` with 90% confidence gating, gold-glow confirm button.

### 2.2b Spec Gap Remediation (Identified by UI Audit)
- [x] **Component: Session Filter Input**: Add search `<Input>` with placeholder "Filter sessions..." in Panel 2 between New Session button and Context Chips.
- [x] **Component: Panel 4 Forward Navigation**: Add Forward (`>`) button in WorkspacePane header alongside Back (`<`).
- [x] **Component: File Semantic Tagging UI**: Implement visual tagging markers (#processed, #invalid, #reviewed) on file tree items.
- [x] **Aesthetic: Geist Font Import**: Import and apply Geist Sans (UI) and Geist Mono (traces/terminal) typography hierarchy.
- [x] **Aesthetic: Spring Micro-Animations**: Implement spring-based transitions for panel resize and chip injection (not just linear CSS transitions).
- [x] **Aesthetic: Workflow Pulse States**: Add CSS pulse keyframes for active workflow indicators in AppRail badges.
- [x] **Component: ChatComposer Context Selectors**: Wire Profile Selector, Workspace/Folder Selector, and Intelligence Model Selector as 3 distinct triggers in the Action Tool Tray center zone. (Class selection is handled via `@mentions` and `TenantContext`).
- [x] **Component: Mobile Bottom Navigation Bar**: Implement adaptive bottom nav with haptic-aware icon triggers for <768px screens.

### 2.3 Provider & State Management (Settings Modal — replaces current Integration Modal)
- [x] **Test: Settings Persistence**: Verify writing API keys (Groq/Deepseek/Mistral/NVIDIA/OpenCode) to `libSQL` via protected UI inputs.
- [x] **Test: Hierarchy Sort**: Verify drag-and-drop reordering updates the provider priority in `libSQL`.
- [x] **Test: Key Masking**: Verify API keys are masked in the UI and never exposed in cleartext logs.

## 3. Phase 3: Slash Commands & Governance (specs/slash_command_specs.md) [REQUIRED: `@[/agent-orchestrator]`]

### 3.1 Atomic Tool & Agent Implementation
- [x] **Implementation: Grading Skill**: Implement `manageResults` tool for `/grade`, `/mark`, and `/attendance` with type discrimination (Academic/Attendance/Behavioral).
- [x] **Implementation: Onboarding /assign**: Implement specific logic for student transfer/enrolment to class/section.
- [x] **Implementation: Mastra Tool Registry**: Wrap all governance and operational logic (`onboard-tools`, `gov-tools`) into Mastra `createTool` definitions.
- [x] **Implementation: Skill Registry (Zero-Config)**: Implement the file-driven `.skill.md` discovery engine and manifest generation.
- [x] **Implementation: Gateway Agent Factory**: Implement `createGatewayAgent` with dynamic tool injection, confidence gating, and supervisor routing.

### 3.2 Secure Multi-Agent Execution & Disambiguation
- [] **Test: Workspace Lock Rejection**: Verify `WORKSPACE_MISMATCH` when attempting to access an entity outside the `activeClassId` / `activeSectionId`.
- [] **Test: Disambiguation Card**: Result in multiple entities for `/search`; verify candidate card (Name/Class/Section) UI.
- [] **Test: Scope-Bound Search Fallback**: Verify `/search` with empty query inside an active `@Class` context correctly yields the complete student list.
- [] **Test: Admission Priority**: Verify exact Admission Number match bypasses fuzzy candidate list and resolves immediately.
- [] **Test: Audit Traceability**: Verify `source: "fuzzy_match"` tag and `threadId/modelId` attribution in timeline/runs.
- [] **Test: Onboarding Schema Verification**: Verify `/register` iterative chunking (Student -> Guardian -> Class) and dropdown pre-fetching.
- [] **Test: Role Whitelist**: Verify `403 Forbidden` for users with designations outside (1, 5, 8).
- [] **Test: Onboarding Error Recovery**: Intercept `USER_EXISTS` and suggested `/update` transition.
- [] **Test: Destructive Confirmation**: Verify explicit confirmation prompt for `/ban`, `/suspend`, and `/reset password`.
- [] **Test: Patch Zod Masking**: Verify `/update` and `/edit` strictly strip protected fields (`id`, `role`, `schoolId`) via `.omit()` before DB writes.
- [] **Test: Intent Confidence Gate**: Verify Gateway limits mutations at <90% and reads at <70% confidence, triggering `NEEDS_CONFIRMATION` card.
- [] **Test: Explicit Command Override**: Verify literal slash commands bypass intent scoring and assume 100% confidence.
- [] **Test: Live Workspace Badge**: Verify `/switch` triggers synchronous cache flush and immediately pushes update to the Active Workspace Badge.

## 4. Phase 4, 5 & 6: Workflows & Observability [REQUIRED: `@[/mastra]`]

### 4.1 Extraction & Validation
- [ ] **Test: ExtractionWorkflow Dual-Path**: Verify sub-second SERIAL `/ocr` for <= 4 images and BATCH worker delivery for 5+.
- [ ] **Test: Batch Mapping**: Verify student mapping in JSONL files via `studentId:examId` in `custom_id` field.
- [ ] **Test: Validation Resume**: Verify `/validate` resumes suspended runs and applies logic in-memory (0 DB reads until commit).
- [ ] **Test: SSE Progress**: Verify real-time extraction status relay from worker threads to browser via SSE.
- [ ] **Test: Autonomous Multi-Skill Sequencing**: Verify the Gateway Agent effectively supervises cross-domain goals (Extract -> Publish) by natively sequencing multiple active workflow states without manual slash commands.
- [ ] **Test: Workflow MySQL State Persistency**: Verify persistent multi-user staging states properly leverage `MySQL-backed Storage` via row-level atomicity, allowing a predecessor's stalled workflows to be resumed by new context-aware staff seamlessly.

### 4.2 Publication & Artifacts
- [ ] **Test: PrinceXML Threading**: Verify PDF generation occurs off-main-thread with PrinceXML binary.
- [ ] **Test: PrinceXML Tokens**: Verify secure `/api/pdf/[token]` on-demand rendering (no disk storage for PDFs).
- [ ] **Test: Domain Timeline Mirror**: Verify `auditAIAction` writes to `sm_student_timelines` with `modelId` and `threadId`.
- [ ] **Test: Artifact Isolation**: Verify OCR/Validation state is read from libSQL Workflow snapshot, never legacy `ai_` tables.

### 4.3 Telemetry & Observability
- [ ] **Test: mastra_runs History**: Verify every workflow step transition and raw JSON is persisted in libSQL.
- [ ] **Test: OTel Production Bridge**: Verify Mastra OTel traces are piped to the application logger (no Jaeger requirement).
- [ ] **Test: Panel 4 Trace View**: Verify staff can view "Step-by-Step" success/failure markers for any given `WorkflowRunId`.

## 5. Phase 7: Aesthetic & Final Polish (specs/ui_spec.md) [REQUIRED: `@[/ui-ux-pro-max]`]

### 5.1 Typography & Colors
- [ ] **Aesthetic: Font Precision**: Verify `Geist Sans` for UI and `Geist Mono` for high-density traces/terminal.
- [ ] **Aesthetic: OKLCH Palette**: Verify `oklch(0.65 0.15 40)` Gold accents on `oklch(0.14 0.02 260)` Charcoal base.
- [ ] **Aesthetic: Glassmorphism**: Verify `backdrop-blur-md` with 20% opacity on all floating sheets and context menus.
- [ ] **Aesthetic: Micro-animations**: Verify spring-based transitions for panel resizing and workflow pulse states.

## 6. Phase 6: Legacy Decommissioning (The Big Purge) [REQUIRED: `@[/writing-skills]`]

### 6.1 Code & Schema Deprecation
- [ ] **Task: Deprecate Global SDK Services**: Remove `agent.service.ts` and standard SDK layout bindings in favor of Mastra Engine endpoints.
- [ ] **Task: Obsolete Tool Gutting**: Purge all 31 atomic files inside `src/lib/chat/tools/*` in favor of the new `.skill.md` architecture.
- [ ] **Task: AI Database Schema Migration & Purge**: Execute a data migration pipeline from legacy MySQL `ai_` schemas (`ai_sessions`, `ai_chats`, etc.) into `mastra.db`, then drop the legacy schemas completely.
- [ ] **Task: Assessment Service Refactoring**: Remove orchestration logic (150+ lines) from `assessment.service.ts` and replace with `PublishResultsWorkflow.execute()`.
- [ ] **Task: Component Artifact Purging**: Remove obsolete `src/routes/(chat)/+layout.svelte` elements overridden by the new Hermes Layout.


## Current State of §3.2

All 13 checklist items already have **unit tests in `slash-commands.test.ts`** that pass. They test the underlying logic functions in isolation:

| # | Checklist Item | Status | Coverage |
|---|---|---|---|
| 1 | Workspace Lock Rejection | ✅ `validateWorkspaceLock` unit test | Logic only; no full `searchEntityTool` DB path |
| 2 | Disambiguation Card | ✅ `searchEntityLogic` mock-candidate test | Logic only; no actual DB query |
| 3 | Scope-Bound Search Fallback | ✅ `searchEntityLogic` empty-query test | Logic only |
| 4 | Admission Priority | ✅ `searchEntityLogic` exact-match test | Logic only |
| 5 | Audit Traceability | ✅ `searchEntityLogic` audit metadata test | Logic only |
| 6 | Onboarding Schema Verification | ✅ `onboardEntitySchema` Zod test | Schema only |
| 7 | Role Whitelist | ✅ `validateRoleWhitelist` unit test | Direct function; no tool wrapper path |
| 8 | Onboarding Error Recovery | ✅ `onboardEntityLogic` with `simulateUserExists` | Logic only |
| 9 | Destructive Confirmation | ✅ `destructiveActionLogic` unit test | Not `manageAccessTool` wrapper |
| 10 | Patch Zod Masking | ✅ `patchEntitySchema` `.omit()` test | Schema only |
| 11 | Intent Confidence Gate | ✅ `validateIntentConfidence` threshold test | Not wired into Agent |
| 12 | Explicit Command Override | ✅ `validateIntentConfidence` slash override | Not wired into Agent |
| 13 | Live Workspace Badge | ✅ `switchWorkspaceLogic` context update test | No cache flush / UI assertion |

## Gaps for Production Readiness

1. **No integration tests for `createTool` wrappers** — `searchEntityTool.execute()`, `manageAccessTool.execute()`, etc. are untested end-to-end
2. **Gateway Agent factory untested** — `createGatewayAgent()` has zero test coverage
3. **Dynamic tool injection untested** — SkillRegistry → TOOL_REGISTRY → Agent.tools path never exercised
4. **Checklist markdown still shows `[]` for §3.1 and §3.2** — needs updating
5. **Intent confidence not wired** — `validateIntentConfidence` is imported/exported but never called by the Agent runtime

## Proposed §3.2 Parallel Work Streams

### Stream A: Tool-Wrapper Integration Tests
Add end-to-end tests for each `createTool` wrapper:
- `searchEntityTool` with mocked `StudentRepository`/`StaffRepository` DB calls
- `manageAccessTool` confirmation → re-invoke with `confirmed: true`
- `gradingTool` full path with mocked repos and timeline audit assertion
- `switchWorkspaceTool` cache-bust side-effect assertion

### Stream B: Gateway Agent Factory Tests
- `createGatewayAgent()` with pre-resolved model config
- `createGatewayAgent()` with `userId` auto-resolution (mocked router)
- Dynamic tool injection: verify only active-skill tools + global bypass are present
- Role whitelist rejection at factory level
- Skill lock awareness in generated instructions

### Stream C: Checklist & Documentation
- Update `docs/implementation_checklist.md` §3.1 → `[x]`
- Update `docs/implementation_checklist.md` §3.2 → `[x]` with test file references
- Verify skill instructions conform to `slash_command_specs.md` execution flows

### Stream D: Intent Confidence Wiring (Optional — spec §0)
Wire `validateIntentConfidence` into a pre-tool-execution middleware or agent hook so the 90%/70% thresholds are enforced at runtime, not just tested as an isolated function.

---

## Canonical Distribution Table (per `mastra_migration_specs.md` §4.2 + `slash_command_specs.md`)

Full visibility into the legacy inventory and the canonical mapping for §4.2 of `mastra_migration_specs.md`. Here's the distribution analysis. I'm presenting it as findings only — no files have been edited.

| # | Legacy Export (Source) | Target Mastra Skill | Atomic Tool (Mastra ID) | Slash Cmd | Current Status |
|---|---|---|---|---|---|
| 1 | `getClassStudentList` (`result.tool.ts`) | **Core** | `searchEntity` | `/search`, `/find` (empty-query fallback) | `searchEntityLogic` exists; **no `createTool` wrapper in `tools/index.ts`** |
| 2 | `getStudentList` (`coordinator.tool.ts`) | **Core** | `searchEntity` | `/search` | same as above |
| 3 | `searchStudent` | **Core** | `searchEntity` | `/search`, `/find` | same |
| 4 | `searchStaff` | **Core** | `searchEntity` | `/search`, `/find` | same |
| 5 | `searchClassSection` | **Core** | `searchEntity` | `/search` | same |
| 6 | `getAssessmentMapping` | **Core** | `searchEntity` (lookup index) | `@mention` hydration | **MISSING** in Mastra layer |
| 7 | `upsertMarkStore` | **Grading** | `manageResults` (Academic) | `/mark`, `/grade` | Stub — uses thin ad-hoc schema |
| 8 | `upsertStudentResult` (`result.tool.ts`) | **Grading** | `manageResults` (Academic, full upsert) | `/grade` | Stub |
| 9 | `upsertAttendance` | **Grading** | `manageResults` (Attendance) | `/attendance` | Stub |
| 10 | `upsertTeacherRemark` | **Grading** | `manageResults` (Qualitative) | `/grade` | Stub |
| 11 | `upsertStudentRatings` | **Grading** | `manageResults` (Behavioral) | `/grade` | Stub |
| 12 | `createStudent` | **Onboard** | `onboardEntity` | `/register`, `/enroll` | `onboardEntityLogic` is mocked |
| 13 | `registerStaff` | **Onboard** | `onboardEntity` | `/register` | same |
| 14 | `assignClassSection` | **Onboard** (sub-routine "Transfer/Enrollment") | `onboardEntity` per spec — currently a separate `assignEntity` tool | `/assign` | **DIVERGENCE**: current code has standalone `assign-tools.ts` |
| 15 | `getStudentRegistrationOptions` | **Onboard** | helper inside `onboardEntity` (`getRegistrationOptions`) | n/a | Stub helper exists |
| 16 | `getStaffRegistrationOptions` | **Onboard** | helper inside `onboardEntity` | n/a | **MISSING** |
| 17 | `promoteStudent` | **Onboard** | `onboardEntity` (transfer variant) | `/assign` | **MISSING** |
| 18 | `changeStudentName` | **Gov** | `patchEntity` | `/rename`, `/edit` | Stub schema only |
| 19 | `changeParentEmail` | **Gov** | `patchEntity` | `/update`, `/edit` | **MISSING** |
| 20 | `updateStudentDetails` | **Gov** | `patchEntity` | `/update`, `/edit` | **MISSING** |
| 21 | `updateExamTitle` | **Gov** | `patchEntity` | `/update` | **MISSING** |
| 22 | `resetPassword` | **Gov** | `manageAccess` | `/reset` | **MISSING** Mastra tool (only generic `destructiveActionLogic` stub) |
| 23 | `updateStaffStatus` | **Gov** | `manageAccess` | `/ban`, `/suspend` | same |
| 24 | `deleteStaff` | **Gov** | `manageAccess` | `/ban` | same |
| 25 | `updateStudentStatus` | **Gov** | `manageAccess` | `/suspend`, `/ban` | same |
| 26 | `deleteStudent` | **Gov** | `manageAccess` | `/ban` | same |
| 27 | `validateClassResults` | **Workflows** | `PublishResultsWorkflow` (`prepData` + validation step) | `/publish` (precondition) | **MISSING** workflow file |
| 28 | `sendStudentResult` | **Workflows** | `PublishResultsWorkflow` (`dispatchEmails`) | `/publish @student` | **MISSING** |
| 29 | `sendClassResults` | **Workflows** | `PublishResultsWorkflow` (full batch) | `/publish` | **MISSING** |
| 30 | `runExtraction` (legacy, not in current tree) | **Workflows** | `ExtractionWorkflow` | `/extract`, `/generate` | **MISSING** |
| 31 | `createdDocumentTool` (`document.tool.ts`) | **Workflows / Artifact** | Artifact streaming inside `PublishResultsWorkflow` (PDF preview) | n/a (background) | **MISSING** Mastra equivalent |
| 32 | `sendEmailTool` (`email.tool.ts`) | **Workflows** | Step inside `PublishResultsWorkflow.dispatchEmails` | internal | **MISSING** |
| — | `index.ts` bundles (`teacherTools`, `coordinatorTools`, `defaultTools`) | **Skill Registry** | `.skill.md` driven (`SkillRegistry.getToolsForSkill`) | n/a | Two skill files exist; no registry runtime yet (Phase 1.3 marked done — needs cross-check) |

---

## Findings That Affect the In-Flight Grading Implementation

1. **Schema fidelity gap (CRITICAL).** Legacy `result.tool.ts` consumes the canonical `resultInputSchema`, `attendanceSchema`, `teacherRemarkSchema`, `studentRatingsSchema` from `src/lib/schema/result-input.ts`. The current `grading-tools.ts` stub re-defines thinner ad-hoc shapes (`{ studentId, subjectId, score }`, etc.). To honour "zero feature loss" (§4.2) and "Strict Zod schemas" (§4.1 Phase 4), `manageResults` must accept the canonical schemas — this is also what `slash_command_specs.md` §2.1 step 4 mandates ("constructs the validated Zod schema (`marksInputSchema`, `attendanceSchema`, etc.)").

2. **`assignClassSection` placement.** The spec (§4.2 row 3) collapses `assignClassSection` under `onboardEntity`. The current code has a separate `assign-tools.ts` exposing `assignEntity`. Either (a) keep the separate tool but document it as an alias-bundle for the same `onboardEntity` skill, or (b) fold its logic into `onboardEntity` as a `mode: 'assign'` discriminator. Spec text leans (b); current code chose (a).

3. **`searchEntity` is missing a `createTool` wrapper.** `searchEntityLogic` is implemented and unit-tested but is not registered in `tools/index.ts` as a Mastra `createTool`, so the Gateway Agent cannot actually invoke it. Phase 3 implementation row 1 of the checklist implicitly requires this.

4. **`manageAccess` and `patchEntity` wrappers absent.** `gov-tools.ts` only exposes a generic `destructiveActionLogic` and `validateIntentConfidence` — no actual `manageAccess` / `patchEntity` Mastra tools or schemas exist, although `tools/index.ts` exports `patchTool` whose schema is just `{ firstName, lastName }` (way thinner than legacy reach).

5. **Workflows are out of Phase 3 scope** (Phase 4–5 in the checklist), but the Grading Skill must not absorb `validateClassResults` / `sendStudentResult` logic — those belong to `PublishResultsWorkflow`.

6. **`document.tool.ts` and `email.tool.ts`** are not in the spec's 31-tool count. They are workflow-internal primitives used only by `PublishResultsWorkflow` (§9.1 / §10 PublishResultsWorkflow), not direct slash commands.

---

## Recommended Calibration Before Resuming `manageResults` Implementation

Given the above, the Grading Skill TDD step (§3.1 row 1) should be widened so that **`manageResults`**:

- Accepts a discriminated union over the **canonical** schemas (`resultInputSchema`, `attendanceSchema`, `teacherRemarkSchema`, `studentRatingsSchema`) — not the four thin shapes currently in `grading-tools.ts`.
- Resolves the student via `StudentRepository.getStudentById` (real repo call) for workspace-lock evaluation.
- Persists via the `ResultsRepository` methods that already mirror the legacy assessment service (`batchUpsertMarkRecords`, `upsertClassAttendance`, `upsertTeacherRemark`, `upsertStudentRatings`).
- Emits a `sm_student_timelines` audit row with `{ threadId, modelId, source: 'agent' }` per §6.1.

The 9 failing test cases I already wrote in `slash-commands.test.ts` (lines 390–700) are *already* aligned with this wider contract, so the pivot only affects the implementation file (`grading-tools.ts`) and the wiring file (`tools/index.ts`). The test file itself is correct.

---

## Awaiting Direction

Three decisions I need from you before resuming Step 5 (implementation) of the TDD workflow:

1. **Schema fidelity**: Confirm `manageResults` must adopt the canonical `$lib/schema/result-input` schemas (recommended, matches spec). Y/N?
2. **`assignEntity` posture**: Keep it as a standalone tool (current code), or fold into `onboardEntity` per spec §4.2 row 3 in a follow-up Phase-3 task? (I lean: keep standalone for this phase, leave a checklist note for spec drift.)
3. **Scope of this single TDD slice**: Limit edits strictly to `grading-tools.ts` + `tools/index.ts` + `tenant-context.ts` (for `MastraToolContext` interface) — leaving `searchEntity` Mastra wrapper, `manageAccess`, and the missing Gov/Onboard wrappers as **separate** subsequent tasks under §3.1? (Recommended — keeps each TDD slice atomic per protocol.)

Once you confirm these, I will execute Step 5 of the TDD loop on the Grading slice only.


