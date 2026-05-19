# Finalizing Mastra AI Orchestration & Hermes UI Migration

This plan outlines the final steps to migrate the EdApex orchestration layer to the Mastra framework, ensuring compliance with `Gitlawb Opengateway` and `Slash Command` specifications. We will transition from legacy AI services to the `EdApexGateway`, harden transport layers, and modernize the UI.

## Key Architectural Invariants

> [!NOTE]
> **Transport Hardening**: All Opengateway traffic will now have provider-specific headers (`x-provider-*`) stripped in the gateway to ensure security and normalization.
> **Confidence Gates**: Mutation-based intents will require a 90% confidence threshold. If below this, the agent will request explicit confirmation.
> **Workspace Architecture**: The 4-panel Hermes layout is already implemented. Live extraction tracking will be bound directly to `WorkspacePane.svelte`'s existing state mechanisms.

## Slash Command Audit

| Command Group | Command | Tool/Workflow ID | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Core** | `/search`, `/find` | `search-entity` | ✅ Implemented | Logic in `core-tools.ts` |
| **Core** | `/status` | `system-status` | ✅ Implemented | Logic in `core-tools.ts` |
| **Grading** | `/grade`, `/mark`, `/attendance` | `manage-results` | ✅ Implemented | Logic in `grading-tools.ts` |
| **Onboard** | `/register`, `/enroll`, `/assign` | `onboard-entity` | ✅ Implemented | Logic in `onboard-tools.ts` |
| **Gov** | `/update`, `/edit`, `/rename` | `patch-entity` | ✅ Implemented | Logic in `onboard-tools.ts` |
| **Gov** | `/ban`, `/suspend`, `/reset` | `manage-access` | ✅ Implemented | Logic in `gov-tools.ts` |
| **Context** | `/switch` | `switch-workspace` | ✅ Implemented | Logic in `gov-tools.ts` |
| **Workflows** | `/extract`, `/generate` | `document-extraction` | 🚧 Planned | Implement tool wrapper for workflow |
| **Workflows** | `/validate` | `document-validation` | 🚧 Planned | Implement tool wrapper for workflow |
| **Workflows** | `/publish` | `publish-results` | 🚧 Planned | Implement tool wrapper for workflow |

## Support Model Registry Matrix

### 1. Opengateway (mimo / google / zai)
| ID | Vision | Reasoning | Context | Max Out | Provider |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mimo-v2.5-pro` | ✗ | ✓ | 1,000K | 128K | Xiaomi |
| `mimo-v2-pro` | ✗ | ✓ | 1,000K | 128K | Xiaomi |
| `mimo-v2.5` | ✓ | ✓ | 1,000K | 128K | Xiaomi |
| `mimo-v2-omni` | ✓ | ✓ | 256K | 128K | Xiaomi |
| `mimo-v2-flash` | ✗ | ✓ | 256K | 64K | Xiaomi |
| `google/gemini-3.1-flash-lite-preview` | ✓ | ✓ | 1,048K | 65K | Google |
| `zai-org/GLM-5.1-FP8` | ✗ | ✓ | 202K | 131K | Zhipu |

### 2. NVIDIA NIM (Standardized OpenAI Path)
| ID | Vision | Reasoning | Context | Provider |
| :--- | :--- | :--- | :--- | :--- |
| `minimaxai/minimax-m2.7` | ✗ | ✓ | 128K | MiniMax |
| `stepfun-ai/step-3.5-flash` | ✗ | ✓ | 128K | StepFun |
| `mistralai/mistral-large-3-675b-instruct-2512` | ✗ | ✓ | 128K | Mistral |
| `qwen/qwen3-coder-480b-a35b-instruct` | ✗ | ✓ | 128K | Qwen |

### 3. Native Providers (Fallback)
| ID | Provider | Status |
| :--- | :--- | :--- |
| `llama-3.3-70b-versatile` | Groq | Verified |
| `openai/gpt-oss-120b` | Groq | Verified |
| `qwen/qwen3-32b` | Groq | Verified |
| `deepseek-v4-flash` | DeepSeek | Verified |
| `deepseek-v4-pro` | DeepSeek | Verified |
| `mistral-ocr-latest` | Mistral | Extraction Only (Not for Chat/Router) |

## Proposed Changes

### 1. Orchestration Backend (Mastra) [IN PROGRESS]

#### [MODIFY] [provider-config.ts](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/provider-config.ts)
- [ ] Implement `normalizeGatewayRequest`:
    - [x] Strip `x-provider-*` headers.
    - [x] Ensure `/v1` suffix for Opengateway URLs.
    - [ ] Map `max_tokens` to `max_completion_tokens` as per Opengateway spec.
- [ ] Audit `normalizeGatewayRequest` for edge cases (e.g. missing headers).
- [ ] Update `getAllActiveProviders` to correctly handle Opengateway as a "keyless" provider in the UI.

#### [MODIFY] [registry.ts](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/registry.ts)
- [ ] Add the full Opengateway model set (mimo-v2.5, Gemini 3.1, GLM-5.1 FP8, etc.).
- [ ] Add NVIDIA NIM and OpenCode models from `.env`.
- [ ] Align `MODEL_REGISTRY` with the exact specs from `docs/gitlawb-opengateway.md` (1M context windows, etc.).

#### [NEW] Skills & Instructions
- [ ] **[supervisor.skill.md](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/skills/supervisor.skill.md)**: Logic for intent classification and context discovery.
- [ ] **[assistant.skill.md](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/skills/assistant.skill.md)**: General purpose teaching and admin assistance.
- [ ] **[default.skill.md](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/skills/default.skill.md)**: Fallback role instructions.

#### [MODIFY] [workflow-tools.ts](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/tools/workflow-tools.ts) [NEW]
- [ ] Create `extractTool`: Wrapper that triggers `extractionWorkflow` with file blobs.
- [ ] Create `validateTool`: Wrapper that resumes `validationWorkflow` and returns verification results.
- [ ] Create `publishTool`: Wrapper that triggers `publishWorkflow` and handles SSE progress events.

#### [MODIFY] [gateway.ts](file:///home/beznet/Workspace/edapex/src/lib/server/mastra/gateway.ts)
- [ ] Finalize `stream` and `generate` methods:
    - [ ] **Skill Loading**: 
        - [ ] Load role-specific instructions from `SkillRegistry`.
        - [ ] Dynamically inject toolsets based on Skill `tools` array.
    - [ ] Literal Slash Command Detection (Complete, but needs verification against all commands).
    - [ ] Supervisor Intent Classification (Refine schema to include `toolSelection` hint).
    - [ ] Confidence Gate logic:
        - [ ] Enforce 90% mutation threshold.
        - [ ] Implement 70% read/navigation threshold (currently empty).
    - [ ] **Tool Injection**:
        - [ ] Inject `coreTools` (search, patch, etc.) into the `Assistant` agent.
        - [ ] Inject `workflowTools` (extract, validate, publish) into the `Assistant` agent.
    - [ ] **Workflow Support**: 
        - [ ] Ensure `stream` handles tool call responses from workflows (SSE integration).
        - [ ] Implement `Assistant` instructions to favor workflow tools for `/extract` or `/publish` intents.
- [ ] **[NEW]** Implement `generate()` method:
    - [ ] Non-streaming version of the orchestration flow for background tasks or simple API calls.
    - [ ] Share logic with `stream()` via internal `executeOrchestration` helper.

---

### 2. API & Integration Layer

#### [MODIFY] [+server.ts](file:///home/beznet/Workspace/edapex/src/routes/api/chat/+server.ts)
- Replace legacy `AgentService` logic with `EdApexGateway.stream()`.
- Inject `TenantContext` (classId, schoolId, userId, designationId) into the gateway call.
- Handle `textStream` from gateway and pipe to `createUIMessageStreamResponse`.
- **Logic**: If the gateway returns a confirmation request, emit a special `data-confirmation` chunk.

#### [MODIFY] [+layout.server.ts](file:///home/beznet/Workspace/edapex/src/routes/(chat)/+layout.server.ts)
- Replace legacy `getAvailableModels` and `getUserProviderKeys` with Mastra-native registry calls.
- Initialize `EdApexGateway` and cache it in `locals` for the duration of the request.

---

### 3. UI Layer (Hermes)

#### [MODIFY] [chat-context.svelte.ts](file:///home/beznet/Workspace/edapex/src/lib/context/chat-context.svelte.ts)
- Update to support the new Mastra streaming response structure.
- Add state for `pendingConfirmation` to track when the LLM is waiting for user approval.

#### [MODIFY] [chat.svelte](file:///home/beznet/Workspace/edapex/src/lib/components/chat.svelte)
- Implement **Validation Cards** for intents that fall below the confidence threshold.
- Use `oklch` tokens for premium "Gold on Slate" styling.

#### [MODIFY] [ChatComposer.svelte](file:///home/beznet/Workspace/edapex/src/lib/components/ChatComposer.svelte)
- Refactor to use the updated `chat-context`.
- Implement a **Confirmation Overlay**: When `pendingConfirmation` is true, disable the input and show a high-confidence "Confirm" / "Cancel" action bar.
- Improve slash command autocomplete to pull from `MastraTool` registry.

#### [MODIFY] [WorkspacePane.svelte](file:///home/beznet/Workspace/edapex/src/lib/components/workspace/WorkspacePane.svelte)
- Implement **Live Progress Tracking**: Bind to the Mastra Workflow State for `/extract` jobs.
- Show real-time extraction stats (e.g., "Extracting Student A (1/10)...") using the `worker_thread` events relayed via SSE.

---

### 4. Decommissioning Legacy Code

#### [DELETE] [agent.service.ts](file:///home/beznet/Workspace/edapex/src/lib/server/service/agent.service.ts)
#### [DELETE] [router.ts](file:///home/beznet/Workspace/edapex/src/lib/server/provider/router.ts)
- Remove legacy files once migration is verified.

## Verification Plan

### Automated Tests
- `pnpm test src/lib/server/mastra/gateway.test.ts`
- Verify transport normalization via proxy logs.

### Manual Verification
1. **Chat Flow**: Test standard chat with `mimo-v2.5-pro` via Opengateway.
2. **Slash Commands**: Run `/search John` and verify it uses `TenantContext`.
3. **Security**: Attempt to access a student outside the `workspaceLock`.
4. **Confidence Gate**: Trigger a mutation-like prompt without a slash and verify it asks for confirmation.

<!-- Role: You are an Expert Full-Stack Developer and AI Orchestration Architect specializing in Svelte 5, Drizzle ORM, and the Mastra AI framework.

Instructions: Your objective is to finalize the migration of the EdApex application to the Mastra AI orchestration framework, ensuring seamless integration between the backend architecture and the modernized Hermes UI.

Steps to Execute:

Backend Orchestration (Mastra): Finalize the EdApexGateway by wiring skill-based instructions, injecting dynamic tools (core and workflow), and updating the model registry (registry.ts) to strictly match the Opengateway spec.
Intent & Safety Hardening: Implement the 90% confidence gate for mutation intents. Enforce strict TenantContext isolation (classId, schoolId) on all queries and strip all protected fields via Zod .omit().
UI/UX Modernization (Hermes): Update the chat interface to support Mastra-native streaming. Implement the pendingConfirmation overlay in ChatComposer.svelte for low-confidence intents, and wire live workflow extraction tracking into WorkspacePane.svelte.
Storage Migration: Ensure all Mastra memory, configurations, and state run natively on sovereign libSQL storage (mastra.db), actively avoiding legacy MySQL ai_ tables.
End Goal: A fully functional, production-ready EdApex app featuring a robust, secure Mastra orchestration backend that perfectly synchronizes with a premium, responsive "Gold on Slate" frontend UI.

Narrowing Constraints:

Adhere strictly to the Svelte 5 rune-based state management patterns.
Do not use placeholders (e.g., // TODO: implement). Write complete, end-to-end production code.
Verify that all AI commits include the required Co-Authored-By attribution. -->


School management schema (SMS) and Mastra agent orchestration are fully decoupled and isolated from each other, they are linked via context injection.



selectedClass and activegent is legacy since the Mastra Supervisor handles all routing now.



More context of current implemention (needs to implement GLOBAL TOOLS):  ```text                [ USER INPUT ]                      │                      ▼        ┌────────────────────────────┐        │   SUPERVISOR (Gateway)     │        │  (Intent & Confidence)     │        └─────────────┬──────────────┘                      │           [ CONTEXT INJECTION (TenantContext) ]  <─── (School, Class, Section, exam, subject, academic year, Workspace/workflow context and other Dynamic Context)                      │            ┌─────────┴─────────┐            ▼                   ▼     [ MUTATION? ]       [ CONVERSATION? ]            │                   │      ┌─────┴─────┐       ┌─────┴─────┐      ▼           ▼       ▼           ▼  [ < 90% ]   [ > 90% ] [ SKILL? ] [ GENERIC? ]      │           │       │           │      ▼           ▼       ▼           ▼ [ APPROVAL ] [ WORKFLOW ] [ ASSISTANT ] [ DEFAULT ] [  CARD    ] [ RUNNER   ] [ (SKILLS)  ] [ (PURE)  ]      │           │       └─────┬───────┘     │      │           │             │             │      │           │             ▼             │      │           │      [ GLOBAL TOOLS ] (confirm if this already exist or needs to be refactored or re-implemented from scratch)     │      │           │     (Search / Fetch)      │      │           │             │             │      ▼           ▼             ▼             ▼    [ UI ] <── [ MEMORY ] <── [ RESPONSE ] <──┘ ```  



Web Search and Fetch WebSearch works  using TinyFish(https://www.tinyfish.ai/blog/search-and-fetch-are-now-free-for-every-agent-everywhere) fallback to DuckDuckGo. This gives all the OpenAI-compatible providers a free web search path out of the box.  



Note: DuckDuckGo works by scraping search results and may be rate-limited, blocked, or subject to DuckDuckGo's Terms of Service. We should add a html to clean minimize token efficient markdown middleware optimized for for very low token usage .



WebFetch should use TinyFish (https://www.tinyfish.ai/blog/search-and-fetch-are-now-free-for-every-agent-everywhere), but fallback to basic HTTP plus HTML-to-markdown. 



Note that HTTP path can still fail on JavaScript-rendered sites or sites that block plain HTTP requests (How do we mitigate and prevent this issue).



 See the docs/openclaw_search_fetch.md for inspiration and how we can adapt a minimal feature set that conform to our own architecture without drifting or bloating our system (we need to strategise for  lightweight, performanc and  simplicity not verbose and complex flow)

 The test suite has 8 failures across 3 test files, but none are related to the model ID migration work (tasks 1.1 and 1.2). These are pre-existing issues:

foundation.test.ts (5 failures) — The test constructs an invalid libSQL URL (temp_dir/file:./temp_dir/...). It should use file:./temp_dir/... format instead.

settings-persistence.test.ts (3 failures) — getAllActiveProviders() always appends an opengateway entry (the "always ensure opengateway appears" logic), so tests expecting 1 result get 2.

gateway.test.ts (0 tests, suite error) — Imports a module that depends on $env/dynamic/private which isn't available in the vitest environment.

The 92 passing tests (including slash-commands and skill-discovery) all pass fine. The migration-related code (registry.ts, router.ts) doesn't have dedicated tests yet (those are optional tasks 1.3 and 1.4).



- Add the TinyFish intergration requirment from https://www.tinyfish.ai/blog/search-and-fetch-are-now-free-for-every-agent-everywhere

-  File-as-Context Reference in ChatComposer: WHEN a user hovers over a file or directory item in the Workspace_Panel file tree, THE Workspace_Panel SHALL display an "Add as Context" icon button (<MessageSquarePlus />) on that item


- For each requirement we must analyze and investigate existing implementation on the codebase to confirm if a featue already exist or needs to be refactored/reused or re-implemented from scratch


The spec prevents duplicate slash commands when a workflow of the same type is running, but should it allow users to queue up the same workflow type to run after the current one completes?