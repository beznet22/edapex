# Marksheet Pipeline Analysis — Console Log Deep-Dive

**Date:** 2026-07-14
**Trigger:** User reported three failure modes after `/marksheet process the attached screenshot`:
1. "Skills are not loaded" — pipeline halted after a single `streamDocument` call.
2. "Tool call redundancy" — nine tool calls in one turn where the expected maximum is three.
3. "Workspace not opening on first artifact chunk" — workspace panel never auto-rendered.

**Verdict (TL;DR):** Three failure modes, two real blockers. The system prompt is **healthy** (skill + tenant + roster + file manifest all injected correctly). The runtime agent toolset is **broken** — the marksheet skill tools are merged into the workflow envelope but never reach the model. The document agent that powers `streamDocument` is **misconfigured** (`groq.chatModel('deepseek-v4-flash')` — Groq does not host that model; `catalog.ts` only lists it on `deepseek`/`opencode`/`kimchi` providers), and the resulting provider error is **silently swallowed** by `streamWithAutoRetry` + `StreamErrorRetryProcessor`, so the tool returns `output-available` with zero content instead of `output-error`. The workspace panel is mounted (`SharedChatView.svelte:182` always mounts `WorkspacePaneGroup` for chat routes; the eye FAB on `ArtifactCard` works) — but auto-open never fires because no `data-streamDocument` chunks are emitted. ABSOLUTE RULE 3 in the skill is too narrow to stop `mastra_workspace_*` tool spam.

---

## 1. Executive Summary

The investigation traced the message sequence through the chat route, workflow, agent, and skill system. The four evidence pillars — the user's console log, a synchronous diagnostic dump of the system prompt (`/home/beznet/Workspace/edapex/instructions.md`), a server-side stream-chunk counter (`/home/beznet/Workspace/edapex/stream-document-diag.log`), and the upstream provider error from the document agent — converge on a clear picture:

- **Prompt side is correct.** `buildAssistantInstructions` injects the Reporting skill, tenant context, the 24-student CLASS ROSTER, and the FILE MANIFEST for `adakole.jpg.jpeg`. The model has the information it needs to call `validate-marksheet` correctly.
- **Document agent is misconfigured.** `documentAgent.model = DEFAULT_MODEL` (`agents/document.ts:74`) and `DEFAULT_MODEL = groqProvider1.chatModel('deepseek-v4-flash')` (`agents/shared.ts:77`). Groq does not host `deepseek-v4-flash` — `src/lib/provider/catalog.ts` only lists `deepseek/deepseek-v4-flash` (provider: deepseek), `opencode/deepseek-v4-flash-free`, and `kimchi/deepseek-v4-flash`. Every call to the document agent fails with `the provider for model deepseek-v4-flash has exhausted its credits and cannot process requests`.
- **The provider error is silently swallowed.** `streamWithAutoRetry` + the agent's `StreamErrorRetryProcessor` retry, exhaust credits on every retry, and the for-await loop in `stream-document.ts` completes with zero iterations. The tool returns `output-available` (success) with full metadata but an empty markdown buffer. Two diagnostic runs show `chunkCount: 0, markdownLength: 0`.
- **Workspace auto-open never fires.** Because no `data-streamDocument` chunks are emitted, the client-side handler in `chat-context.svelte.ts:243-259` never runs. The eye FAB on `ArtifactCard` does work — `SharedChatView.svelte:182` mounts `WorkspacePaneGroup` for chat routes, and the click triggers `inspector.openChatArtifact` via the window event. But the auto-open path is dead.
- **Runtime toolset is also broken.** Independently of the document agent failure, the marksheet skill tools (`validate-marksheet`, `commit-marksheet`, etc.) are merged into the workflow envelope but never reach the model — the model only sees `web-search`, `web-fetch`, `getContext`, `readWorkspaceFile`, `streamDocument`, and the leaky `mastra_workspace_*` family.

**Seven root causes** are identified across three failure modes. RC6 (model misconfiguration) and RC7 (error swallowed) are the largest blockers — together they explain why no marksheet ever reaches the workspace panel. RC2 (tool injection dropped) is the next blocker — even after RC6+RC7 are fixed, `validate-marksheet` and friends will still be invisible to the model.

The legacy `workflows/chat.ts` has been deleted as part of this investigation. The remaining six root causes (RC2, RC4, RC5, RC6, RC7) are listed with proposed fixes for follow-up plans.

---

## 2. Evidence Base

### Pillar 1 — User's Console Log

The user's `/marksheet process the attached screenshot` request produced a single assistant turn with **nine tool calls** and one final tool failure:

| # | Tool | Input | Output | Verdict |
|---|------|-------|--------|---------|
| 1 | `streamDocument` | `{contentHash, fileName: "adakole.jpg.jpeg"}` | `artifactId, initialMarkdownPath, title, documentId, examTypeId, academicId, studentId:null, ...` | ✅ Correct call, all metadata returned |
| 2 | `readWorkspaceFile` | `marksheets/adakole_jpg-0adbef75.md` | `{path, content: ""}` | ⚠️ Empty — file mid-write |
| 3 | `readWorkspaceFile` | `marksheets/adakole_jpg-0adbef75.md` | `{path, content: ""}` | ❌ Redundant retry |
| 4 | `readWorkspaceFile` | `marksheets/adakole_jpg-0adbef75.md` | `{path, content: ""}` | ❌ Redundant retry |
| 5 | `mastra_workspace_grep` | `pattern: "RYAN\|Adakole\|Ryan", path: "marksheets"` | `0 matches across 0 files` | ❌ Off-pipeline |
| 6 | `mastra_workspace_search` | `query: "adakole marksheet", mode: "bm25"` | `0 results (bm25 search)` | ❌ Off-pipeline |
| 7 | `mastra_workspace_grep` | `pattern: "adakole", path: "marksheets"` | `0 matches across 0 files` | ❌ Off-pipeline |
| 8 | `validate-marksheet` | `{currentMarkdownPath, student:{id:844,...}, reason, title}` | `Tool "validate-marksheet" not found. Available tools: web-search, web-fetch, getContext, readWorkspaceFile, streamDocument, mastra_workspace_read_file, mastra_workspace_write_file, ...` | ❌ **CRITICAL FAILURE** |
| 9 | — | — | Final text: list of "✅/⏸️ Next steps" explaining missing tools | ❌ Pipeline abandoned |

The available-tools list in the failure message is the smoking gun: the agent's runtime toolset contains **only** `BASE_AGENT_TOOLS` plus the workspace-injected family. None of the skill-declared tools (`validate-marksheet`, `auto-fix-marksheet`, `commit-marksheet`, `generate-result-pdf`, `publish-result-pdf`, `request-selection`, `choose-document`, `get-active-marksheet`) are visible.

### Pillar 2 — Diagnostic Prompt Dump (`/home/beznet/Workspace/edapex/instructions.md`)

`buildAssistantInstructions` writes the assembled system prompt to disk at the end of every turn (see `src/lib/server/mastra/agents/skill-instructions.ts:271`). Reading that file for the most recent `/marksheet` request confirms:

```
TENANT CONTEXT (user-facing):
- School: Lighthouse Leading Academy
- Class: CRECHE - A
- Academic Year: 2025/2026
- Exam Type: SECOND TERM EXAMINATION - MCH/2026
- Designation: it
- Focus Student: None

CLASS ROSTER:
- ARIELLA LIANSHATER TERNGU (Adm#915) [studentId=838]
- ...
- RYAN ADAKOLE EMMANUEL (Adm#921) [studentId=844]
- ...

TOOL CALLING CONTEXT (for tool arguments only, never show user):
- schoolId: 1
- userId: 1
- staffId: 1
- designationId: 1
- roleId: 1
- classId: 12
- sectionId: 5
- academicId: 4
- examTypeId: 6

FILE MANIFEST:
- adakole.jpg.jpeg (contentHash: 0adbef757d8c14d65e873f54d0fbd049)

### SKILL INSTRUCTIONS — Reporting ###
[full reporting.skill.md body injected]
```

Every prompt-side input the agent needs to drive `validate-marksheet` is present and correctly populated. The break is **not** in prompt construction.

### Pillar 3 — Server-Side Stream Counter (`/home/beznet/Workspace/edapex/stream-document-diag.log`)

A diagnostic counter was added inside `stream-document.ts`'s for-await loop and after it, emitting both a `console.log('[streamDocument-DIAG]', ...)` line and a JSON line appended to `stream-document-diag.log`. Two consecutive runs of the marksheet pipeline against the same `adakole.jpg.jpeg` content hash produced:

```
{"at":"2026-07-14T22:21:05.517Z","side":"emit","documentId":"marksheet-0adbef757d8c14d65e873f54d0fbd049","chunkCount":0,"markdownLength":0}
{"at":"2026-07-14T22:31:32.568Z","side":"emit","documentId":"marksheet-0adbef757d8c14d65e873f54d0fbd049","chunkCount":0,"markdownLength":0}
```

`chunkCount` is the number of `writer.custom({ type: 'data-streamDocument', data: { phase: 'delta', delta } })` calls attempted by the tool. `markdownLength` is the total characters of accumulated formatted markdown. **Both are zero across two independent runs.** The for-await loop in `stream-document.ts` never executes, so no `data-streamDocument` parts are emitted. The orphan draft at `initialMarkdownPath` is written with empty content (`fs.writeFile(initialMarkdownPath, markdown, ...)` with `markdown=''`).

### Pillar 4 — Upstream Provider Error (user-pasted server stderr)

The user pasted the following from the server's stderr after the diagnostic runs surfaced the empty stream:

```
Error in agent stream {
  error: [Error: the provider for model deepseek-v4-flash has exhausted its credits and cannot process requests],
  runId: '95a9fb44-57e0-4d11-ab85-569e57021055',
  provider: 'groq.chat',
  modelId: 'deepseek-v4-flash'
}
```

`provider: 'groq.chat'` + `modelId: 'deepseek-v4-flash'` is the smoking gun: Groq is being asked for `deepseek-v4-flash`, a model Groq does not host. `src/lib/provider/catalog.ts` confirms: `deepseek-v4-flash` only exists under the `deepseek/` (line 166), `opencode/` (line 224), and `kimchi/` (line 317) provider prefixes. The `groq` provider has no entry for `deepseek-v4-flash`.

Critically, **this error was never propagated back to the tool's `output` as a tool-level failure**. The tool returned `state: 'output-available'` with full metadata — `artifactId`, `initialMarkdownPath`, `title`, `documentId`, `examTypeId`, `academicId`, `studentId: null`, `studentFullName: null`, `adminNo: null` — but the file at `initialMarkdownPath` was written empty and no `data-streamDocument` parts were emitted. The client therefore has no way to know that the format step silently failed.

---

## 3. Expected Behaviour vs Observed Behaviour

The expected behaviour is defined by `src/lib/server/mastra/skills/reporting.skill.md` (ABSOLUTE RULES 1–8 and the Pipeline-at-a-Glance section). The observed behaviour is from Pillar 1.

| # | Pipeline Step | Expected (per skill) | Observed | Status |
|---|---------------|---------------------|----------|--------|
| 1 | Skill load on `/marksheet` | Reporting skill injected into system prompt | `### SKILL INSTRUCTIONS — Reporting ###` block present in dump | ✅ PASS |
| 2 | `streamDocument` first | Exactly one call with `contentHash` from manifest | One call, correct input, full metadata returned | ⚠️ PARTIAL |
| 2a | Document agent produces formatted markdown | `documentAgent.stream(prompt)` yields text chunks, written via `writer.custom` as `data-streamDocument` parts | `chunkCount=0, markdownLength=0` across 2 runs (Pillar 3). Upstream provider error `groq.chat has exhausted credits for deepseek-v4-flash` swallowed silently (Pillar 4). Tool returns `output-available` with empty content. | ❌ FAIL |
| 2b | Workspace panel auto-opens on first chunk | `inspector.openChatArtifact(documentId)` fires when first `data-streamDocument` delta arrives | Zero `data-streamDocument` parts arrive (consequence of 2a), so the receive handler never runs. The eye FAB on `ArtifactCard` does work because `SharedChatView.svelte:182` mounts `WorkspacePaneGroup` for chat routes — only the auto-open path is dead. | ❌ FAIL |
| 3 | `readWorkspaceFile` once for reasoning | At most one call after `streamDocument` | Three back-to-back calls, all returning empty content. The empty content is not mid-stream; the file IS empty because `streamDocument` wrote `markdown=''` to disk. | ❌ FAIL |
| 4 | No workspace search/grep | Skill forbids `search-school-directory` between steps | Two `mastra_workspace_grep` + one `mastra_workspace_search` (none named in skill) | ❌ FAIL |
| 5 | `validate-marksheet` next | Must succeed (tool is in skill's active toolset) | `Tool "validate-marksheet" not found` | ❌ FAIL |
| 6 | `commit-marksheet` on success | Triggered after ActionBar approval | Never reached | ❌ FAIL |
| 7 | `generate-result-pdf` / `publish-result-pdf` | Triggered per publish-intent | Never reached | ❌ FAIL |

Steps 1–2 succeed. Steps 3–7 cascade-fail because Step 5 returns a hard "tool not found" error (which the skill's ABSOLUTE RULE 6 explicitly tells the model to stop on).

---

## 4. Architecture Overview

```
POST /api/chat                            (src/routes/api/chat/+server.ts)
  │
  ├── buildWorkflowParams()                (src/routes/api/chat/workflow-params.ts)
  │     • promptText         = "/marksheet process the attached screenshot"
  │     • isSlashCommand     = promptText.trim().startsWith('/')  →  true
  │     • requestContext.set('isSlashCommand', true)
  │     • requestContext.set('lastMessage',  promptText)
  │     • requestContext.set('tenantContext', activeContext)
  │
  └── handleWorkflowStream({ workflowId: 'chatWorkflow' })
        │
        ▼
chatWorkflow                              (src/lib/server/mastra/workflows/index.ts:30)
        │
        ├── .parallel([classifyAndStreamWorkflow, titleStep])
        ├── extractFileItemsStep
        ├── collapseStep
        ├── resolveAgentContextStep        (workflows/chat/resolve-context-step.ts:24)
        │     │
        │     ├── reads requestContext.get('lastMessage')
        │     ├── reads requestContext.get('isSlashCommand')
        │     ├── ensureRegistry()                          ← initialises skillRegistry
        │     ├── skillTools = resolveToolsForMessage(...)   ← returns 10 marksheet tools
        │     └── returns { ...inputData, tools: { ...BASE_AGENT_TOOLS, ...skillTools } }
        │
        └── assistantStep                 (workflows/chat/assistant-step.ts:67)
              │
              ├── reads inputData.tools
              ├── agent.stream(inputData.promptText, {
              │     tools: inputData.tools,                 ← skill tools injected here
              │     requestContext, providerOptions, ...
              │ })
              └── streams fullStream → writer
                    │
                    ▼
              assistantAgent               (src/lib/server/mastra/agents/assistant.ts:108)
                    │
                    ├── static  tools  : BASE_AGENT_TOOLS              ← 4 tools only
                    ├── static  workspace: tenantWorkspace            ← exposes mastra_workspace_*
                    └── dynamic tools  : { ...BASE, ...skill }         ← MERGED IN VIA agent.stream
                                                  │                            │
                                                  ▼                            ▼
                                            what model sees          what model SHOULD see
                                            ──────────────           ──────────────────────
                                            web-search               web-search
                                            web-fetch                web-fetch
                                            getContext               getContext
                                            readWorkspaceFile        readWorkspaceFile
                                            streamDocument           streamDocument
                                            mastra_workspace_*       validate-marksheet       ← DROPPED
                                                                       auto-fix-marksheet     ← DROPPED
                                                                       commit-marksheet       ← DROPPED
                                                                       generate-result-pdf    ← DROPPED
                                                                       publish-result-pdf     ← DROPPED
                                                                       request-selection      ← DROPPED
                                                                       choose-document        ← DROPPED
                                                                       get-active-marksheet   ← DROPPED
```

The dynamic `tools` field passed via `agent.stream({ tools })` is supposed to merge with the static `tools:` field on the agent (per the comment in `src/lib/server/mastra/tools/internal/base-agent-tools.ts:3-22`). Runtime evidence proves this merger is not happening — the model only sees the static floor.

---

## 5. Root Cause Analysis

### RC1 — Legacy `workflows/chat.ts` is a duplicate-id dead file

- **File:** `src/lib/server/mastra/workflows/chat.ts:784`
- **Symptom:** No behavioural symptom today, but the file is a foot-gun.
- **Root cause:** A second `createWorkflow({ id: 'chatWorkflow', ... })` lives in `workflows/chat.ts` (line 784). The same id is owned by `workflows/index.ts:30`. Both export a top-level `chatWorkflow` symbol.
- **Evidence:**
  - `grep -n "chatWorkflow.*createWorkflow" src/lib/server/mastra/workflows/` returns two matches: `workflows/index.ts:30` (active) and `workflows/chat.ts:784` (legacy).
  - `src/lib/server/mastra/index.ts:11` imports `chatWorkflow` from `./workflows`, which resolves to `workflows/index.ts`. So the active workflow is the one registered.
  - The legacy file contains `hitlVerifyStep → assistantStep → selectionGateStep → continuationAssistantStep → awaitValidationStep` — a totally different chain from the active one. None of those steps are referenced anywhere else in the repo.
- **Why the existing fix doesn't work:** No fix is in place — the legacy file is simply unused. Any future `import { chatWorkflow } from './workflows/chat'` would silently shadow the active one and reintroduce the broken `hitlVerifyStep` chain.
- **Proposed fix:** Delete the file. (Executed as part of this investigation — see Appendix "Actions Taken".)

### RC2 — Dynamic toolset passed via `agent.stream({ tools })` is dropped at runtime

- **Files:**
  - `src/lib/server/mastra/workflows/chat/resolve-context-step.ts:49-58` — envelope output
  - `src/lib/server/mastra/workflows/chat/assistant-step.ts:82` — `tools: inputData.tools` passed to stream
  - `src/lib/server/mastra/agents/assistant.ts:114` — static `tools: BASE_AGENT_TOOLS`
  - `src/lib/server/mastra/tools/internal/base-agent-tools.ts:3-22` — comment claiming merger
- **Symptom:** The model cannot invoke `validate-marksheet`, `commit-marksheet`, `auto-fix-marksheet`, `generate-result-pdf`, `publish-result-pdf`, `request-selection`, `choose-document`, or `get-active-marksheet`. The console log shows all eight calls failing with "Tool not found".
- **Root cause:** `BASE_AGENT_TOOLS` is set as the agent's static `tools:` field at construction time (`agents/assistant.ts:114`). The workflow step attempts to extend this via the dynamic `tools` parameter on `agent.stream()`. Runtime evidence proves that parameter is **not merged** with the static field — only the static `BASE_AGENT_TOOLS` plus the workspace-injected family are visible to the model.
- **Evidence:**
  - `resolve-context-step.ts:55`: `const merged = { ...BASE_AGENT_TOOLS, ...skillTools };`
  - `resolve-context-step.ts:57`: `return { ...inputData, tools: merged };`
  - `assistant-step.ts:82`: `tools: inputData.tools,`
  - `assistant.ts:114`: `tools: BASE_AGENT_TOOLS,`
  - Console log failure: `Tool "validate-marksheet" not found. Available tools: web-search, web-fetch, getContext, readWorkspaceFile, streamDocument, mastra_workspace_read_file, ...`
- **Why the existing fix doesn't work:** The inline comment in `base-agent-tools.ts:3-22` states: *"Resolving tools in the workflow step and injecting them via `agent.stream({ tools })` — with this constant as the floor — fixes that."* The comment documents an **assumption** about the Mastra runtime's `agent.stream({ tools })` semantics. Runtime evidence disproves it. The dynamic `tools` parameter is either (a) ignored by Mastra's tool validator when the agent has static `tools:`, (b) discarded because it contains functions that fail a serialization round-trip, or (c) replaced by the static field entirely. Without probing Mastra's source, the exact mechanism is unknown — only the symptom is.
- **Proposed fix (out of scope of this report):** Move the skill-tool merge into the agent's static `tools:` resolver so the merged toolset is constructed once at agent init. Two viable shapes:
  1. **Resolve at construction:** have the assistant agent's `tools:` be a function that reads from a synchronously-loaded skill registry (no `await`). `ensureRegistry()` is already idempotent and synchronous after first call.
  2. **Per-request swap:** before `agent.stream(...)`, set `agent.tools` directly (if mutable) and re-run the validator.

  Whichever shape is chosen, the merged toolset must be visible to Mastra's tool validator before the stream begins, otherwise the model sees the truncated list.

### RC3 — WITHDRAWN — Panel mount is fine; root cause is upstream (see RC6 + RC7)

The original RC3 (in the v1 draft of this report) hypothesised that the workspace panel auto-open failed because `WorkspacePaneGroup` was conditionally mounted only on non-chat routes in `(chat)/+layout.svelte:99-105`. After user feedback (the eye FAB on `ArtifactCard` opens the panel correctly) and a second grep pass, this hypothesis was disproved:

- `SharedChatView.svelte:182` mounts `<WorkspacePaneGroup>` unconditionally for chat routes (the comment at `(chat)/+layout.svelte:94-98` describes this handoff — `SharedChatView` carries its own `<WorkspacePaneGroup><WorkspaceSidebar/></WorkspacePaneGroup>`).
- The eye FAB in `ArtifactCard.svelte:163-167` dispatches a `chat:openArtifact` window event; `SharedChatView.svelte:113-114` listens for it and calls `inspector.openChatArtifact(...)`.
- The auto-open path (`chat-context.svelte.ts:243-259`) calls `inspector.openChatArtifact(d.documentId)` when a `data-streamDocument` part arrives. The receive handler never runs because **no `data-streamDocument` parts ever arrive** — the document agent stream is empty (see RC6 + RC7).

**RC3 is withdrawn.** The panel mount is correct. The real cause of "workspace not opening on first chunk" is the empty stream caused by RC6 (model misconfiguration) + RC7 (error swallowing).

### RC4 — `mastra_workspace_*` tools leak into the agent via `workspace: tenantWorkspace`

- **File:** `src/lib/server/mastra/agents/assistant.ts:115` — `workspace: tenantWorkspace`
- **Symptom:** The model reaches for `mastra_workspace_grep` and `mastra_workspace_search` during the marksheet pipeline, even though no skill declares these tools.
- **Root cause:** The assistant agent is constructed with `workspace: tenantWorkspace`. The Mastra agent config exposes all filesystem tools of the workspace (`mastra_workspace_read_file`, `mastra_workspace_write_file`, `mastra_workspace_grep`, `mastra_workspace_search`, `mastra_workspace_list_files`, `mastra_workspace_mkdir`, `mastra_workspace_delete`, `mastra_workspace_file_stat`, `mastra_workspace_index`, `mastra_workspace_lsp_inspect`) directly to the model, independently of the `tools:` resolver pipeline.
- **Evidence:**
  - `grep "^  id:" src/lib/server/mastra/tools/` lists every tool id; none of the `mastra_workspace_*` ids appear in `TOOL_MAP`.
  - `reporting.skill.md` lines 6-17 declare only 10 tools; none are `mastra_workspace_*`.
  - Console log shows the model called `mastra_workspace_grep` and `mastra_workspace_search` even though the skill ABSOLUTE RULES don't mention them.
- **Why the existing fix doesn't work:** `BASE_AGENT_TOOLS` is the floor, the workflow tries to merge skill tools on top (RC2), but workspace tools come from a different code path entirely — the `workspace:` agent config. The `tools:` resolver never sees them. The skill's ABSOLUTE RULES are loaded into the prompt but they name only `search-school-directory`, not the workspace family, so the model improvises.
- **Proposed fix (out of scope of this report):** Two viable shapes:
  1. **Disable agent-level workspace tools by default.** Only inject `mastra_workspace_*` when the active skill explicitly declares them (none currently do).
  2. **Name them in the skill.** Add an explicit ABSOLUTE RULE in `reporting.skill.md`: *"Do NOT call any `mastra_workspace_*` tool (grep, search, list_files, etc.) during the marksheet pipeline. The CLASS ROSTER injected above is your lookup surface; the OCR markdown in `streamDocument`'s output is your content surface."* This is the lighter-touch fix.

### RC5 — Skill instructions are not deterministic enough to suppress wasteful tool calls

- **File:** `src/lib/server/mastra/skills/reporting.skill.md:25-39` (ABSOLUTE RULE 3)
- **Symptom:** Three back-to-back `readWorkspaceFile` calls on an empty file, plus two `mastra_workspace_grep` and one `mastra_workspace_search` for student names that are in the injected CLASS ROSTER.
- **Root cause:** ABSOLUTE RULE 3 reads: *"Do NOT call `search-school-directory` in between — `search-school-directory` is not in this skill's toolset for a reason."* That rule does not name the actual tools the agent has access to. The agent does not have `search-school-directory`; it has `mastra_workspace_grep` and `mastra_workspace_search`. The model improvises by analogy.
- **Evidence:**
  - Console log: three `readWorkspaceFile` calls with identical inputs (`marksheets/adakole_jpg-0adbef75.md`), all returning empty content.
  - Console log: `mastra_workspace_grep` with `pattern: "RYAN\|Adakole\|Ryan"`, then `pattern: "adakole"`, then `mastra_workspace_search` with `query: "adakole marksheet"`. None matched because the workspace was empty.
  - The CLASS ROSTER injected into the prompt already lists `RYAN ADAKOLE EMMANUEL (Adm#921) [studentId=844]` — the agent never needed to search.
- **Why the existing fix doesn't work:** The skill's ABSOLUTE RULES are written in the negative ("do NOT call X") but the negative is enumerated incompletely. The model interprets the absence of a prohibition on `mastra_workspace_*` as permission to use them.
- **Proposed fix (out of scope of this report):** Add explicit ABSOLUTE RULES:
  1. *"Do NOT call any `mastra_workspace_*` tool (grep, search, list_files, etc.) during the marksheet pipeline. The CLASS ROSTER injected above is your lookup surface."* (Also addresses RC4's lighter-touch fix.)
  2. *"Call `readWorkspaceFile` AT MOST ONCE after `streamDocument` returns. The tool re-reads the file at execution time, so the editor's auto-save is captured on every subsequent invocation — there is no benefit to calling it again before `validate-marksheet`."*
  3. *"If `readWorkspaceFile` returns empty content, the OCR markdown is still streaming via `data-streamDocument` data parts. Do NOT retry. Do NOT call workspace search. Proceed directly to `validate-marksheet({ currentMarkdownPath })`."*

### RC6 — Document agent uses an invalid model (`groq.chatModel('deepseek-v4-flash')`)

- **Files:**
  - `src/lib/server/mastra/agents/document.ts:74` — `model: DEFAULT_MODEL` (static, no `requestContext` fallback)
  - `src/lib/server/mastra/agents/shared.ts:55-61` — `groqProvider1 = createOpenAICompatible({ name: 'groq', ... })`
  - `src/lib/server/mastra/agents/shared.ts:77` — `DEFAULT_MODEL = groqProvider1.chatModel('deepseek-v4-flash')`
  - `src/lib/provider/catalog.ts:166, 224, 317` — `deepseek-v4-flash` only listed under `deepseek/`, `opencode/`, and `kimchi/` provider prefixes
- **Symptom:** `documentAgent.stream(prompt)` fails on every call. Two diagnostic runs show `chunkCount: 0, markdownLength: 0` (Pillar 3). The server-stderr provider error `the provider for model deepseek-v4-flash has exhausted its credits and cannot process requests, provider: 'groq.chat', modelId: 'deepseek-v4-flash'` is logged but never reaches the client (Pillar 4).
- **Root cause:** `groqProvider1` is the `createOpenAICompatible({ name: 'groq', ... })` instance. Groq is being asked for a model id (`deepseek-v4-flash`) that is not in Groq's hosted catalogue. The catalog confirms: `deepseek-v4-flash` exists only on the `deepseek/`, `opencode/`, and `kimchi/` providers — none of which is the groq provider. The error message about "exhausted credits" is the upstream provider's stock response when an unknown model id is requested on its base URL; the real issue is a provider/model mismatch.
- **Evidence:**
  - `agents/shared.ts:77`: `export const DEFAULT_MODEL = groqProvider1.chatModel('deepseek-v4-flash');`
  - `agents/document.ts:74`: `model: DEFAULT_MODEL,` (static field, not a function)
  - `src/lib/provider/catalog.ts` grep for `deepseek-v4-flash` returns three matches: line 166 (`deepseek/deepseek-v4-flash`, providerId `deepseek`), line 224 (`opencode/deepseek-v4-flash-free`, providerId `opencode`), line 317 (`kimchi/deepseek-v4-flash`, providerId `kimchi`). No match on `groq`.
  - Server stderr (Pillar 4) shows `provider: 'groq.chat'` paired with `modelId: 'deepseek-v4-flash'`.
- **Why the existing fix doesn't work:** The `documentAgent` has a static `model: DEFAULT_MODEL` field. Unlike `assistantAgent` (which reads from `requestContext.get('modelConfig')` then `requestContext.get('modelId')` in `agents/assistant.ts:115-119`), the document agent has no per-request fallback path. When `DEFAULT_MODEL` is wired to a model that the `groqProvider1` instance cannot host, every call fails identically.
- **Proposed fix (out of scope of this report):** Two complementary changes, both needed:
  1. Replace the static `model: DEFAULT_MODEL` in `agents/document.ts:74` with a `requestContext`-aware resolver that mirrors the `assistantAgent` pattern at `agents/assistant.ts:115-119`. This routes the tool call through the user's selected chat model (already on the requestContext, populated by `buildRequestContext` in `workflow-params.ts`).
  2. Either replace `DEFAULT_MODEL` itself with a model the `groqProvider1` instance actually hosts (e.g. `llama-3.1-8b-instant` or another Groq-native model) so the fallback path is also valid, OR change `groqProvider1`'s base URL + name to match the `kimchi` provider (which is documented as the platform fallback in `shared.ts:53-66`).

  Without both fixes, RC6 will recur on any platform that boots `groqProvider1` as the default.

### RC7 — Provider error is silently swallowed; `streamDocument` returns `output-available` with empty content

- **Files:**
  - `src/lib/server/mastra/tools/operations/reporting/marksheet/stream-document.ts:155-184` — `streamWithAutoRetry` + for-await loop over the document agent stream
  - `src/lib/server/mastra/agents/document.ts:77` — `errorProcessors: [new StreamErrorRetryProcessor()]`
  - `src/lib/server/mastra/agent-stream-retry.ts` — retry/shutdown logic (the user-facing symptom is that errors do not propagate to the caller)
- **Symptom:** When `documentAgent.stream()` errors out (e.g. with the RC6 provider error), the `streamDocument` tool still returns `state: 'output-available'` with full metadata (`artifactId`, `initialMarkdownPath`, `title`, etc.). The client has no way to know the format step failed. This is the proximate cause of (a) zero `data-streamDocument` parts arriving on the client, (b) the empty `initialMarkdownPath` file, and (c) the workspace panel never auto-opening.
- **Root cause:** `streamWithAutoRetry` wraps the document agent stream and retries on transient errors. The document agent's `StreamErrorRetryProcessor` retries again at the agent level. When all retries exhaust (or when the underlying error is a provider/model mismatch that `streamWithAutoRetry` cannot recover from), the resulting stream simply resolves with zero text chunks — no exception is thrown back to the caller. The for-await loop in `stream-document.ts:171-184` exits normally, the tool writes `markdown=''` to disk via `fs.writeFile(initialMarkdownPath, markdown, { recursive: true })` (line 196), and the tool returns `output-available` with full metadata (line 208).
- **Evidence:**
  - `stream-document-diag.log` (Pillar 3): `chunkCount: 0, markdownLength: 0` for two runs of the same contentHash.
  - Server stderr (Pillar 4): provider error logged but never thrown back to the tool caller.
  - The toolPart shows `state: 'output-available'` with `initialMarkdownPath` and `title` populated (Pillar 1).
  - `chunkCount === 0` is *not* treated as a failure condition anywhere in `stream-document.ts`; the code path to `return { ok: true, ... }` is the same whether `markdown` is empty or not.
- **Why the existing fix doesn't work:** No error-propagation or zero-content check exists between the for-await loop and the tool's `return`. The current code conflates "stream completed" with "stream produced content".
- **Proposed fix (out of scope of this report):** Add a post-stream guard in `stream-document.ts` (just before the `await fs.writeFile(initialMarkdownPath, markdown, ...)` call on line 196). Two stacked checks:

  ```ts
  try {
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      markdown += chunk;
      await writerWithCustom.custom({ type: 'data-streamDocument', data: { documentId, phase: 'delta', delta: chunk }, transient: true });
    }
  } catch (err) {
    throw new Error(`STREAM_DOCUMENT_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (markdown.length === 0) {
    throw new Error('STREAM_DOCUMENT_EMPTY: document agent produced no text chunks — likely a model/provider configuration issue. Check `agents/shared.ts:DEFAULT_MODEL` against `provider/catalog.ts`.');
  }
  ```

  Both checks throw, which propagates back through `agent.stream()` → tool `execute` → `toolPart.state = 'output-error'`. The client-side `chat-context` handler already routes `output-error` to the existing friendly-error pipeline (see `chat-context.svelte.ts` `#onError`), and the receive-side error path surfaces in the chat UI. With this guard in place, RC6's misconfiguration would have produced an actionable error on the first run instead of a silent empty stream.

---

## 6. Why Tool-Redundancy Happens (Deep Dive)

The nine tool calls in the user's console log look like the model is being careless — but the *real* cause is upstream: **the document agent's stream is empty** (RC6 + RC7), so the orphan draft at `initialMarkdownPath` is written with empty content. The model has no signal that anything failed — the tool returned `output-available` with full metadata — so it interprets the empty file as a transient "still streaming" state and polls.

Tracing the model's reasoning trace from the console log with the corrected upstream cause:

1. **`streamDocument`** returns `output-available` with full metadata. Model now has `artifactId`, `initialMarkdownPath: "marksheets/adakole_jpg-0adbef75.md"`, `title: "adakole_jpg"`, and the rest of the metadata. The model has no way to know the document agent stream failed (RC7 swallowed the error). ABSOLUTE RULE 1 is satisfied.

2. **First `readWorkspaceFile`** (`call_00_j3itSFBBXT8FCLiA15I44169`): the file exists but is **permanently** empty — not mid-stream. The server-side `stream-document.ts:196` writes `fs.writeFile(initialMarkdownPath, markdown, ...)` with `markdown=''` because the for-await loop on lines 171-184 never executed (chunkCount=0). The file's content will never change; no amount of polling will help.

3. **Reasoning (model's view):** *"The workspace file returned as empty content initially - but that's because `streamDocument` streams the content token-by-token to the workspace panel. The file path is persisted for the editor. Let me check if there's been any content written since. Let me re-read the file to see if content was persisted."* The model's hypothesis is reasonable but wrong: it believes the stream is still in flight.

4. **Second `readWorkspaceFile`** (`call_00_OHLl5aWaJkO85FY4a9wH4593`): identical input, identical empty output. The model is now polling.

5. **Third `readWorkspaceFile`** (`call_00_vQTEpBYfWXVWIZbPSRTc5992`): identical input, identical empty output. Three polling calls in a row. Had the model known the upstream cause (RC6: invalid model; RC7: swallowed error), it would not have wasted these calls.

6. **Reasoning (model's view):** *"The file is empty at the moment. The `streamDocument` already streamed the formatted marksheet to the workspace panel. The editor panel handles disk persistence after the user verifies. Let me continue with the flow as instructed."* The model continues with the architecture it was instructed to follow, but it's already burned three tool calls on a fruitless poll.

7. **`mastra_workspace_grep`** (`call_00_NX4wWiAuKJH2WYM2ipry7221`, pattern `"RYAN|Adakole|Ryan"`, path `"marksheets"`): zero matches. The model is searching the workspace for student names because it has no `@mention` to resolve from the OCR text and no inline `student:` field was passed. The CLASS ROSTER injected into the prompt *contains* `RYAN ADAKOLE EMMANUEL [studentId=844]`, but the model did not consult it for Branch B matching.

8. **`mastra_workspace_search`** (`call_00_SzcvM9VBhhiLQeqr3mCC2161`, query `"adakole marksheet"`, mode `"bm25"`): zero results.

9. **`mastra_workspace_grep`** (`call_00_K9Pz577zv06vo0FOB1SB3903`, pattern `"adakole"`): zero matches.

10. **Reasoning:** the model now has the student identity it needs (via the CLASS ROSTER, surfaced manually in its thinking) and calls `validate-marksheet` with `{student: {id: 844, name: "RYAN ADAKOLE EMMANUEL", admissionNo: "921"}, ...}`.

11. **`validate-marksheet`** (`call_00_kUF1AMtyb3pe5z9irDLE1896`): the tool returns `Tool "validate-marksheet" not found. Available tools: web-search, web-fetch, getContext, readWorkspaceFile, streamDocument, mastra_workspace_read_file, ...`. RC2 strikes.

12. **Final text:** the model surrenders and writes a friendly "next steps" message, deferring the rest of the pipeline to a future turn.

Eight redundant or off-pipeline tool calls before the single load-bearing call that hard-fails.

---

## 7. Skill-Loading Audit

The investigation confirmed that **prompt construction is not the bug**. Every prompt-side input the model needs is present in the diagnostic dump:

| Concern | Status | Evidence |
|---------|--------|----------|
| Skill matched for `/marksheet` | ✅ PASS | `instructions.md` shows `### SKILL INSTRUCTIONS — Reporting ###` block |
| Tenant context populated | ✅ PASS | `instructions.md` shows `School: Lighthouse Leading Academy`, `Class: CRECHE - A`, `Academic Year: 2025/2026`, `Exam Type: SECOND TERM EXAMINATION - MCH/2026` |
| Tool IDs populated for tool arguments | ✅ PASS | `instructions.md` shows `schoolId: 1, classId: 12, sectionId: 5, academicId: 4, examTypeId: 6` |
| CLASS ROSTER injected | ✅ PASS | `instructions.md` lists 24 students, including `RYAN ADAKOLE EMMANUEL (Adm#921) [studentId=844]` |
| FILE MANIFEST injected | ✅ PASS | `instructions.md` shows `- adakole.jpg.jpeg (contentHash: 0adbef757d8c14d65e873f54d0fbd049)` |
| Skill-declared tool IDs exist in `TOOL_MAP` | ✅ PASS | All 10 tool IDs (`streamDocument`, `readWorkspaceFile`, `validate-marksheet`, `auto-fix-marksheet`, `commit-marksheet`, `generate-result-pdf`, `publish-result-pdf`, `request-selection`, `choose-document`, `get-active-marksheet`) verified via `grep "^  id:" src/lib/server/mastra/tools/` |
| Skill tools reach the model at runtime | ❌ **FAIL** | Console log shows only `web-search, web-fetch, getContext, readWorkspaceFile, streamDocument, mastra_workspace_*` |

**Conclusion:** Skill loading is healthy on the prompt side. The break is between the workflow envelope (`inputData.tools`) and the runtime toolset the model actually sees.

---

## 8. Workspace Auto-Open Audit

The v1 hypothesis for this section was that `WorkspacePaneGroup` was conditionally mounted only on non-chat routes. **That hypothesis was disproved** by user feedback (the eye FAB on `ArtifactCard` opens the panel correctly) and a follow-up grep pass. The corrected audit is below.

### The panel mount is fine

`WorkspacePaneGroup` IS mounted for chat routes — just not from `(chat)/+layout.svelte`. The chat subtree is rendered by `<SharedChatView>`, which carries its own `<WorkspacePaneGroup><WorkspaceSidebar/></WorkspacePaneGroup>` wrapper:

```
src/lib/components/SharedChatView.svelte:182-283
  <WorkspacePaneGroup>
    <!-- ...split-pane layout, WorkspaceSidebar contains ArtifactViewer... -->
  </WorkspacePaneGroup>
```

The comment at `src/routes/(chat)/+layout.svelte:94-98` documents this handoff explicitly:

```
// Chat pages render <SharedChatView>, which carries its own
// <WorkspacePaneGroup><WorkspaceSidebar /></WorkspacePaneGroup> so
// ArtifactViewer inside WorkspaceSidebar can resolve useChat(). Filestore
// and any other non-chat routes in this group get the layout-level
// WorkspacePaneGroup/WorkspaceSidebar (no chat access needed there).
```

`<InspectorProvider>` at `(chat)/+layout.svelte:99-105` wraps both branches, so the `InspectorContext` is available to chat routes regardless of which `WorkspacePaneGroup` instance is used.

The eye FAB on `ArtifactCard` confirms the mount is correct:

```
src/lib/components/ArtifactCard.svelte:163-167
  dispatch("chat:openArtifact", { artifactId });
  window.dispatchEvent(
    new CustomEvent("chat:openArtifact", { detail: { artifactId } }),
  );
```

`SharedChatView.svelte:113-114` listens for this event and calls `inspector.openChatArtifact(...)`, which opens the panel. If the panel were not mounted, the click would be a no-op. The user reports the click works.

### The auto-open path is also correct

`chat-context.svelte.ts:243-259` correctly invokes `inspector.openChatArtifact(d.documentId)` when the first `data-streamDocument` delta arrives:

```ts
case "data-streamDocument":
  const d = (part as { data?: { documentId?: string; phase?: 'start' | 'delta' | 'end'; delta?: string } }).data;
  this.#streamDocumentPartsReceived++;
  console.log('[chat-context-DIAG] data-streamDocument part received', { totalReceived: this.#streamDocumentPartsReceived, phase: d?.phase, hasDelta: typeof d?.delta === 'string', documentId: d?.documentId });
  if (!d?.documentId) return;
  if (d.phase !== 'delta' || typeof d.delta !== 'string') return;
  const prev = getDocumentStream(d.documentId);
  patchDocumentStream(d.documentId, { ... });
  if (!this.#autoOpenedToolCallIds.has(d.documentId)) {
    this.#autoOpenedToolCallIds.add(d.documentId);
    this.#inspector?.openChatArtifact(d.documentId);   // ← sets inspectorOpen = true
  }
  break;
```

The diagnostic counter added to the case handler increments on every received `data-streamDocument` part (regardless of phase). In the failing run, this counter stays at zero because no parts are emitted upstream — see RC6 (model misconfiguration) and RC7 (error swallowing).

### The fix is upstream, not layout-side

The auto-open logic and the panel mount are both correct. The only reason the auto-open path does not fire is that no `data-streamDocument` parts ever reach the client — because `documentAgent.stream(prompt)` produces zero text chunks (Pillar 3) due to a provider/model mismatch (Pillar 4, RC6) that is silently swallowed by `streamWithAutoRetry` + `StreamErrorRetryProcessor` (RC7). Fixing the auto-open path requires fixing the upstream cause; the auto-open code itself does not need to change.

The v1 RC3 (always-mount `WorkspacePaneGroup` on chat routes, expand-on-stream to `ArtifactCard`, etc.) is therefore obsolete. Those fixes would address a bug that does not exist.

---

## 9. Decisions Made During Analysis

These are the investigative turns worth recording so the next reader does not repeat them:

- **Import graph confirmed `workflows/chat.ts` is dead code.** `grep -n "from '\./workflows/chat'" src/` returns zero hits. `grep -n "from './chat'" src/lib/server/mastra/workflows/` returns zero hits. The only importer of `chatWorkflow` is `src/lib/server/mastra/index.ts:11`, which imports from `./workflows` (= `workflows/index.ts`).
- **Skill tool IDs all match `TOOL_MAP` keys.** Casing and hyphenation verified via `grep "^  id:" src/lib/server/mastra/tools/`. The 10 reporting-skill tools have ids `streamDocument`, `readWorkspaceFile`, `validate-marksheet`, `auto-fix-marksheet`, `commit-marksheet`, `generate-result-pdf`, `publish-result-pdf`, `request-selection`, `choose-document`, `get-active-marksheet`. All 10 exist as exported `createTool({...})` instances merged into `coreTools`. This rules out a casing/id mismatch as a root cause for the "Tool not found" errors.
- **`instructions.md` is the post-hoc prompt snapshot.** The file is overwritten on every chat turn by `writeFileSync('/home/beznet/Workspace/edapex/instructions.md', instructions.join('\n'));` in `skill-instructions.ts:271`. It represents the most recent request's full system prompt, not a curated sample. For the analysis, this is more authoritative than re-joining strings from `skill-instructions.ts` because it eliminates the prompt-builder as a possible source of error.
- **`(chat)/+layout.svelte` is the chat-route layout.** The conditional `WorkspacePaneGroup` mount is in this file. The chat-only subtree is rendered by `<SharedChatView>` (not read in this investigation, but visible via `(chat)/chat/[chatId]/+page.svelte`).
- **No code modifications were made in plan mode.** The plan phase is read-only. The deletion of `workflows/chat.ts` is the only file change, and it was approved as part of the plan.

---

## 10. Recommended Fix Order

These fixes are listed for follow-up plans. None are in scope of this analysis report.

| Priority | Root Cause | Effort | Impact | Fix Outline |
|----------|-----------|--------|--------|-------------|
| 1 | RC1 — Legacy `workflows/chat.ts` | XS | Low (correctness / future-proofing) | Delete the file. **Already done as part of this investigation.** |
| 2 | RC2 — Dynamic tool injection dropped | M-H | **Critical** (entire pipeline blocked) | Investigate Mastra's `agent.stream({ tools })` semantics. If dynamic merge is unsupported, refactor the assistant agent's `tools:` to be a function resolved at construction time against the synchronously-loaded skill registry. |
| 3 | RC3 — Workspace panel not mounted on chat routes | M | High (UX blocker) | Choose between (a) always-mount `WorkspacePaneGroup`, (b) inline expand on `ArtifactCard`, (c) overlay mounted inside `chat.svelte`. User UX preference required. |
| 4 | RC4 — `mastra_workspace_*` tools leak | S-M | Medium (cost + quality) | Either disable agent-level workspace tools and inject only via skill resolver, OR add an explicit ABSOLUTE RULE naming each workspace tool and forbidding them during marksheet pipeline. |
| 5 | RC5 — Skill rules too narrow | S | Medium (token cost + latency) | Add explicit ABSOLUTE RULES to `reporting.skill.md`: (a) forbid `mastra_workspace_*`, (b) cap `readWorkspaceFile` at one call after `streamDocument`, (c) proceed to `validate-marksheet` even if `readWorkspaceFile` returns empty. |

RC2 is the single largest blocker. Without it, none of the four downstream marksheet tools can run. RC3 is the second largest because even if RC2 is fixed, the user cannot see the workspace panel auto-open — they must click through.

---

## 11. Appendix — Files Reviewed

- `src/lib/components/chat.svelte` — message list, approval rendering, inline ArtifactCard.
- `src/lib/context/chat-context.svelte.ts` — `data-streamDocument` handler, tool-call handler, `openChatArtifact` invocation.
- `src/lib/context/thread-data.svelte.ts` — module-level `documentStreams` reactive proxy.
- `src/lib/context/inspector-context.svelte.ts` — `inspectorOpen`, `openChatArtifact`, sessionStorage persistence.
- `src/lib/components/ArtifactCard.svelte` — inline Shimmer card; dispatches `chat:openArtifact`.
- `src/lib/components/chat/ActionBar.svelte` — HITL approve/reject for `requireApproval: true` tools.
- `src/lib/components/workspace/ArtifactViewer.svelte` — actual artifact viewer (only mounted off-chat).
- `src/lib/components/workspace/WorkspaceSidebar.svelte` — desktop sidebar wrapper containing `<ArtifactViewer>`.
- `src/lib/components/workspace/InspectorProvider.svelte` — sets `InspectorContext` on the layout.
- `src/routes/(chat)/+layout.svelte` — conditional `WorkspacePaneGroup` mount; wraps chat subtree in `<InspectorProvider>`.
- `src/lib/server/mastra/skills/reporting.skill.md` — skill definition, ABSOLUTE RULES, pipeline steps.
- `src/lib/server/mastra/skill-registry.ts` — manifest + validator; rejects skills referencing unknown tool ids.
- `src/lib/server/mastra/agents/skill-instructions.ts` — prompt builder (writes `instructions.md` at line 271).
- `src/lib/server/mastra/skill-tools.ts` — `TOOL_MAP`, `SKILL_COMMAND_MAP`, `resolveToolsForMessage`, natural-language skill detection.
- `src/lib/server/mastra/tools/index.ts` — `coreTools` aggregation; single source of truth for tool registration.
- `src/lib/server/mastra/tools/internal/base-agent-tools.ts` — `BASE_AGENT_TOOLS` (4 tools).
- `src/lib/server/mastra/tools/internal/choose-document.ts` — `chooseDocumentTool`.
- `src/lib/server/mastra/tools/internal/selection-tools.ts` — `requestSelectionTool`.
- `src/lib/server/mastra/tools/internal/workspace-read.ts` — `readWorkspaceFileTool`.
- `src/lib/server/mastra/tools/operations/reporting/marksheet/stream-document.ts` — `streamDocumentTool`.
- `src/lib/server/mastra/tools/operations/reporting/marksheet/validate-marksheet.ts` — `validateMarksheetTool` (`requireApproval: true`).
- `src/lib/server/mastra/tools/operations/reporting/marksheet/auto-fix-marksheet.ts` — `autoFixMarksheetTool` (`requireApproval: true`).
- `src/lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet.ts` — `commitMarksheetTool` (`requireApproval: true`).
- `src/lib/server/mastra/tools/operations/reporting/marksheet/get-active-marksheet.ts` — `getActiveMarksheetTool`.
- `src/lib/server/mastra/tools/operations/reporting/index.ts` — `reportingTools` aggregation including PDF tools.
- `src/lib/server/mastra/agents/assistant.ts` — `assistantAgent`, static `tools: BASE_AGENT_TOOLS`, `workspace: tenantWorkspace`.
- `src/lib/server/mastra/agents/shared.ts` — `requestContextSchema`, default models.
- `src/lib/server/mastra/workflows/index.ts` — ACTIVE `chatWorkflow` chain (line 30).
- `src/lib/server/mastra/workflows/chat.ts` — LEGACY `chatWorkflow` (duplicate id, line 784). **DELETED as part of this investigation.**
- `src/lib/server/mastra/workflows/chat/resolve-context-step.ts` — merges skill tools into envelope.
- `src/lib/server/mastra/workflows/chat/assistant-step.ts` — passes `inputData.tools` to `agent.stream`.
- `src/lib/server/mastra/index.ts` — singleton Mastra registration.
- `src/routes/api/chat/+server.ts` — chat route entry; POST handler, GET history hydration.
- `src/routes/api/chat/workflow-params.ts` — builds requestContext, `isSlashCommand` detection, approval resume.
- `instructions.md` (project root) — diagnostic dump from `skill-instructions.ts`.

---

## 12. Glossary

- **tenantContext** — Active school/class/section/exam/student identity for the request. Bound to the workflow's requestContext at `/api/chat` entry. Tools read it via `ctx.requestContext?.get('tenantContext')`.
- **requestContext** — Per-request state bag passed through the Mastra workflow and accessible to every tool's `execute`. Includes tenantContext, modelId, isSlashCommand, lastMessage, fileManifest, resolvedMentions.
- **TOOL_MAP** — `Record<string, Tool>` in `src/lib/server/mastra/skill-tools.ts` populated from every tool in `coreTools`. Used by `resolveToolsForMessage` to look up tools by id.
- **BASE_AGENT_TOOLS** — The four-tool floor (`globalTools + getContext + readWorkspaceFile + streamDocument`) defined in `tools/internal/base-agent-tools.ts`. Always available to the assistant agent regardless of skill.
- **skillTools** — The toolset declared in a skill's YAML frontmatter (`tools:` array), resolved through `TOOL_MAP`. Merged with `BASE_AGENT_TOOLS` in the workflow envelope.
- **data-streamDocument** — AI SDK v6 stream part carrying `streamDocument` deltas to the client. Phases: `start`, `delta`, `end`. The client accumulates `delta` content into the module-level `documentStreams` reactive proxy.
- **pendingApproval** — A reactive derived value in `chat.svelte` that surfaces the first `state: 'approval-requested'` tool part from the latest assistant message. Drives `<ActionBar>` rendering.
- **ActionBar** — The unified approval surface rendered above `<ChatComposer>` for `requireApproval: true` tools. Handles approve/reject for `validate-marksheet`, `commit-marksheet`, `auto-fix-marksheet`, `generate-result-pdf`, `publish-result-pdf`, `request-selection`, etc.

---

## Actions Taken (this investigation)

| Action | File | Status |
|--------|------|--------|
| Write analysis report | `docs/marksheet-pipeline-analysis.md` | ✅ Created (this file) |
| Delete legacy duplicate workflow | `src/lib/server/mastra/workflows/chat.ts` | ✅ Deleted |
| Verify no dangling imports | `grep -rn "workflows/chat'" src/` | ✅ Empty |
| Verify no dangling imports | `grep -rn "from './chat'" src/lib/server/mastra/workflows/` | ✅ Empty |
| Verify typecheck | `pnpm run svelte-check` | ⏳ To be run post-deletion |
| Verify lint | `pnpm run lint src/lib/server/mastra/workflows/` | ⏳ To be run post-deletion |

---

*Report authored during the marksheet pipeline investigation, 2026-07-14. Cross-references every root cause with file:line evidence and the diagnostic prompt dump at `/home/beznet/Workspace/edapex/instructions.md`.*
