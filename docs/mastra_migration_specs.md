# Low-Level Document: AI Agent Orchestration Migration to Mastra

## 1. Introduction
This document outlines the technical specifications for migrating EdApex's AI agent orchestration from a monolithic Vercel AI SDK implementation to a modular, skill-based architecture using the Mastra framework.

## 2. Dynamic Skill-Based Orchestration

Discard the Planner-Executor network model to minimize token overhead. Instead, implement a **Dynamic Skill Injection** pattern where a single agent loads only the necessary tool subsets on-demand.

### 2.1 The Gateway Agent (Supervisor)
A single, lightweight agent serves as the entry point and **Supervisor**. It has minimal instructions and no default tools. Its primary job is to:
1. Parse user intent and route to the correct **Mastra Skill** or **Workflow**.
2. Enforce a **90% Confidence Gate** for all mutation intents (slash commands).
3. Utilize **Context Injection** to hydrate the session with School, Class, and Section metadata.
4. Delegate conversational turns to the **Assistant** or **Default** personas.

#### [REFACTOR] Agent Factory
The Gateway Agent is instantiated via a factory to preserve multi-provider routing and dynamic context hydration.

```typescript
// src/lib/server/mastra/agents/gateway.ts
import { Agent } from '@mastra/core/agent';
import { resolveProviderForTask, getModelIdForTask, loadUserProviderRegistry } from '../../provider/router';

export async function createGatewayAgent(userId: number) {
  const { providerType } = await resolveProviderForTask(userId, 'chat');
  const registry = loadUserProviderRegistry(userId);
  const modelId = getModelIdForTask(providerType, 'chat', registry);

  return new Agent({
    id: `edapex-gateway-${userId}`,
    name: 'EdApex Gateway',
    instructions: 'Execute the provided tools to fulfill the user request.',
    model: {
      provider: providerType,
      name: modelId,
    },
    // Tools are injected dynamically via registry.getToolsForSkill()
  });
}
```

### 2.2 Autonomous Skill Discovery (Zero-Config)
To ensure agility, the system will implement a **File-Driven Skill Registry**. Developers can add new capabilities by simply creating a `[name].skill.md` file in a watched directory.

- **Discovery Method**: Mastra-native File-Driven Skill Registry.
- **Rationale**: Enables **Progressive Disclosure** where tools are only loaded into the agent's active context when the specific skill is triggered, preventing "tool-soup" and context pollution.
- **Development**: On server startup, the Mastra singleton scans this directory via a file-watcher for rapid DX.
- **Production**: To ensure zero-latency and consistency, a static `skills.json` manifest is generated during the build process.
- **Pre-Flight Validation**: A CI step `bun run mastra:validate` ensures all `.skill.md` files pass a strict Zod schema validation and all referenced tools exist in the registry. Production instances load this validated manifest, preventing "Poisoned Skills" from reaching the agent runtime.
- **Slash Commands**: The filename (e.g., `grading.skill.md`) becomes the slash command `/grading`.

#### [NEW] Skill Registry Implementation
```typescript
// src/lib/server/mastra/registry.ts
import { chokidar } from 'chokidar';
import matter from 'gray-matter';
import { z } from 'zod';

const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()),
  config: z.object({
    locked: z.boolean().default(false)
  })
});

export class SkillRegistry {
  private skills: Map<string, any> = new Map();

  constructor(private skillDir: string) {
    if (process.env.NODE_ENV === 'development') {
      this.initWatcher();
    }
  }

  private initWatcher() {
    chokidar.watch(`${this.skillDir}/*.skill.md`).on('add', (path) => this.loadSkill(path));
    chokidar.watch(`${this.skillDir}/*.skill.md`).on('change', (path) => this.loadSkill(path));
  }

  private async loadSkill(filePath: string) {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const validated = SkillSchema.parse(data);
    this.skills.set(validated.name.toLowerCase(), { ...validated, instructions: content });
  }

  getToolsForSkill(skillName: string) {
    const skill = this.skills.get(skillName.toLowerCase());
    if (!skill) return [];
    // Map tool names to actual Mastra Tool instances
    return skill.tools.map(t => allTools[t]);
  }
}
```

#### 2. Skill Definition Format (`.skill.md`)
Each skill file acts as both documentation and configuration:
```markdown
---
name: Grading
description: Toolset for scholastic assessment and mark entry.
tools:
  - upsertMarks
  - validateResults
  - updateExamSetup
config:
  locked: false # If true, the skill stays active until explicitly cleared
---
# System Prompt Segment
Focus solely on the grading workflow. Ensure all prerequisites are met...
```

#### 3. State & Context Locking
- **Dynamic Merging**: When a skill is active, its "System Prompt Segment" is appended to the Gateway Agent's base instructions.
- **Context Locking**: Some skills (like `/extraction`) might require a "Lock". While locked, the Gateway Agent only uses that skill's toolset and prompt until the task is marked `completed` or the user types `/exit` / `/clear`.
- **Global Tools**: A small set of "Core Tools" (Filesystem Read/Metadata) are always available regardless of the active skill.

#### 5. Skill Transitions & State Management
- **Intent-Aware Switching**: The Gateway Agent will be equipped with a core tool `switchSkill(newSkill)`. If the agent recognizes a user intent that exceeds its current skill's capability, it can autonomously request a toolset swap.
- **Secondary Intent Layer (Lock Bypass)**: Locked skills (like `/extraction`) will implement a "Secondary Intent Filter". High-priority global tools (e.g., `manageAccess`, `systemStatus`) remain active even during a lock.
- **Interruption Recovery**: For ambiguous multi-domain requests (e.g., "Correct name AND update marks"), the agent will trigger a contextual confirmation: "I've updated the name. Should I switch to the /grading skill to update the marks?"

### 2.3 Performance Optimization: "Skill-Locked Toolset"
- **Progressive Disclosure**: Tools are only loaded into the agent's active context when a specific skill is triggered, preventing "tool-soup" and preserving the context window.
- **Session Persistence**: Once a Skill is triggered (via slash command or autonomous switch), the corresponding toolset is kept active for the **entire duration** of the skill session. This eliminates "injection hop" latency and provides an instantaneous agent experience. Tools are only evicted when switching skills or explicitly clearing the session.

## 3. UI/UX Architecture: The 4-Panel Workspace

EdApex will adopt the high-density layout from `hermes-webui`, organized as a CSS Grid/Flex hybrid. The core philosophy is **Task-Centricity**, where and the UI adapts to the current workflow.

#### [REFACTOR] Hermes Grid Layout
```svelte
<!-- src/routes/(chat)/AppLayout.svelte -->
<div class="grid h-screen w-full grid-cols-[64px_320px_1fr_400px] grid-rows-1 overflow-hidden bg-background">
  <AppRail />
  <AppSidebar />
  <main class="relative flex h-full flex-col overflow-hidden border-x bg-muted/30">
    <ChatHeader />
    <ChatStream />
    <ChatComposer />
  </main>
  <WorkspacePanel />
</div>
```

#### [LEGACY PURGE] Layout & Global Context
The implementation of the Hermes Grid enables the removal of these legacy UI artifacts:
- **`src/routes/(chat)/+layout.svelte` [DELETED]**: The entire `Sidebar.Provider` structure (Lines 101-110) will be replaced.
- **`src/lib/context/ai-context.svelte.ts` [DELETED]**: The logic for syncing model and tools (Lines 78-81) is replaced by the Mastra stream.
- **`src/lib/context/sync.svelte.ts` [GUT]**: Remove `SelectedModel`, `SelectedClass`, and `SelectedAgent` (Lines 39-46). These are replaced by the unified `WorkspaceContext`.

### 3.1 Execution Flow (The Orchestration Path)
The following diagram illustrates the path from user input to response, highlighting the Supervisor's role in intent gating and context injection.

```text
               [ USER INPUT ] ChatComposer Prompt (Chat / Slash Command / Voice / Upload PDF/Images/Word/Excel...)
                     │
                     ▼
       ┌────────────────────────────┐
       │   SUPERVISOR (Gateway)     │
       │  (Intent & Confidence & Slash Command & Others)     │
       └─────────────┬──────────────┘
                     │
          [ CONTEXT INJECTION ]  <─── (Workspace / School, Class, Section, exam, subject, academic year, Workspace/workflow context and other Dynamic Context)  (confirm if this already exist or needs to be refactored or re-implemented from scratch)
                     │  
           ┌─────────┴─────────┐
           ▼                   ▼
    [ MUTATION? ]       [ CONVERSATION? ]
           │                   │
     ┌─────┴─────┐       ┌─────┴─────┐
     ▼           ▼       ▼           ▼
 [ < 90% ]   [ > 90% ] [ SKILL? ] [ GENERIC? ]
     │           │       │           │
     ▼           ▼       ▼           ▼
[ APPROVAL ] [ WORKFLOW ] [ ASSISTANT ] [ DEFAULT ]
[  CARD ] [ WORKFLOW RUNNER   ] [ (SKILLS)  ] [ (PURE)  ]
     │           │       └─────┬───────┘     │
     │           │             │             │
     │           │             ▼             │
     │           │      [ GLOBAL TOOLS ]     │
     │           │     (Search / Fetch)      │
     │           │             │             │
     ▼           ▼             ▼             ▼
   [ UI (Overlay on ChatComposer) ] <── [ MEMORY ] <── [ RESPONSE (EdapexGateway.stream() OR EdapexGateway.generate() (goes to Workspace Panel as a markdown formatted response ready end user review and action)) ] <──┘
```

### 3.2 The Hermes 4-Panel Grid
The application shell implements the high-density **Hermes Agent** layout, designed for complex task management:

1.  **The Rail (`AppRail`)**: Far-left narrow bar (64px). Houses global navigation icons (Chat, Calendar, Skills, Files, Settings).
2.  **The Sidebar (`AppSidebar`)**: Left panel (resizable).
    - **Header**: Search bar + "New Conversation" button.
    - **Filters**: Horizontal pill-style filters (All, Test, Foo, etc.).
    - **Feed**: Grouped conversation lists (Pinned, Today, This Week).
    - **Footer**: Profile switcher and application-level settings.
3.  **The Main Stage (`ChatPane`)**: Central workspace.

### 3.2 Role & Designation Resolution (The Whitelist)
- **Supported Designations**: Initial rollout restricted to:
  - **IT** (ID 1)
  - **Coordinator** (ID 5)
  - **Class Teacher** (ID 8)
- **@Mention Capabilities**:
  - **Class Teacher**: Can `@mention` Students and Files within their assigned sandbox.
  - **IT / Coordinator**: Can `@mention` Students, Files, and **Classes**. 
- **Dynamic Context Loading**: 
  - `@mention[Class]` triggers a background fetch: `studentRepo.getStudentsByClassSection(id)`.
  - Only the resulting student IDs are injected into the Agent's "Lookup Index," avoiding context bloat and preserving privacy.
- **Context Clarification**: If a Global User (IT/Coord) initiates a command without a Class `@mention`, the Agent **MUST** prompt: "Which class and section should I apply this to?" before proceeding.
- **Hydration**: Access attempts from other designations will return a `403 Forbidden`.

### 3.3 The #ChatComposer
The Composer is the control center for Dynamic Skill Injection.
- **Context Chips**: Visual indicators for the active Workspace (Class), Profile, and the dynamically injected Skill/Toolset.
- **Slash Commands**: Integrated autocomplete for Mastra Skills (e.g., `/extract`, `/publish`).
4.  **The Workspace Panel (`WorkspacePanel`)**: Right panel (resizable).
    - **Header**: Breadcrumbs, status pills (e.g., "MAIN"), and CRUD actions (Add, Refresh, Expand).
    - **File Tree**: Reactive filesystem explorer with directory collapsing and file-type icons.

### 3.2 Skill-Aware Composer (`#composerBox`)
The Composer is the control center for Dynamic Skill Injection.
- **Slash Commands**: Integrated autocomplete for Mastra Skills. Typing `/` triggers a list of available actions (e.g., `/extract`, `/enroll`, `/notify`).
- **Context Chips**: Visual indicators for the current workspace (Class/Section), active Profile, and the dynamically injected Skill/Toolset.

### 3.3 Managed Workspace Filesystem (Interactive)
The `WorkspacePanel` (`.rightpanel`) is a full-featured "managed environment" for files within the current `classId_sectionId` bucket.

- **Direct CRUD**:
  - **Create**: New files can be created directly in the panel.
  - **View/Edit**: Built-in editor for text-based files (.txt, .md, .json) and preview for PDFs/Images.
  - **Delete**: Permanent removal with confirmation.
- **Metadata & Organization**:
  - **Pinning**: Important files can be pinned to the top of the explorer.
  - **Tagging**: Files can be tagged with custom metadata (e.g., `#processed`, `#invalid`).
  - **Marking**: Visual indicators for file status.
- **Agent Integration**:
  - Files mentioned in chat or generated by tools (e.g., PDF results) are automatically visible here.
  - Agents "see" the filesystem structure and can query/update metadata via specialized Mastra FS tools.
- **Live Sync**: The UI reflects the filesystem state in real-time.
- **Direct Editing**: Built-in Monaco/ProseMirror editor for code and markdown files.

### 3.4 Responsive Strategy (Smart-Stacking)
To ensure accessibility on 13-15" screens and mobile:
- **Collapsible Panes**: Both the Sidebar and Workspace Panel can be collapsed to the Rail, expanding the Main Stage to 100% width.
- **Adaptive Composer**: Context chips and action menus wrap or move to drawers on narrower screens to prevent input crowding.
- **Touch-Optimized Rails**: Interactive elements in the Rail and Sidebar expand for better tap accuracy on mobile. 

- **Agent Awareness**: Agents can read from and write to this filesystem directly via the synchronized manifest

#### [REFACTOR] Workspace Panel Component
```svelte
<!-- src/lib/components/mastra/workspace-panel.svelte -->
<script lang="ts">
  import { useFiles } from '$lib/context/file-context.svelte';
  import FileExplorer from './file-explorer.svelte';
  
  const files = useFiles();
  let searchQuery = $state('');
</script>

<aside class="flex h-full flex-col border-l bg-background">
  <header class="flex items-center justify-between border-b p-4">
    <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
    <Button variant="ghost" size="icon" onclick={refreshFiles}>
      <RefreshCw class="h-4 w-4" />
    </Button>
  </header>
  
  <div class="flex-1 overflow-y-auto p-4">
    <FileExplorer {files} {searchQuery} />
  </div>
</aside>
```

---

### 4.1 Micro-Skill Tool Taxonomy
To maximize reliability on models with limited reasoning, the system uses **Micro-Skills (Task Bundles)**. Instead of large monolithic toolsets, tools are grouped into narrow, instruction-first bundles (max 4 tools per skill).

#### [LEGACY PURGE] High-Fragmentation Tools
The migration to Micro-Skills renders 31 legacy tools in `src/lib/chat/tools/` obsolete:
- **`coordinator.tool.ts` [DELETED]**: Replaced by `manageResults`, `searchEntity`, and `onboardEntity`.
- **`result.tool.ts` [DELETED]**: Replaced by `manageResults` and `patchEntity`.
- **`index.ts` [DELETED]**: The manual tool bundling logic is replaced by the `SkillRegistry`.

- **🚀 `onboardBundle`**: Narrow set for registration (`registerStudent`, `resolveClass`).
- **📊 `gradingBundle`**: Narrow set for mark entry (`saveMark`, `calculateTotal`).
- **🔐 `accessBundle`**: Narrow set for lifecycle (`disableUser`, `resetPassword`).

#### [REFACTOR] Core vs. Bundle Tools
To prevent "skill thrashing," the system distinguishes between **Core Tools** (always injected) and **Skill Bundles** (injected on-demand).

1. **Core Tools** (Max 3):
    - `getWorkspaceContext`: Fetches current class/section/student manifest.
    - `searchEntity`: Fuzzy search for students or staff.
    - `switchSkill`: Autonomous intent-based skill swapping.

2. **Skill Bundles** (Max 4 each):
    - **`grading`**: `upsertResult`, `upsertAttendance`, `upsertRemark`, `validateResults`.
    - **`onboarding`**: `createStudent`, `assignSection`, `registerStaff`.
    - **`governance`**: `resetPassword`, `updateStatus`, `deleteEntity`.

#### [REFACTOR] Mastra Tool Definition (Scoped Pattern)
Tools DO NOT use global singleton repositories. They use the `ScopedRepositoryProvider` passed via Mastra context.

```typescript
// src/lib/server/mastra/tools/grading.ts
import { createTool } from '@mastra/core/tool';

export const upsertResult = createTool({
  id: 'upsertResult',
  description: 'Manage academic marks (create/update/read)',
  inputSchema: z.object({ ... }),
  execute: async ({ input, context }) => {
    // Repository Factory ensures schoolId isolation
    const { schoolId } = context.tenantContext; 
    const resultRepo = context.getRepo(ResultRepository); 
    return await resultRepo.upsertStudentResult(input);
  },
});
```

### 4.2 Legacy to Atomic Tool Mapping
To ensure **zero feature loss** during the migration, the 31 legacy tools are collapsed into 12 atomic Mastra equivalent actions:

| Legacy Tool (Source) | Mastra Skill | Atomic Tool (Target) | Slash Commands | Logic Flow |
| :--- | :--- | :--- | :--- | :--- |
| `getClassStudentList`, `getStudentList`, `searchStudent`, `searchStaff`, `searchClassSection` | **Core** | `searchEntity` | `/search`, `/find` | Unified fuzzy search across all user/class repositories. |
| `upsertAttendance`, `upsertTeacherRemark`, `upsertStudentRatings`, `upsertMarkStore`, `upsertStudentResult` | **Grading** | `manageResults` | `/grade`, `/mark`, `/attendance` | Generic Result repository handler with type discrimination. |
| `createStudent`, `registerStaff`, `assignClassSection` | **Onboard** | `onboardEntity` | `/register`, `/enroll`, `/assign` | Transactional registration with role-based profile creation. |
| `changeStudentName`, `changeParentEmail`, `updateStudentDetails`, `updateExamTitle` | **Gov** | `patchEntity` | `/update`, `/edit`, `/rename` | Targeted updates using the `GenericRepository.patch` pattern. |
| `resetPassword`, `updateStaffStatus`, `deleteStaff`, `updateStudentStatus` | **Gov** | `manageAccess` | `/ban`, `/reset`, `/suspend` | Lifecycle state mutations (Active/Banned/Deleted). |
| `validateClassResults`, `sendStudentResult`, `publishResults` | **Workflows** | `PublishResultsWorkflow` | `/publish` | Batch email dispatch + Timeline updates. |
| `runExtraction` | **Workflows** | `ExtractionWorkflow` | `/extract`, `/generate` | `/generate` handles the full Drafting -> JSON flow. |
| `getMappingData`, `onboardEntity` | **Core** | `onboardEntity` | `/onboard`, `@student` | Resolved within workspace `class_section` boundary. |

### 4.3 Injection Workflow
1. **Initial State**: Gateway Agent starts with zero tools.
2. **Skill Trigger**: Based on a slash command (e.g., `/onboard`) or autonomous intent detection, a task-specific Skill is loaded.
3. **Persistent Ingestion**: Mastra injects the micro-toolset and skill segment into the session.
4. **Active Duration**: The toolset remains available until the Skill is changed or cleared, ensuring zero-latency follow-up turns.

### 4.3 Safe Fuzzy Resolution (Disambiguation Protocol)
- **Identity Priority**: Tools first attempt exact matches (DB ID or unique Admission Number).
- **Ambiguity Signal**: If multiple candidates are found (e.g., two students named "John"), the tool returns a `NEEDS_CLARIFICATION` status instead of executing the mutation.
- **Candidate Presentation**: The Gateway Agent presents the candidates (Name, Class, Section) to the user for explicit confirmation.
- **Audit Logging**: Every fuzzy resolution is tagged with `source: "fuzzy_match"` in the audit logs for 100% traceability.

- **Residency**: Active Skill state is persisted in the `mastra_metadata` table to survive process termination.

### 4.5 Software Fault Tolerance (Isolated Boundaries)
- **Isolated Error Catching**: Critical in-process loops (File Watcher, Workflow SSE Streams, Metadata Sync) are wrapped in **Strict Error Boundaries**.
- **Non-Fatal Failures**: An error in a specific workflow (e.g., PDF generation) is logged to `mastra_logs` but **CRITICAL**: it never bubbles up to crash the main SvelteKit process.
- **Auto-Healing Watcher**: If the `chokidar` instance encounters a FSEvent error, it is disposed of and a new instance is instantiated automatically.
- **Health Endpoint**: `/api/mastra/health` provides real-time status of the Watcher, DB Pool, and Active Workflow Queue.

---

## 5. Memory & Persistence (Mastra Native)

[LEGACY PURGE]: All current `ai_` tables are **DEPRECATED**. We will migrate to Mastra's native storage system.

### 5.1 Storage Adapter (The LibSQL Sovereign)
- **Configuration**: Mastra uses **libSQL (self-hosted SQLite file: `file:./mastra.db`)** via `@mastra/storage-libsql` for all AI-related data:
  - **Memory**: Threads and Messages, strictly isolated per `userId`.
  - **State**: Workflow run history and tracing.
  - **Provider Credentials (NEW)**: API keys and models are moved from MySQL to a `provider_credentials` table in this isolated file.
- **Strict Dual-DB Isolation**: The AI layer becomes **100% self-contained**. It no longer reads from MySQL for API keys or routing logic.
- **Privacy Hardening**: Every AI-specific table (`agent_routing`, `provider_credentials`, `agent_settings`) is bound by an indexed `userId` field to ensure user-level data sovereignty.
- **Zero Schema Change**: No manual DDL changes to the school MySQL schema are required.

### 5.2 Workspace Inheritance (Memory Scoping)
Threads are bound to the **Workspace Geography** using Mastra's Thread Metadata:
- **Thread Metadata**: Every conversation is tagged with `{ schoolId, classId, sectionId, examId }`.
- **Inheritance Access**:
  - **Shared Threads**: Any staff member assigned to a workspace can retrieve threads filtered by `{ classId, sectionId }` within their `schoolId`.
  - **Privacy**: Threads without workspace tags remain private to the `userId`.
- **Hydration**: When a thread is loaded, the Gateway Agent's `memory` is automatically hydrated with the conversation history, ensuring continuity across staff assignments.

### 5.3 Persistent Execution Traces
To ensure production-grade observability for multi-step tasks (batch OCR, publishing), every Mastra execution is tracked:
- **`mastra_runs` Table**: A specialized table in the local libSQL (`file:./mastra.db`) persists every `WorkflowRunId`, its step-by-step transitions, and raw JSON outputs/errors.
- **Trace Persistence**: Hooks (`onStepSuccess`, `onStepError`) capture the exact tool inputs/outputs and LLM reasoning steps, ensuring that if a worker thread fails or rate limits are hit, the state is preserved.
- **Dual-DB Isolation**: This execution history remains strictly inside the agent-layer libSQL, never impacting the performance of the school's MySQL DB.
- **UI Exposure**: These traces are mounted directly into the **Panel 4 (Inspector)** "Run History" view, allowing staff to diagnose "Why did 5/50 students fail?" without IT intervention.

### 5.3 Hydration Failure Contract
If the 3-tiered context hydration returns a null/empty `workspaceManifest` for a protected AI chat route, the following strict cascade applies:
1. **Route Guard (`hooks.server.ts`)**: The SvelteKit server hook immediately redirects the user to `/pending-assignment` before the Mastra agent is ever instantiated. No partial agent initialization is permitted.
2. **Agent Prompt Guard**: The Gateway Agent's system prompt contains an explicit null-workspace guard: if `TenantContext.classId` is null at runtime, all slash commands are refused with a user-facing message: *"Your workspace has not been configured. Please contact your administrator."*
3. **Workspace Badge Warning State**: The Active Workspace Badge in the UI displays a distinct **"Unassigned ⚠"** warning indicator — never silently empty.

### 5.3 AI Artifacts (Source of Truth)
- **Primary Source**: Every AI-generated output is persisted as an immutable **JSON Artifact/Markdown** in the workspace directory.
- **Dynamic PDF Generation**: PDFs are **NOT** stored on disk. They are rendered on-demand (`/api/pdf/[token]`) by PrinceXML, using the JSON artifact as the source.
- **Verification**: The 4th panel (`WorkspacePanel`) displays the Markdown preview of these artifacts for instant human review before "Publishing."

## 6. Observability & Hybrid Logging

### 6.1 Domain-Level Audit (sm_student_timelines)
Critical AI actions (e.g., mark updates) are mirrored to the domain timeline for historical traceability:
- **Result Events**: When a tool (e.g., `manageResults`) executes, it writes a structured entry to `sm_student_timelines`.
- **Attribution**: The timeline entry includes the `modelId` and `threadId` for cross-referencing.

### 6.2 Mastra Telemetry (OTel)
- **Local Dev**: Use Mastra's built-in OTel exporter for real-time trace viewing.
- **Production**: Pipe traces to the application logger for centralized monitoring without external dependencies.

### 6.2 Mastra telemetry (OpenTelemetry)
- **Local Dev**: Mastra's built-in OTel exporter will be used for real-time trace viewing via the Mastra's native UI.
- **Production**: Traces are piped to the application logger for log-based observability without external dependencies like Jaeger.

## 7. Security & Governance

### 7.1 Multi-Tenant Isolation (The Scoped Provider)
- **Repository Factory**: Global singleton repositories are deprecated for use within Mastra. All tools must use the `repoFactory`:
  - `const studentRepo = context.getRepo(StudentRepository);`
  - **Auto-Isolation**: The factory injects the `TenantContext` (schoolId, academicId) into the constructor.
  - **Drizzle Middleware**: Every query in a scoped repository instance automatically appends `.where(eq(table.schoolId, this.tenant.schoolId))`.
- **Security Context**: The `securityContext` is the immutable source of truth for the active session, preventing "Tenant Escape" via prompt injection.

### 7.3 Designation-Based Scoping
- **Global Access (IT/Coordinator)**: These roles can discover and use skills across all `classId_sectionId` workspaces within their school.
- **Workspace-Locked (Class Teacher)**: This role is strictly restricted to the `activeClassId` and `activeSectionId` assigned to them in the database. 
- **Validation**: Any tool execution for a Class Teacher must verify that the target `studentId` or `recordId` belongs to their assigned workspace.

## 8. Dynamic Skill Discovery (File Watcher)
- **Engine**: `chokidar` for real-time filesystem monitoring.
- **Reconciliation Logic**:
  - **Transactional Writes**: Use `tempfile` -> `fs.rename` for all agent writes to ensure the watcher only reacts to completed operations.
  - **Debounced Sync**: Sync events (FileSystem -> DB Manifest) are debounced by **500ms** to handle batch writes.
  - **Agent-Lock**: The watcher is temporarily paused for the specific file path while a Mastra agent is in a `WriteTurn` to prevent "self-echo" loops.

## 9. Async Operations & Reliability (Workflows)

### 9.1 Agentic Pipelines (OCR & PDF)
Critical multi-step operations are migrated to **Mastra Workflows** for observability and resume-ability.

#### [NEW] ExtractionWorkflow (/generate)
A Dual-Path pipeline optimized for volume and latency.

- **Instant Path (ChatComposer)**:
  - **Limit**: Max 4 images.
  - **Endpoint**: Serial `/v1/ocr` (Direct API) for sub-second responses.
  - **Context**: Hydrated via `@mentions` and active UI IDs (Class/Section/Exam).
  - **Inference**: Injects context into the `document_annotation_prompt` for **Single-Pass Mapping**.
  
  - **Batch Path (WorkspacePanel / DropZone)**:
  - **Limit**: Class-wide volume (30+).
  - **Endpoint**: `/v1/batch/jobs` (Asynchronous).
  - **Context**: User selects students per image in the DropZone UI.
  - **Persistence**: Encodes `studentId` into the **`custom_id`** of each JSONL line.
  - **Execution**: Each line includes a student-specific `document_annotation_prompt`.
  - **Monitoring**: SvelteKit endpoint proxies status; UI handles the polling.

### 10. Multi-Skill Orchestration (The Gateway Agent)
- **Direct Routing**: Users can target a skill explicitly via slash commands (e.g., `/extract`).
- **Autonomous Handoff**: 
  - If a user provides a natural language request that spans multiple skills, the **Supervisor** acts as the dispatcher.
  - It triggers a **Mastra Workflow** or routes to the **Assistant** for conversational execution.
- **Persona Resolution**: All orchestration turns use the `AgentRouter` to resolve the model for the active persona (Supervisor/Assistant/Default) or task (Extraction/Reasoning).

#### [NEW] High-Volume Batch Extraction
- **The Protocol**: Uses Mistral's specialized `/v1/batch/ocr` endpoint.
- **Pre-Processing**: The UI (`DropZone.svelte`) generates a JSONL file where each line encapsulates a student's context.
- **Mapping ID**: The **`custom_id`** field in the JSONL MUST follow the format `[student_id]:[exam_id]`.
- **Latency Handling**: 
  - The SvelteKit server submits the job and returns a `jobId`.
  - The UI initiates polling via a dedicated Polling Worker.
  - Once complete, the Agent is notified in chat: "Batch extraction for Class 10A complete. Results displayed in the Workspace Panel."

#### [NEW] Intent Confidence Gate
To prevent supervisor hallucinations or ambiguous action triggers, the following safety rail is enforced:
- **Confidence Threshold**: For every intent classification by the Gateway Agent Supervisor, a confidence score is calculated. 
- **The 90% Rule**: If confidence is **< 90%** for any mutation-based workflow (extract, validate, publish, update), the agent **must not** execute the tool.
- **Intent Validation Card**: Instead of executing, the agent returns a `NEEDS_CONFIRMATION` status. The UI then renders an interactive **Intent Validation Card** in the chat stream with primary action buttons (e.g., "Confirm: Extract Grade Results" vs "Cancel").
- **Audit**: Every auto-triggered workflow via base natural language (without slash prefix) is logged with its `intent_confidence` score in the `mastra_runs` trace.

#### [REFACTOR] PublishResultsWorkflow Steps
```typescript
// src/lib/server/mastra/workflows/publish-results.ts
const publishResultsWorkflow = new Workflow({
  id: 'publish-results',
  steps: {
    prepData: {
      action: async ({ input }) => await resultRepo.getResultsBatch(input.studentIds, input.examId),
    },
    generatePDFs: {
      dependsOn: ['prepData'],
      action: async ({ results }) => {
        // Parallel batch generation with PrinceXML
        return await Promise.all(results.map(r => pdfGenerator.generate(r)));
      }
    },
    dispatchEmails: {
      dependsOn: ['generatePDFs'],
      action: async ({ pdfs }) => {
        // Hydrate from security context
        return await JobWorker.runTask({ type: 'send-email', data: pdfs });
      }
    },
    auditTimeline: {
      dependsOn: ['dispatchEmails'],
      action: async ({ results }) => {
        await auditAIAction(results.studentId, 'Mark Publication', { examId: input.examId });
      }
    }
  }
});
```

#### [NEW] ValidationWorkflow Steps
Centralizes the transition from "Agent Memory" to "Institutional Record".

```typescript
// src/lib/server/mastra/workflows/validation.ts
const validationWorkflow = new Workflow({
  id: 'validation-workflow',
  steps: {
    validateSchema: {
      action: async ({ input }) => {
        // Validates OCR buffer against resultInputSchema
        return await resultInputSchema.safeParseAsync(input.data);
      }
    },
    applyBusinessLogic: {
      dependsOn: ['validateSchema'],
      action: async ({ results }) => {
        // Calculates grades, GPAs, and formats attendance
        return applyGradingBusinessLogic(results.data);
      }
    },
    commitToDB: {
      dependsOn: ['applyBusinessLogic'],
      action: async ({ results }) => {
        // Atomic transaction for marks, results, ratings, and remarks
        return await assessment.upsertStudentResult(results);
      }
    },
    generateVerification: {
      dependsOn: ['commitToDB'],
      action: async ({ results }) => {
        // Returns student info + secure PDF preview tokens
        return formatVerificationSummary(results);
      }
    }
  }
});
```

#### [LEGACY PURGE] Workflow Logic Gutting
- **`src/lib/server/service/assessment.service.ts` [GUT]**: The redundant `publishResults` orchestration logic (Lines 93-250) is **REPLACED** by a simple call to the `PublishResultsWorkflow.execute()`. This removes ~150 lines of brittle, unobservable code.

- **State Persistence**: Workflows will persist state using **MySQL-backed Storage** instead of local JSON files.
  - **Why?**: JSON file-backups are prone to race conditions and lock contention in a multi-user workspace. MySQL provides row-level atomicity.
  - **Compatibility**: Scoped by `classId_sectionId` to ensure a new staff member can resume a "stuck" workflow initiated by a predecessor.

## 10. UI/UX Strategy: The Hermes Redesign ("Gold on Slate")

EdApex is migrating to a **4-Panel Architecture** to maximize orchestration velocity. The design adopts the **EdApex Design System** (Gold on Slate) while utilizing the Hermes layout DNA.

### 10.1 The 4-Panel Layout
- **Panel 1: Global Rail**: Slim vertical bar (Desktop) or Bottom Bar (Mobile) using `oklch(0.65 0.15 40)` highlights on a charcoal base.
- **Panel 2: Context Sidebar**: Entity-specific discovery (Students, Conversations, Skills).
- **Panel 3: Workspace Stage (Arena)**: The high-contrast interactive interactive area + `ChatComposer`.
- **Panel 4: Inspector Panel (Workspace Panel)**: Collapsible "Audit & Artifact" surface for JSON/Markdown verification.

### 10.2 The High-Velocity ChatComposer
- **Context Chips**: Interactive `Badge` components in the "Gold on Slate" palette.
- **Adaptive Tray**: On mobile, chips stack into a horizontal scroll tray above the keyboard.
- **Terminal Dock**: Real-time Mastra traces piped into a monospaced "Geist Mono" dock.

### 10.3 Interactive Feedback & Progress
- **Approval Overlays**: Tools requiring confirmation trigger a shadcn `Dialog` or `Sheet` flyout with a pre-flight impact summary.
- **Progress Banners**: Mastra Workflows pipe real-time progress to a global `AppStatus` store, rendered via a `Progress` bar in the Action Rail.
- **Refresh Hints**: Mastra tools trigger targeted SvelteKit invalidation loaders for zero-flicker updates.

## 11. Core Operational Workflows (Staff Case Study)

To ensure consistency in implementation, the following sequential staff workflows must be natively supported.

### 11.1 The Result Processing Cycle

Staff members follow this standard sequence for assessment management:

1.  **`/extract` (Ingestion Phase)**:
    *   **Action**: Image upload (drag & drop) or `/extract` slash command.
    *   **Logic**: Triggers the `ExtractionWorkflow`. Handles dual-path OCR extraction and hydrates the workspace.
    *   **Instant Path (ChatComposer)**:
        *   **Trigger**: `/extract` or drop <= 4 images into chat.
        *   **Volume**: Max 4 images.
        *   **Latency**: Serial `/v1/ocr` for sub-second responses.
    *   **Batch Path (Workspace Panel / DropZone)**:
        *   **Trigger**: Manual upload of 5+ images via the Sidebar/Workspace panel.
        *   **Volume**: Class-wide volume (30+).
        *   **Execution**: Asynchronous `/v1/batch/jobs` with `custom_id` student mapping.
    *   **Constraint**: Coordinators and IT **must** @mention a `@Class/Section` to provide target context if not already set.

2.  **`/validate` (Integrity Phase)**:
    *   **Action**: `/validate` slash command.
    *   **Logic**: **Resumes the suspended Mastra Workflow Run** associated with the current `TenantContext`. All OCR state is read from the Workflow State snapshot — no school DB reads required at this stage.
        *   **`validateSchema`**: Validates OCR state against `resultInputSchema` in-memory.
        *   **`applyBusinessLogic`**: In-memory calculation of grades, GPAs, and formatting.
        *   **`commitToDB`**: **Only at this final step** does data cross the agent/school-layer boundary — executing atomic `assessment.upsertStudentResult` via `TenantContext`.
    *   **Output**: Returns a validation summary for all students in the class.
    *   **Student Mention**: If a student is @mentioned, performs validation for that specific student only.
    *   **UI Feedback**: Displays student info, verification status, and a link to dynamically generate the preview PDF.

3.  **`/publish` (Distribution Phase)**:
    *   **Action**: `/publish` slash command.
    *   **Logic**: Triggers the `PublishResultsWorkflow`.
    *   **Scope**: Sends results to the mentioned student(s). If no student is mentioned, sends to the entire class/section.
    *   **Delivery**: Injects into student timelines and triggers SMTP email delivery.

4.  **`/switch` (Context Phase - Coordinator/IT Only)**:
    *   **Action**: `/switch @Class/Section`.
    *   **Cache Bust (Critical)**: `/switch` **synchronously flushes and rebuilds** the `Map<sessionId, TenantContext>` entry *before* returning any response. The 5-minute TTL applies to passive idle sessions only; active workspace switches always force a fresh context hydration.
    *   **Logic**: Dynamically switches the active management context to the mentioned class or section, re-hydrates the discovery sidebar, and limits `@mention` lookups to the newly selected target.
    *   **Workspace Badge Hard Gate**: Every subsequent command cross-references the resolved `@mention` entity's `classId` against `event.locals.tenantContext.workspaceLock`. On a mismatch (e.g., stale mention from old context), the agent **hard-rejects** the command and prompts the user to re-confirm the target class before proceeding.

### 11.2 Role-Based Workspace Permissions

| Role | Workflow Access | Context Requirement |
| :--- | :--- | :--- |
| **Class Teacher** | `/extract`, `/validate`, `/publish` | Fixed to assigned class/section. |
| **Coordinator (5)** | Full Access + `/switch` | Can manage any class/section via @mention. |
| **IT (1)** | Full Access + `/switch` | Global system-wide management capability. |

## 12. First-Class Responsiveness Mastery
- **Premium Fluidity**: Adaptive layouts that scale from 4-panel "Command Centers" (Desktop) to gesture-rich swipeable interfaces (Mobile).
- **Standalone PWA**: iOS/Android safe-area awareness with ServiceWorker background sync for offline workflows.

## 13. Token Efficiency (Low-Context Optimization)
- **Telegraphic Prompts**: Minified system instructions and tool descriptions (max 80 chars).
- **Auto-Summarization**: Sliding window memory that condenses old history into "Goal Context" blocks.

## 14. Migration Bridge (Parallel Rollout)
- **Route Isolation**: `src/routes/(chat)/chat-v2/[chatId]`.
- **Feature Flags**: Gated activation of the `HermesLayout` via `ENABLE_MASTRA_UI`.

## 15. Implementation Phases (Comprehensive Roadmap)

1.  **Phase 1: Zero-State Technical Foundation (P0)**
    - Disable global Mastra singletons; implement `Mastra` core engine context instances bound per-request (via `event.locals`) to guarantee absolute zero `TenantContext` leakage between concurrent user sessions.
    - Abstract and expand the native Node.js `worker_threads` pattern (currently managing `email-job.ts`) to serve as the structural backbone for all background async operations, safeguarding the main Node event loop from heavy Mastra OCR pipelines and PrinceXML generation.
    - Setup **libSQL (`file:./mastra.db`)** via `@mastra/storage-libsql` for Mastra memory and workflow run state. This is the sole storage backend for the agent layer, strictly isolated from the school MySQL DB.
    - Establish `ScopedRepositoryProvider` for UI state.
    - Migrate SDK routes and base Drizzle topologies.

2.  **Phase 2: The Hermes UI 4-Panel Scaffolding (P0)**
    - **Unified Sidebar (Panel 1+2)**: Stand up the `collapsible="icon"` sidebar layout (`app-sidebar.svelte`), integrating the horizontal AppRail (Brand, Primary Apps, Badges) as the collapsed state, and the vertical Context Sidebar (Thread Navigation, ScrollArea, context chips) as the expanded state.
    - **Panel 3 (The Arena)**: Setup the main chat message loop powered by `ai-elements` adhering strictly to the "Gold on Slate" aesthetic constraints.
    - **ChatComposer (The Input Island)**: Build the sticky bottom composer with resilient `@mention` hydration logic enforcing the explicit `TenantContext` bounds from Section 4, and the Model Selector enforcing the Provider Hierarchy.

### [NEW] LibSQL-Native EdApexGateway ([Custom Gateway](https://mastra.ai/models/gateways/custom-gateways))
To achieve absolute isolation, we discard the legacy MySQL-based routing and implement a libSQL-native `MastraModelGateway`:

- **Sovereign Configuration**: The gateway reads its API keys and hierarchy from the local `mastra.db` (libSQL) `provider_configs` table which fully configured via the UI settings -> AI Providers tab.
- **Isolation Boundary**: The AI layer is now **read-isolated** from the SMS MySQL DB. It only interacts with MySQL for domain-specific writes (timeline entries, grades) via the scoped repositories.
- **Initialization**: Instantiated per-request within `event.locals.mastra`.
- **Smart Model Routing**: Supports the standard format `edapex/[provider]/[model]`.
- **Failover Logic**: The Gateway intercepts provider errors (429/500) and automatically rotates to the next provider stored in the libSQL hierarchy (`Groq → Deepseek → Mistral → NVIDIA → OpenCode`).

---

3.  **Phase 3: Core Orchestrator & Identity Injection (P1)**
    - **Gateway Agent**: Hook up Supervisor logic for Intent classification and structural workflow triggering.
    - **Identity Layer**: Implement the 3-tiered context hydration (Identity Context, Workspace Manifest, User Context Profile) entirely within `hooks.server.ts`, attaching the resolved `TenantContext` to `event.locals` once per request. Subsequent agent turns within the same session read from a server-side in-memory `Map<sessionId, TenantContext>` (5-minute TTL) to eliminate redundant DB roundtrips. Cache is invalidated immediately on workspace assignment changes.
    - **Root Slash Commands (`/search`, `/find`)**: Build the `searchEntity` tool natively. 
    - **Disambiguation UI**: Inject interactive candidate-list cards into Panel 3 whenever the Gateway yields the `NEEDS_CLARIFICATION` state (as mandated by `slash_command_specs.md`).

4.  **Phase 4: Operational Skill Workflows & Contextual UI (P1)**
    - **Grading Flow (`/grade`, `/mark`, `/attendance`)**: Implement atomic handler tools and pipe validation data into Panel 3 as interactive `ai-elements` data grids for teacher verification before `upsert`.
    - **Onboarding Flow (`/register`, `/enroll`, `/assign`)**: Wire transactional bounds and render conversational schema fields iteratively back into the Panel 3 chat flow.
    - **Governance Flow (`/update`, `/edit`, `/ban`, `/suspend`)**: Pipe all mutation payloads through strict entity-specific Zod schemas (`.omit()` on protected fields like `id`, `role`, `schoolId`) before any Drizzle ORM write, preventing Mass Assignment vulnerabilities from hallucinated AI payloads.
    - **Panel 4 Binding**: Launch the collapsible Inspector UI to serve as the visual mounting point for Mastra workflow validation states.

5.  **Phase 5: Automated Workflows & Orchestration Tying (P2)**
    - **Extraction (`/extract`) Workflow**: Stitch Mistral Native OCR parsing; render live JSON staging buffers directly inside the Panel 4 Inspector.
    - **Publishing (`/publish`) Workflow**: Hook PrinceXML PDF generation jobs; mount preview PDF instances in Panel 4 prior to dispatch.
    - **Validation (`/validate`) Workflow**: Add manual approval nodes linking directly into the UI toggle components.

6.  **Phase 6: The "Big Purge" & Production Readiness (P2)**
    - **Zero-Config Skill Engine**: Finalize lazy injection of `.skill.md` rules.
    - **Legacy Decommissioning**: Rip out outdated Vercel AI SDK wrappers, `ai_session`/`ai_messages` schemas, and unused UI pane dependencies.
    - **UAT**: Validate complete layout responsiveness across Ultra-Wide, Tablet (Sheet morphing), and Mobile (Adaptive Bottom Nav). Load test AI routing against the fixed Cerebras/Mistral topology.

## 16. The Big Purge (Legacy Decommissioning)
Final transition phase after UAT verification.

### 16.1 Code & Logic
- **[DELETE]** `src/lib/server/service/agent.service.ts`: Replaced by Mastra Gateway Agent.
- **[DELETE]** `src/lib/chat/tools/*.tool.ts`: Deprecated in favor of atomic Mastra tools.
- **[GUT]** `src/lib/server/service/assessment.service.ts`: Refactored to proxy workflows.
- **[DELETE]** `src/routes/(chat)/+layout.svelte`: Replaced by Hermes AppLayout.

### 16.2 Database Schemas (The Schema Purge)
The following tables in `src/lib/server/db/schema.ts` will be **DELTED** once Mastra Memory is verified:
- `ai_sessions`
- `ai_chats`
- `ai_messages`
- `ai_documents`
- `ai_suggestions`
- `ai-votes`

*Note: Data from these tables MUST be migrated to Mastra's native storage if historical continuity is required for Phase 0.*

## 17. Model Registry & Hierarchical Routing

### 17.1 Centralized Model Registry
A single source of truth for all AI model capabilities and provider metadata resides in `src/lib/server/mastra/registry.ts`. This registry classifies models into tiers (`pro`, `mid`, `low`) and profiles (`strong`, `balanced`, `simple`).

### 17.2 The 6-Tier Hierarchical Routing Engine
The `AgentRouter` resolves models based on the following precedence:
1.  **Conversation Override**: Explicitly selected models (e.g., GPT-4o, Claude 3.5 Sonnet).
2.  **Deep Reasoning Mode**: A conceptual model choice that forces the best available reasoning-capable model.
3.  **Persona Mapping**: Manual user-defined assignments for specific personas (e.g., Supervisor assigned to GPT-4o).
4.  **Profile Selection**: Global profile setting (`strong`, `balanced`, `simple`) mapping to model tiers.
5.  **Thinking Toggle**: Real-time filtering to enable or suppress reasoning chains.
6.  **Global Fallback**: Standard lightweight model (e.g., Llama 3 8B via OpenGateway).

### 17.3 Thinking Toggle Mechanism
The "Thinking" toggle in the UI allows users to dynamically request reasoning for any selected model.
- If **Enabled**: The router attempts to find a reasoning-capable version of the profile or persona's assigned model.
- If **Disabled**: The router suppresses reasoning chains even for models that support it, ensuring faster response times.

### 17.4 UI Interaction Model
- **Model Selector**: Offers "Auto (Smart)", "Deep Reasoning", and specific model overrides.
- **Profile Selector**: Swaps the routing baseline between performance (`strong`) and efficiency (`simple`).
- **Mention Workflow**: Class selection is handled via `@mention` in the chat, removing redundant dropdowns.
