# EdApex Architecture

A detailed technical specification of the EdApex agentic school management system. This document is the canonical reference for how the platform's layers fit together, how a request flows end-to-end, and which invariants must be preserved by any change.

> **Scope.** Aimed at contributors and reviewers. It assumes familiarity with TypeScript and SvelteKit 2, but not with the project's specific patterns.
> **Companion docs.** [`AGENTS.md`](./AGENTS.md) — contributor contract. [`docs/slash_command_tool_hardening_plan.md`](./docs/slash_command_tool_hardening_plan.md) — the rationale for the per-request provider pattern. [`docs/responsive_design.md`](./docs/responsive_design.md) — UI rules.

---

## 1. Position

EdApex is an **agentic school management system**. School staff (coordinators, class teachers, administrators) operate a workspace where:

- They converse with a multi-agent AI assistant that has direct tool access to live school data (students, staff, classes, results, attendance).
- Slash commands in chat map to **atomic tools** (search, onboard, grade, assign, update, suspend, switch, status) and **workflow tools** (extract, generate, validate, publish).
- Workflow tools drive long-running, multi-step pipelines (transcript OCR → structured result generation → human-in-the-loop validation → PDF + email publish) with **suspend/resume** semantics.
- All data access and AI execution is bound to a **per-request `TenantContext`** that defines the active school, class, section, exam, and academic year. Cross-tenant access is impossible by construction.

The product surface (chat, file store, editor, demo, profile) is delivered as a **SvelteKit 2 / Svelte 5** progressive web app; the AI orchestration and the per-tenant data layer sit behind server-only modules under `src/lib/server/`.

---

## 2. Architectural Tenets

These invariants are non-negotiable. Every change is evaluated against them.

1. **No default-tenant singletons.** Any object that reads or writes school data must be constructed with an explicit `TenantContext`. The only legitimate module-level singletons are connection pools (MySQL `mysql2.Pool`, libSQL `LibSQLStore`) and `authRepo` (which operates on global session data, not tenant data).
2. **Tenant isolation is enforced at the data-access boundary, not at the connection boundary.** One libSQL connection serves all tenants; isolation is at `threadId` / `resourceId` / `schoolId` query filters.
3. **The Mastra singleton owns lifecycle, request context owns identity.** The `Mastra` instance is process-wide so that memory/agent-lifecycle hooks fire correctly. Per-request `RequestContext` carries the tenant, model, and intent flags.
4. **Tools are split into `*Logic` (pure, testable) and the Mastra `createTool` wrapper.** All business logic lives in `*Logic` functions that take a `MastraToolContext`; the wrapper only adapts the tool-execution bridge.
5. **State mutations require 90% supervisor confidence; read-only intents require 70%.** Anything below the threshold prompts for clarification instead of executing.
6. **Skills are version-controlled `*.skill.md` files** parsed at startup (and hot-reloaded in dev) — never hard-coded agent instructions.
7. **Every state-mutating tool uses Zod `.omit()` on input** to prevent mass-assignment of protected fields.
8. **All AI storage is sovereign.** MySQL `ai_*` tables are decommissioned. Thread memory, agent routing, provider credentials, and skill state live on libSQL (`storage/edapex-mastra.db`).

---

## 3. Layered View

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser (PWA)                                                              │
│  Svelte 5 + runes • bits-ui + ai-elements + prompt-kit • Tiptap • @embedpdf │
└────────────────────────────────────────────────────────────────────────────┘
                │  HTTP / SSE                                       ▲ JSON
                ▼                                                    │
┌────────────────────────────────────────────────────────────────────────────┐
│  SvelteKit 2 — `src/routes/`                                                │
│  (auth) (chat)  api/ai api/auth api/chat api/file api/results …             │
│  hooks.server.ts → event.locals.{user,session}                              │
│  +server.ts / +page.server.ts / `*.remote.ts` (SvelteKit RPC)               │
└────────────────────────────────────────────────────────────────────────────┘
                │  RequestContext (tenant, model, intent flags)
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Mastra Runtime — `src/lib/server/mastra/`                                  │
│  Singleton:    `mastra` (storage, server middleware, agent registry)        │
│  Per-request:  `EdApexGateway` (multi-provider, encrypted keys, failover)   │
│                `ScopedRepositoryProvider` (tenant-bound repo cache)         │
│  Agents:       supervisor → assistant, title, editor*, result-mapper        │
│  Tools:        8 atomic (core|onboard|grading|gov|global) + 4 workflow     │
│  Workflows:    editor-command, extraction, generate, publish, validation    │
│  Skills:       SkillRegistry + SkillWatcher (chokidar hot-reload)           │
│  Storage:      createMastraStorage() — libSQL WAL singleton                 │
└────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Data Layer                                                                 │
│  MySQL (Drizzle, `sms_*` schema — 174 tables, school data)                  │
│  libSQL (Mastra memory, agent_routing, provider_credentials, skills.json)   │
│  Filesystem (`storage/`, `static/`, ephemeral test fixtures in tests/.tmp)  │
└────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Background Workers — `src/lib/server/worker/`                              │
│  JobWorker runs Node `worker_threads` per job type (email-job)              │
│  Returns {jobId, status, result} via parentPort                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tenant Isolation Model

The most important invariant in the system. Every line of code that touches user data or invokes an AI tool must respect the `TenantContext` contract.

### 4.1 `TenantContext` shape

`src/lib/server/mastra/tenant-context.ts:9`

```ts
export interface TenantContext {
  readonly schoolId: number;
  readonly userId: number;
  readonly designationId: number;
  readonly staffId: number;
  readonly roleId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly examId: number | null;
  readonly academicId: number | null;
  readonly studentId: number | null;
}
```

It is **frozen at construction** (`Object.freeze`) so no downstream code can mutate the active context mid-request. The `classId` / `sectionId` pair is the "workspace lock" — a class teacher can only operate on their own class+section.

### 4.2 Per-request `ScopedRepositoryProvider`

`src/lib/server/mastra/scoped-repository.ts:19` caches Drizzle repositories (`ResultsRepository`, `StudentRepository`, `StaffRepository`, `TimelineRepository`, `ParentRepository`, `JobRepository`) keyed by class name. The cache is bound to the provider's lifetime, which is the request. When the request ends, the cache is GC'd.

The provider also owns a `ConfigurationCache` (Slice 9 refactor) that replaces a previous process-wide `Map<schoolId, ConfigurationCache>`. Now each request has its own cache of general settings, academic years, and exam types for its tenant.

### 4.3 The bridge — `buildMastraToolContext`

Mastra's `ToolExecutionContext` carries a `RequestContext` (a key-value bag). The `*Logic` functions expect a strongly-typed `MastraToolContext`. `buildMastraToolContext` is the single bridge that performs the translation:

```ts
export async function buildMastraToolContext(
  requestContext: RequestContext | undefined,
  mastra?: unknown,
): Promise<MastraToolContext>
```

It reads `tenantContext`, `threadId`, `modelId` from the request context, awaits the singleton Drizzle client via `getDatabase()`, and constructs a fresh `ScopedRepositoryProvider` for the call. When `requestContext` is `undefined` (unit tests), it returns a locked default whose `getRepo`/`getService` throw — this lets tests hand-build a `MastraToolContext` and still type-check against the same interface.

### 4.4 Workspace lock

`validateWorkspaceLock(context, targetClassId, targetSectionId)` (`tenant-context.ts:68`) throws `WorkspaceMismatchError` if the target class/section is outside the caller's active workspace. Called from destructive tools (`onboardEntity`, `patchEntity`, `assignEntity`) before any state mutation.

### 4.5 Role whitelist

`validateRoleWhitelist(context, allowedRoles)` throws `ForbiddenError` if the caller's `designationId` is not in the allow-list. The `gov` tools (suspend, access, password) restrict themselves to principal/coordinator roles.

### 4.6 Cache

`TenantContextCache` (`context-cache.ts`) keeps a per-session 5-minute TTL cache. The `/switch` slash command calls `bustCache()` synchronously so the next request re-hydrates from the database.

---

## 5. The Agent System

### 5.1 Registry

The Mastra singleton (`mastra/index.ts:35`) registers seven agents:

| ID | Name | Role | Memory | Tools |
|---|---|---|---|---|
| `supervisor` | EdApex Supervisor | Entry-point orchestrator. Classifies intent, optionally calls `getContext`, delegates to `assistant`. | libSQL (10 messages) | `getContext` |
| `assistant` | Assistant | Worker agent. Resolves tools dynamically via `resolveToolsForMessage()`. | libSQL (10 messages) | skill-resolved |
| `title` | Title Generator | Generates conversation titles. | — | — |
| `editorEdit` | Editor Edit | Rewrites selected markdown in Tiptap. | — | — |
| `editorGenerate` | Editor Generate | Generates or explains editor content. | — | — |
| `editorCopilot` | Editor Copilot | Inline ghost-text continuations. | — | — |
| `result-mapper` | Result Mapper | Maps OCR markdown → `ResultOutput` (read-only, 70% confidence). | — | — |

`editorEdit`, `editorGenerate`, `editorCopilot`, and `result-mapper` are **standalone** — they sit outside the supervisor hierarchy. They are invoked directly by workflow steps or the editor UI, not by user chat.

### 5.2 Supervisor delegation

`supervisor.ts:48` — the supervisor MUST delegate every user request to `assistant`. The supervisor's own tool set is intentionally minimal (`getContext` only) so it cannot mutate state directly; the assistant executes all actions.

### 5.3 Request context schema

`agents/shared.ts:15` defines the Zod-validated `RequestContextValues`:

```ts
{
  tenantContext: { schoolId, userId, designationId, staffId, roleId?,
                   classId?, sectionId?, examId?, academicId?, studentId? },
  modelId?:        string,    // gateway-prefixed model id
  instructions?:   string,    // optional per-request override
  isSlashCommand?: boolean,   // true → mutation tools may be resolved
  lastMessage?:    string,    // used for slash-command matching
}
```

The `model` and `instructions` callbacks on each agent read these values lazily, so a single agent instance serves every tenant with the right config.

### 5.4 Default models

`agents/shared.ts:53` uses `opengateway/mimo-v2.5-pro` (keyless, 1M context) as the default, with `groq/llama-3.1-8b-instant` as the default for title, copilot, and editor agents (fast, cheap, deterministic).

### 5.5 Model registry

`registry.ts` exports `MODEL_REGISTRY: ModelDefinition[]` — a static catalogue of every supported model with provider, tier, context window, max output, and capability flags. The user-facing model selector (`components/model-selector.svelte`) and the gateway both consume this registry. Models are addressed as `<provider>:<api-name>` (e.g. `groq:llama-3.3-70b-versatile`).

---

## 6. The Tool System

### 6.1 Why the `*Logic` split

Every tool has a `*Logic` function that takes `(context: MastraToolContext, ...args)` and a Zod-validated `*Schema`. The Mastra `createTool({...})` wrapper is a thin adapter that calls `buildMastraToolContext(context.requestContext)` and forwards to the logic. This split means:

- All business logic is unit-testable without a Mastra runtime.
- The same `*Logic` is reusable from non-tool contexts (e.g., the publish workflow invokes `AssessmentService` directly).
- Tool wrappers can evolve (Mastra API changes) without touching logic.

### 6.2 Tool catalogue (8 atomic + 4 workflow)

| ID | File | Slash | Intent | Confidence | Tenant Lock? |
|---|---|---|---|---|---|
| `search-school-directory` | `core-tools.ts` | `/search` `/find` | read | 0.7 | optional |
| `system-status` | `core-tools.ts` | `/context` `/status` | read | 0.7 | no |
| `switch-academic-context` | `core-tools.ts` | `/switch` | mutation (cache) | 0.9 | no |
| `onboard-student` | `onboard-tools.ts` | `/enroll` `/admit` `/transfer` | mutation | 0.9 | yes (workspace lock) |
| `assign-entity` | `onboard-tools.ts` | `/transfer` | mutation | 0.9 | yes |
| `manage-results` | `grading-tools.ts` | `/grade` `/mark` `/attendance` | mutation | 0.9 | yes |
| `patch-entity` | `gov-tools.ts` | `/update` `/edit` `/rename` | mutation | 0.9 | role whitelist |
| `manage-access` | `gov-tools.ts` | `/suspend` `/ban` `/reset` | mutation | 0.9 | role whitelist |
| `extract` | `workflow-tools.ts` | `/extract` | read (long-running) | 0.7 | no |
| `generate` | `workflow-tools.ts` | `/generate` | read (long-running) | 0.7 | yes |
| `validate` | `workflow-tools.ts` | `/validate` | mutation (approval) | 0.9 | yes |
| `publish` | `workflow-tools.ts` | `/publish` | mutation | 0.9 | yes |
| `web-search` | `global-tools.ts` | (always-on) | read | n/a | n/a |
| `web-fetch` | `global-tools.ts` | (always-on) | read | n/a | n/a |
| `get-academic-context` | `context-tool.ts` | (supervisor-only) | read | n/a | tenant-scoped read |

The `web-search` and `web-fetch` tools are **reserved global** — they are always injected regardless of the active skill. `RESERVED_GLOBAL_TOOL_IDS` in `skill-schema.ts` prevents skills from declaring them.

### 6.3 Schema discipline

Every mutation tool applies `.omit()` to its input schema to prevent mass-assignment of protected fields (e.g., `schoolId`, `userId`, `id`). This is verified in the test suite.

### 6.4 Confidence gate

`gov-tools.ts:50` implements `const threshold = type === "mutation" ? 0.9 : 0.7;` — but the gate itself is enforced at the bridge layer. The supervisor instructs the model to self-report confidence; the `*Logic` functions read `context.audit?.modelId` for observability but trust the wrapper to gate execution.

---

## 7. The Workflow System

Long-running AI pipelines use Mastra's `createWorkflow` + `createStep` primitives. Each workflow supports **suspend/resume** so that human-in-the-loop steps can pause the run, present UI, and resume on user approval.

### 7.1 `extractionWorkflow`

`workflows/extraction.ts` — two modes:

- **Batch**: a pre-existing job ID resolves to a folder of OCR'd files (Mistral OCR service, async).
- **On-demand**: user uploads a Blob; the step calls `mistralOcrService.processDocument()` and the next step **suspends** to present the markdown for human review.

Steps: `process-document` → `open-artifact` (suspend) → `await-approval` (resume) → `commit-batch`.

### 7.2 `generateWorkflow`

`workflows/generate.ts` — for each `fileId` returned by `/extract`:

1. `download-markdown` — read the OCR'd text from object storage.
2. `structured-output` — call `mastra.getAgent('result-mapper').generate()` with the markdown + the target `ResultOutput` schema. The agent is bound to the read-only 70% confidence threshold.
3. Persist the resulting `ResultOutput` and emit a step event.

This workflow resolves the B12 missing-tool bug — the `result-mapper` agent was registered in Slice 12 specifically to unblock this step.

### 7.3 `validationWorkflow`

`workflows/validation.ts` — resolves the student set from the latest extraction, runs cross-checks (range, missing fields, duplicate marks), and **suspends** to present a diff to the user. On resume, the validated records are written.

### 7.4 `publishWorkflow`

`workflows/publish.ts` — per-tenant, per-exam: resolve targets, dispatch `email-job` worker threads for parent notifications, generate PDFs via the editor pipeline, and update result visibility flags.

### 7.5 `editorCommandWorkflow`

`workflows/editor-command.ts` — derives editor context (selection vs. no selection → `edit` vs. `generate`), builds the prompt, calls the appropriate agent (`editorEdit` or `editorGenerate`) with streaming, and pipes tokens back to the UI in real time.

### 7.6 Streaming + SSE

`workflow.watch()` (Mastra native) emits `WorkflowStreamEvent`s. The custom `sse-manager.ts` layer wraps the browser `ReadableStreamDefaultController` with a per-connection keepalive (30s) and a 200-char status cap on step events. `formatSSE(type, data)` produces standard `event: ...\ndata: ...\n\n` framing.

---

## 8. The Skill System

Skills are the primary mechanism for shaping the assistant's behaviour. A skill is a markdown file with YAML frontmatter:

```markdown
---
name: Grading
description: Assessment management, marks entry, attendance.
tools:
  - manage-results
  - get-academic-context
config:
  locked: false
---

# System Prompt Segment
You are the EdApex Grading Agent. Help staff enter and audit marks...
```

### 8.1 Lifecycle

1. `SkillRegistry.loadFromDirectory(dir, knownTools)` (`skill-registry.ts`) reads every `*.skill.md` in `src/lib/server/mastra/skills/`, parses frontmatter with `gray-matter`, validates with `SkillSchema` (Zod), and rejects any file that:
   - has missing `name` / `description` / `tools` fields
   - declares a reserved global tool ID (`web-search` / `web-fetch`)
   - references a tool name not in `knownTools`
2. `SkillWatcher` (`skill-watcher.ts`) uses `chokidar.watch` to monitor the directory in dev. Edits are debounced by 500 ms; the watcher auto-heals after 2 s if it dies. **Agent-Lock** pauses the watcher during a WriteTurn so agent-generated filesystem mutations don't trigger reload thrash.
3. In production, a build-time `generateSkillManifest(dir, knownTools)` produces a pre-validated `skills.json` (`version: 1`, `generatedAt` timestamp) — no file watcher needed.

### 8.2 Six shipped skills

| Skill | Default slash | Tools |
|---|---|---|
| `supervisor` | (initial) | `getContext` |
| `default` | `/search` `/switch` `/context` | `search-school-directory`, `get-academic-context`, `switch-academic-context` |
| `grading` | `/grade` `/mark` `/attendance` | `manage-results`, `get-academic-context` |
| `onboarding` | `/enroll` `/admit` `/transfer` | `onboard-student`, `assign-entity` |
| `gov` | `/update` `/suspend` `/password` | `patch-entity`, `manage-access` |
| `assistant` | `/extract` `/generate` `/validate` `/publish` | `extract`, `generate`, `validate`, `publish` |

### 8.3 Aliases and deprecations

`chat-helper.ts:211` — `deprecatedAliasMap` retains a one-minor-version window for legacy slash tokens (e.g., `/find` → `/search`, `/ban` → `/suspend`). The user sees a one-shot console warning per session.

### 8.4 Lock semantics

Some skills (e.g., the assessment-onboarding flow) may set `config.locked: true`. While a Lock turn is active, only the `LOCK_BYPASS_TOOLS` (`manage-access`, `system-status`) are executable. This prevents an agent from being hijacked mid-pipeline.

---

## 9. The Multi-Provider Gateway

### 9.1 `EdApexGateway`

`gateway.ts:45` — extends `MastraModelGateway` so it integrates with Mastra's native `mastra.addGateway(gateway, gateway.id)` API. It is constructed per-request with `(db, userId, encryptionKey?, envKeysOverride?)`.

### 9.2 Provider catalogue

Eight providers — six OpenAI-compatible (routed through `createOpenAICompatible` with a per-provider `BASE_URLS` entry) and two native (routed through Mastra's `resolveModelConfig`):

| Provider | API style | Notes |
|---|---|---|
| `opengateway` | OpenAI-compatible | keyless, always available, default for `DEFAULT_MODEL` |
| `groq` | OpenAI-compatible | default for `DEFAULT_TITLE_MODEL`, copilot, editor |
| `deepseek` | OpenAI-compatible | |
| `opencode` | OpenAI-compatible | `mimo` opencode provider rewrite → `openai` for routing |
| `mistral` | OpenAI-compatible | OCR service |
| `nvidia` | OpenAI-compatible | NIM catalog |
| `openai` | native | routed via Mastra's `resolveModelConfig` |
| `anthropic` | native | routed via Mastra's `resolveModelConfig` |

### 9.3 Failover

`gateway.withFailover(fn)` iterates the active providers in priority order, calling `fn(provider, apiKey, baseUrl)`. On `{ statusCode: 429, 503 }` or any thrown error, it advances to the next provider. Throws if all providers are exhausted.

### 9.4 Provider credential storage

Per-user API keys are stored in `provider_credentials` (libSQL) encrypted with **AES-256-CBC** (`provider-config.ts:7`). The key is derived from `env.TOKEN_ENCRYPTION_KEY` via SHA-256, so any input length works. The format is `iv:ciphertext` (both hex).

### 9.5 Env fallback

`getProviderCredentialWithFallback` checks the DB row first, then `env.<PROVIDER>_API_KEY`. Opengateway is always added as a keyless fallback.

---

## 10. Storage Architecture

### 10.1 Hybrid pattern

| Concern | Backend | Lifetime | Tenant isolation |
|---|---|---|---|
| School data (students, staff, results, classes, …) | MySQL via Drizzle | `mysql2.Pool` (singleton) | per-request `TenantContext` |
| Chat memory, thread metadata, messages | libSQL `Mastra Memory` | `LibSQLStore` (singleton) | per-thread / per-resource |
| Agent routing table | libSQL | `LibSQLStore` | per-user |
| Provider credentials | libSQL | `LibSQLStore` | per-user (encrypted) |
| Skill manifest cache | libSQL `mastra_metadata` | `LibSQLStore` | global |
| File storage (uploaded docs, generated PDFs) | Filesystem | `storage/` | per-school directory |
| Static assets | Filesystem | `static/` | n/a |

### 10.2 Why a libSQL singleton

`storage.ts` documents the rationale: SQLite (even in WAL mode) does not support multiple concurrent writer connections from the same process. A module-level `_sharedStorage` ensures all Mastra instances share one connection. Tenant isolation is enforced at the query level (`threadId`, `resourceId`), not the connection level. `createMastraStorage()` eagerly runs `_sharedStorage.init()` to avoid `no such table: mastra_threads` errors on the first read.

### 10.3 MySQL Drizzle

`db/index.ts` — `getDatabase()` returns a memoized `MySql2Database<typeof schema & typeof relations>`. The `mysql2.Pool` is connection-limited (`connectionLimit: 10`, `queueLimit: 0`). HMR disposal closes the pool.

### 10.4 Data model

174 `sm_*` tables in `db/sms-schema.ts` model the school domain: `smStudents`, `smStaffs`, `smClasses`, `smClassSections`, `smAssignClassTeachers`, `smExamTypes`, `smAcademicYears`, `smGeneralSettings`, `smResult*`, `smAttendance*`, `smFee*`, `smLibrary*`, `smTransport*`, `smHostel*`, etc. The full list is in the schema file.

---

## 11. Request Lifecycle (End-to-End)

A chat message is the most complex path. Here is what happens from keypress to displayed token.

```
1. Browser (chat view)
   └─ user types "/grade Class 5A"
   └─ SharedChatView.svelte posts to /api/chat or invokes chat.remote
2. SvelteKit `+page.server.ts` / `chat.remote.ts`
   └─ auth.getSession() (session is hydrated in hooks.server.ts)
   └─ build TenantContext from session + workspace manifest
   └─ ModelRouter selects modelId from user/agent_routing
3. Per-request context composition (chat-helper.ts:buildRequestContext)
   └─ RequestContext with { tenantContext, modelId, isSlashCommand: true, lastMessage }
   └─ mastraDb (libSQL) for memory reads
4. Mastra route handler
   └─ mastra.getAgent('supervisor').stream({ messages, requestContext })
5. Supervisor
   └─ resolves instructions from requestContext.tenantContext
   └─ may call getContext (read-only, no tenant lock)
   └─ delegates to assistant with the full prompt
6. Assistant
   └─ resolveToolsForMessage(message, isSlashCommand=true) → skill-resolved tool set
   └─ tool call: gradingTool / payload matches gradingSchema (Zod)
7. Tool bridge
   └─ createTool wrapper awaits buildMastraToolContext(context.requestContext)
   └─ calls gradingLogic(context, payload)
8. gradingLogic
   └─ validateWorkspaceLock(context, payload.classId, payload.sectionId)
   └─ validateRoleWhitelist(context, [class-teacher, coordinator, principal])
   └─ context.getService(AssessmentService)
   └─ service.recordMarks(...)
   └─ returns { status: 'success', affected: N }
9. Assistant composes a natural-language summary
10. Supervisor returns the summary verbatim
11. Mastra streamVNext writes tokens to the UI
12. Browser SharedChatView appends the assistant message
```

SSE keepalive is emitted every 30 s during the stream. On close, the per-request `ScopedRepositoryProvider` and its cache are GC'd.

---

## 12. Auth, RBAC, and Workspace Enforcement

### 12.1 Session

`hooks.server.ts` calls `auth.getSession()` and populates `event.locals.user` / `event.locals.session`. Sessions are server-side (Drizzle `sessions` table) with JWT-signed refresh tokens (`jose` for both signing and JWE encryption).

### 12.2 `authRepo` — the one legitimate singleton

Documented in `src/lib/server/service/auth.service.ts` and `src/lib/api/auth.remote.ts`. Auth operates on global session data, not tenant data — the user is logging IN here, before any `TenantContext` is established. The singleton survives the global-singleton ban because there is no isolation benefit to making it per-request.

### 12.3 Route guard

`mastra/route-guard.ts:33` — `evaluateRouteGuard(tenant, workspace, pathname)`:

- Public paths (`/login`, `/pending-assignment`, `/api/auth`, `/health`) bypass the guard.
- No tenant → redirect `/login`.
- Tenant but no workspace → redirect `/pending-assignment`.
- Otherwise proceed.

### 12.4 Designation IDs

The `TenantContext.designationId` encodes the staff role (1 = super-admin, 5 = coordinator, 8 = class teacher, etc.). Tools call `validateRoleWhitelist(context, [...])` to gate.

---

## 13. UI Component Architecture

### 13.1 Stack

- **shadcn-svelte** primitives under `src/lib/components/ui/*` (`bits-ui` + `tailwind-variants`).
- **`ai-elements`** for chat surfaces under `src/lib/components/ai-elements/*` — `conversation`, `message`, `response`, `tool`, `code`, `copy-button`, `shimmer`, `action`.
- **`prompt-kit`** for prompt input, model picker, attachments, suggestion chips.
- **Bespoke "Gold on Slate" `oklch` tokens** in `src/routes/layout.css` — never edit this file; all UI styling must derive from its tokens.

### 13.2 State

`src/lib/context/*` exports Svelte 5 `$state` runes: `ChatHistory`, `SelectedModel`, `SelectedClass`, `SelectedCategory`, `PWAContext`. The `hooks.ts` `Transport` configures SvelteKit to encode/decode these between server and client.

### 13.3 Editor

`src/lib/components/editor/*` — Tiptap 3 with a custom markdown extension (`tiptap-markdown`), a bubble menu, slash menu, and an inline AI copilot widget that calls `editorCopilotAgent` for ghost text. `EditorModeToggle` swaps between WYSIWYG and markdown preview.

### 13.4 PDF

`@embedpdf/*` 2.14 provides a plugin-based PDF viewer (`plugin-document-manager`, `plugin-render`, `plugin-scroll`, `plugin-viewport`). The viewer is mounted in `pdf-preview.svelte` for result cards and uploaded transcripts.

### 13.5 PWA

`src/service-worker.ts` is a SvelteKit service worker that pre-caches the build manifest, version-stamps the cache, and serves GET requests cache-first. `PWAContext` + `PWAInstallPrompt.svelte` show the install prompt when the browser fires `beforeinstallprompt`.

---

## 14. Background Jobs

`src/lib/server/worker/index.ts` exposes `JobWorker.runTask(payload, callback?)`. The current registry:

| Job type | Worker | Use |
|---|---|---|
| `send-email` | `jobs/email-job.ts` | Result notifications to parents/guardians |

`email-job.ts` runs in a Node `worker_thread`, loads `.env` independently (`dotenv.config`), and uses `nodemailer` with the per-request SMTP config. The parent awaits a `JobResult` `{ jobId, status, result | error }`.

The dev-mode worker path uses `--experimental-transform-types` to run `.ts` directly; the production path uses the Bun-compiled `.js` in `build/lib/server/worker/jobs/`.

---

## 15. Observability

- **Structured logging** — every Mastra tool entry/exit is logged via `console.log("[EdApexGateway] getApiKey", modelId)` style. The `audit` field on `MastraToolContext` carries `{ threadId, modelId }` for cross-referencing.
- **SSE** — workflow events stream to the browser with step status, duration, and a 200-char truncated status string.
- **Confidence self-report** — supervisor and assistant instructions include the threshold so the model emits a `confidence` field; below-threshold intents are dropped.
- **Tests as contracts** — the test suite (`__tests__/`) includes property tests via `fast-check` that assert invariants like "tool wrappers never call DB directly" and "system status never includes `health: 'operational'`".

---

## 16. Testing Strategy

606 passing tests across 35 suites. Layout:

- `src/lib/server/mastra/__tests__/` — bridge, gateway, workflows, tools, agents (majority)
- `src/lib/server/__tests__/` — singleton / migration regressions
- `src/lib/server/service/__tests__/` — service contracts
- `src/lib/server/repository/__tests__/` — repository contracts
- `tests/` — cross-cutting integration and module-shape tests

Auto-generated test artifacts land in `tests/.tmp/` (gitignored). `*.db`, `*.db-shm`, `*.db-wal` files produced by libSQL-backed suites are not committed.

Key property tests:

- **B-series regressions** (Slices 0–13) — static regex audits that ensure no tool imports `drizzle-orm` directly, no `getDatabase()` call in read-only tools, no `health: 'operational'` literal, etc.
- **Tenant isolation** — the bridge produces a `ScopedRepositoryProvider` that binds repos to the active tenant; tests inject a mock `requestContext` and verify the binding.
- **Skill rejection** — `validateSkillDirectory` rejects files with reserved tool IDs, missing frontmatter, or unknown tool names.

---

## 17. Configuration Surface

### 17.1 Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string (Drizzle) |
| `JWT_SIGN_SECRET` | Refresh-token signing |
| `JWE_ENC_SECRET` | Refresh-token encryption |
| `FILE_SHARE_SECRET` | Signed share-link tokens |
| `TOKEN_ENCRYPTION_KEY` | AES-256 key for provider credentials (any length, SHA-256 derived) |
| `SMTP_*` | Outbound mail (`HOST`, `PORT`, `USER`, `PASS`, `FROM`, `FROM_NAME`) |
| `STORAGE_DIR` | Host-mounted path for `storage/` and `static/` |
| `PUBLIC_ALLOW_ANONYMOUS_CHATS` | Default `false`; controls whether unauthenticated users can chat |
| `GROQ_API_KEY` / `GROQ_BASE_URL` / `GROQ_MODEL` | Groq provider config |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek config |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | Mistral config (used for OCR) |
| `NVIDIA_NIM_API_KEY` / `NVIDIA_NIM_BASE_URL` / `NVIDIA_NIM_MODEL` | NVIDIA NIM config |
| `OPENCODE_API_KEY` / `OPENCODE_BASE_URL` / `OPENCODE_MODEL` | OpenCode Zen config |
| `OPENGATEWAY_BASE_URL` | OpenGateway endpoint |

### 17.2 Drizzle

`drizzle.config.ts` targets MySQL, reads `DATABASE_URL`, writes migrations to `./drizzle`. Scripts:

- `pnpm db:generate` — diff schema → migration file
- `pnpm db:migrate` — apply migrations
- `pnpm db:push` — push schema directly (dev only)
- `pnpm db:studio` — open Drizzle Studio

---

## 18. Build, Run, Deploy

### 18.1 Build

`pnpm build` runs Vite's SvelteKit build, then `pnpm build:worker` compiles the worker-thread scripts to `build/lib/server/worker/jobs/*.js`. The SvelteKit `adapter-node` emits a standalone Node server in `build/`.

### 18.2 Run

`pnpm start` runs `bun build/index.js`. Bun is the preferred runtime for development, but the output also runs on Node ≥ 22.

### 18.3 Container

`Dockerfile` builds the production image; `compose.yml` runs it with `STORAGE_DIR` mounted as a volume. The image is published to `ghcr.io/beznet22/edapex:latest`. Required env: `DATABASE_URL`, `JWT_SIGN_SECRET`, `JWE_ENC_SECRET`, `SMTP_*`. Optional env: provider keys (at least one LLM key is recommended for non-keyless providers).

---

## 19. Where to Read Next

- **AGENTS.md** — contributor contract (package manager, commands, conventions).
- **docs/slash_command_tool_hardening_plan.md** — the 14-slice audit that produced the per-request provider pattern. Authoritative rationale for §4 of this document.
- **docs/responsive_design.md** — UI rules (must be followed; design tokens live in `src/routes/layout.css`).
- **`src/lib/server/mastra/tenant-context.ts`** — the most important file in the codebase. Read it first.
- **`src/lib/server/mastra/index.ts`** — the Mastra singleton and the agent registry.
- **`src/lib/server/repository/base.repo.ts`** — the repository contract.
- **`src/lib/server/service/assessment.service.ts`** — the largest service module; shows the per-request pattern in full.
