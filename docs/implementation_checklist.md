# TDD-Driven Implementation Checklist

This document serves as the master checklist for the EdApex Mastra migration. Every item MUST be verified with a corresponding automated test (Vitest/Playwright) as part of our Test Driven Development (TDD) workflow.

## 1. Phase 1: Foundation & Identity (specs/mastra_migration_specs.md)

### 1.1 Storage & Isolation
- [x] **Test: libSQL Initialization**: Verify `mastra.db` is created and accessible via `@mastra/storage-libsql`.
- [x] **Test: Singleton Guard**: Verify that `createMastra()` returns unique instances and no global singletons exist.
- [ ] **Test: Concurrent Isolation**: Spawn two requests with different `schoolId` and verify no cross-tenant memory leakage.
- [ ] **Test: Scoped Repository**: Verify `ScopedRepositoryProvider` correctly injects `schoolId` into all Drizzle queries.

### 1.2 The Sovereign Gateway & Redundancy
- [ ] **Test: Key Retrieval**: Mock `libSQL` and verify `EdApexGateway.getApiKey()` fetches and decrypts correctly.
- [ ] **Test: Provider Failover (429/503)**: Mock errors from Cerebras; verify transparent failover through the hierarchy (`Groq` -> `NVIDIA` -> `Mistral`).
- [ ] **Test: Model Mapping**: Verify task-specific requests (`OCR` vs `Chat`) correctly map to task-optimized model IDs in `libSQL`.
- [ ] **Test: TenantContext Cache**: Verify 5-minute TTL for `Map<sessionId, TenantContext>` and immediate cache-bust on `/switch`.
- [ ] **Test: Thread Metadata**: Verify every thread is tagged with `{ schoolId, classId, sectionId, examId }` for inheritance.
- [ ] **Test: Route Guard Hydration**: Verify `hooks.server.ts` redirects to `/pending-assignment` if context hydration yields a null `workspaceManifest`.

### 1.3 Skill Discovery & Discovery Engine
- [ ] **Test: Skill Validation CI**: Implement `bun run mastra:validate` to verify `.skill.md` Zod schema and tool existence.
- [ ] **Test: Skill Build Manifest**: Verify `skills.json` manifest generates correctly on production build for zero-latency discovery without file watchers.
- [ ] **Test: Real-time Watcher**: Verify `chokidar` auto-healing, 500ms debounce, and **Agent-Lock** (watcher pause during `WriteTurn`).
- [ ] **Test: Transactional Writes**: Verify `tempfile` -> `fs.rename` pattern for all agent filesystem operations to prevent watcher thrashing.
- [ ] **Test: State Residency**: Verify active skill state persistence in `mastra_metadata` table to survive crashes.
- [ ] **Test: Autonomous Switch**: Verify `switchSkill` trigger when user intent (e.g., "/grade") is detected outside a locked "/extract" session.
- [ ] **Test: Conversational Interruption Recovery**: Verify Gateway Agent safely pauses to ask for confirmation during ambiguous cross-domain requests.
- [ ] **Test: Lock Bypass**: Verify `manageAccess` and `systemStatus` tools remain executable even during a high-priority "Lock" turn.
- [ ] **Test: Contextual Hydration for `@Mentions`**: Verify IT/Coordinator `@Class` mentions trigger background fetch and inject student IDs into the agent's lookup index.
- [ ] **Test: Health Endpoint**: Verify `/api/mastra/health` reports status of Watcher, DB Pool, and Workflow Queue.

## 2. Phase 2: UI Orchestration (specs/ui_spec.md)

### 2.2 Functional UI Components
- [ ] **Component: AppRail**: Implement `collapsible="icon"`, activity badges, brand mark, and `Cmd+K` global shortcut.
- [ ] **Component: ChatComposer**: Build "Input Island" with embedded Model Selector, context chips, and collapsible **Terminal Dock** for OTel traces.
- [ ] **Component: Mobile Mastery**: Adhere to `env(safe-area-inset-*)`, haptic-aware navigation triggers, and mobile chip scroll tray.
- [ ] **Component: Adaptive Depth**: Logic to reduce transparency/blur on low-power mobile devices while maintaining color palette.
- [ ] **Component: Workspace Switcher**: Render "Unassigned ⚠" badge and disable commands when `workspaceLock` is null.
- [ ] **Component: Sidebar Flex**: Verify resizability between `w-72` and `w-80` with smooth `<ScrollArea>` resizing.
- [ ] **Component: Temporal Sidebar**: Verify grouping logic for `PINNED`, `TODAY`, and `EARLIER` thread lists.
- [ ] **Component: Mobile Gestures**: Implement "Swipe-from-Edge" for Sidebar/Inspector access on screens < 768px.
- [ ] **Component: User Avatar Dropdown**: Implement Bottom Anchor dropdown with Profile, Settings, Designation/Workspace Lock badges.
- [ ] **Component: Sidebar Footer**: Implement Panel 2 sticky bottom mapped to Settings, serving as trigger for the User Avatar Dropdown.
- [ ] **Component: Chat Stage & Header**: Implement Panel 3 sticky glassmorphic header, trailing Inspector toggle, and infinite `<ScrollArea>`.
- [ ] **Component: Chat Action Tool Tray**: Expand ChatComposer island to cleanly render Left Actions (Attachment/Voice), Center Selectors (Profile/Workspace/Models), and Right triggers (Stop/Send).
- [ ] **Component: File Explorer Tree**: Implement Panel 4 workspace tree with collapsible directories, file type icons, and size metadata.
- [ ] **Component: Managed Editor Canvas**: Frame an integrated Monaco/ProseMirror editor inside Panel 4 for direct text edits and media previews.
- [ ] **Component: File Metadata Badging**: Implement file pinning UI, semantic tagging markers, and live sync badges within the Workspace Panel.
- [ ] **Component: Intent Validation Card**: Implement 90% confidence confirmation card UI for mutation intents.

### 2.3 Provider & State Management (Settings)
- [ ] **Test: Settings Persistence**: Verify writing API keys (Cerebras/Groq/NVIDIA/Mistral) to `libSQL` via protected UI inputs.
- [ ] **Test: Hierarchy Sort**: Verify drag-and-drop reordering updates the provider priority in `libSQL`.
- [ ] **Test: Key Masking**: Verify API keys are masked in the UI and never exposed in cleartext logs.

## 3. Phase 3: Slash Commands & Governance (specs/slash_command_specs.md)

### 3.2 Secure Multi-Agent Execution & Disambiguation
- [ ] **Test: Workspace Lock Rejection**: Verify `WORKSPACE_MISMATCH` when attempting to access an entity outside the `activeClassId`.
- [ ] **Test: Disambiguation Card**: Result in multiple entities for `/search`; verify candidate card (Name/Class/Section) UI.
- [ ] **Test: Scope-Bound Search Fallback**: Verify `/search` with empty query inside an active `@Class` context correctly yields the complete student list.
- [ ] **Test: Admission Priority**: Verify exact Admission Number match bypasses fuzzy candidate list and resolves immediately.
- [ ] **Test: Audit Traceability**: Verify `source: "fuzzy_match"` tag and `threadId/modelId` attribution in timeline/runs.
- [ ] **Test: Onboarding Schema Verification**: Verify `/register` iterative chunking (Student -> Guardian -> Class) and dropdown pre-fetching.
- [ ] **Test: Role Whitelist**: Verify `403 Forbidden` for users with designations outside (1, 5, 8).
- [ ] **Test: Onboarding Error Recovery**: Intercept `USER_EXISTS` and suggested `/update` transition.
- [ ] **Test: Destructive Confirmation**: Verify explicit confirmation prompt for `/ban`, `/suspend`, and `/reset password`.
- [ ] **Test: Patch Zod Masking**: Verify `/update` and `/edit` strictly strip protected fields (`id`, `role`, `schoolId`) via `.omit()` before DB writes.
- [ ] **Test: Intent Confidence Gate**: Verify Gateway limits mutations at <90% and reads at <70% confidence, triggering `NEEDS_CONFIRMATION` card.
- [ ] **Test: Explicit Command Override**: Verify literal slash commands bypass intent scoring and assume 100% confidence.
- [ ] **Test: Live Workspace Badge**: Verify `/switch` triggers synchronous cache flush and immediately pushes update to the Active Workspace Badge.

## 4. Phase 4, 5 & 6: Workflows & Observability

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

## 5. Phase 7: Aesthetic & Final Polish (specs/ui_spec.md)

### 5.1 Typography & Colors
- [ ] **Aesthetic: Font Precision**: Verify `Geist Sans` for UI and `Geist Mono` for high-density traces/terminal.
- [ ] **Aesthetic: OKLCH Palette**: Verify `oklch(0.65 0.15 40)` Gold accents on `oklch(0.14 0.02 260)` Charcoal base.
- [ ] **Aesthetic: Glassmorphism**: Verify `backdrop-blur-md` with 20% opacity on all floating sheets and context menus.
- [ ] **Aesthetic: Micro-animations**: Verify spring-based transitions for panel resizing and workflow pulse states.

## 6. Phase 6: Legacy Decommissioning (The Big Purge)

### 6.1 Code & Schema Deprecation
- [ ] **Task: Deprecate Global SDK Services**: Remove `agent.service.ts` and standard SDK layout bindings in favor of Mastra Engine endpoints.
- [ ] **Task: Obsolete Tool Gutting**: Purge all 31 atomic files inside `src/lib/chat/tools/*` in favor of the new `.skill.md` architecture.
- [ ] **Task: AI Database Schema Migration & Purge**: Execute a data migration pipeline from legacy MySQL `ai_` schemas (`ai_sessions`, `ai_chats`, etc.) into `mastra.db`, then drop the legacy schemas completely.
- [ ] **Task: Assessment Service Refactoring**: Remove orchestration logic (150+ lines) from `assessment.service.ts` and replace with `PublishResultsWorkflow.execute()`.
- [ ] **Task: Component Artifact Purging**: Remove obsolete `src/routes/(chat)/+layout.svelte` elements overridden by the new Hermes Layout.
