# Chat Agentic UI — Wireframe & Lifecycle

> **Companion to:** `.superpowers/plans/2026-07-08-chat-agentic-ui-redesign.md`
> **Source spec:** `.superpowers/specs/2026-07-08-chat-agentic-ui-redesign.md`

This document is the visual lifecycle of the redesigned chat surface. Every visual element is annotated with the spec section / fix that produces it. Use it as the smoke-test script during chunk execution.

---

## 0. Static frame (always present)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌──┐                                                                    ← F2
│  │≡ │ Sidebar    [ claude-sonnet-4.5 ▾ ]              [ 24k/200k tokens ] │   ← header (post-F2)
│  └──┘                                                                    ← ActivityPopover REMOVED;
│                                                                          TODO comment in source
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                                                             │
│                       ( conversation scroll area )                          │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  [ Markdown / @-mention · slash commands · / ]                       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  [Paperclip] [ + ]                                          [  ↑ Send  ]    │   ← composer (post-F2)
│                                                                         ContextUsageIndicator REMOVED
└─────────────────────────────────────────────────────────────────────────────┘
                                                                              ┌─────
                                                                              │ ← toaster mounts here
                                                                              │   (bottom-left, post-F3)
                                                                              └─────
```

No `<PreviewModal />` overlay exists (post-F1). No PDF modal can pop over the workspace pane.

---

## 1. User sends a prompt

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  @mr-johnson  Validate the 2nd-term maths marksheet, please.          │  │   ← user message
│  └───────────────────────────────────────────────────────────────────────┘  │      (accent bg, right-aligned)
│                                                       [ copy ]  [ edit ]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

User message renders via `Message` / `MessageContent` (`variant="flat"`).

---

## 2. Assistant begins: reasoning + first tool call

While `chat.status === "streaming"` and `chat.lastMessage?.id === lastAssistantMessage?.id`, an inline shimmer placeholder can render under the message if `hasVisibleContent` is false:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ▾ Thinking...                                              ← Reasoning    │   ← spec §4.5 inner
│    ┌───────────────────────────────────────────────────────────────────┐    │      existing
│    │  The user wants validation on the maths marksheet for             │    │      ReasoningContent
│    │  Mr Johnson's class, 2nd term. I need to:                          │    │      + Markdown
│    │   1. Find the marksheet (choose-document)                          │    │
│    │   2. Run validation (validate-marksheet)                           │    │
│    │   3. Surface results back for user approval                        │    │
│    └───────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ▾ Tools (1)                                                       ← F4    │   ← ToolGroup
│  ┌───────────────────────────────────────────────────────────────────────┐  │      defaultOpen=true
│  │ ▾ chooseDocument · input-available                                    │  │      (spec §4.5 code)
│  │   ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │   │ INPUT                                                             │  │  │      ToolHeader
│  │   │   { "classId": 7, "subject": "maths", "term": 2 }                 │  │  │      + ToolInput
│  │   │   }                                                               │  │  │
│  │   └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                                                                       [ ✨ ] │   ← generating shimmer
│                                                                             │      (lastAssistantMessage, status streaming,
│                                                                             │       !hasVisibleContent)
└─────────────────────────────────────────────────────────────────────────────┘
```

`ToolGroup` renders the "Tools (N)" header with chevron (`group-data-[state=closed]:-rotate-90`), `defaultOpen=true` so users always see what the agent did. The count comes from the precomputed `toolParts.length` in `chat.svelte`'s `$derived` (spec §4.5).

---

## 3. Tool completes — ArtifactCard flips loading → done

The `tool-streamDocument` tool result emits a `data-streamDocument` data part. The "Thinking completed >" wrapper renders because `message.hasArtifact === true`:

### 3a. While the artifact is processing

```
│  ▸ Thinking completed                                              ← F5    │   ← parent wrapper
│  ┌───────────────────────────────────────────────────────────────────────┐  │      rendered by chat.svelte
│  │  ░░░░░░░░░░░░░░░░░░░░  ← purple→blue→pink gradient, animate-pulse     │  │      (NOT inside ArtifactCard;
│  │  ░░░░░░░░░░░░░░░░░░░░                                                │  │      spec §4.6 design constraint)
│  │  ░░░░░░✨░░░░░░░░░░░  ← 96×96 thumbnail + Sparkles icon              │  │
│  │                                                                       │  │
│  │  ════════════════════════════  ← h-3 skeleton w-3/4 (animate-pulse)  │  │      ArtifactCard
│  │  ════════════════════════     ← h-2.5 skeleton w-full                │  │      status: 'processing'
│  │  You'll be informed immediately upon completion.                      │  │      (spec §4.6 loading state)
│  │                                                                       │  │
│  │  ─────────────────────────────────────────────────────────────────── │  │
│  │  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔   ← h-2.5 w-16 skeleton                       [ 👁 ]│  │      eye button DISABLED
│  └───────────────────────────────────────────────────────────────────────┘  │      (no artifactId yet)
```

### 3b. When the artifact is done

```
│  ▾ Thinking completed                                              ← F5    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────────┐                                                  │  │
│  │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  Artifacts                                       │  │      ArtifactCard
│  │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  maths-term2.md                                  │  │      status: 'success'
│  │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                                                  │  │      (spec §4.6 done state)
│  │  │ ▓ ▓▓▓▓▓ ▓▓▓▓▓▓▓ │                                                  │  │
│  │  │ ▓ ▓▓▓ ▓ ▓▓ ▓ ▓▓ │                                                  │  │
│  │  └─────────────────┘                                                  │  │
│  │                                                                       │  │
│  │  ─────────────────────────────────────────────────────────────────── │  │
│  │  05/22/2026 10:25                                              [ 👁 ]│  │      timestamp rendered via
│  └───────────────────────────────────────────────────────────────────────┘  │      formatTimestamp()
│                                                                             │
│       ↑ clicking 👁 dispatches `chat:openArtifact` (createEventDispatcher,  │
│         typed event). Parent (chat.svelte) opens workspace pane.           │
```

---

## 4. Loop continues — multiple tool calls grouped

The AI SDK runs up to `maxSteps: 30` inside `assistantStep` (per spec header note: the workflow-level `.dountil()` was reverted). Each cycle can emit more `tool-*` parts. They aggregate under the same `ToolGroup`:

```
│                                                                             │
│  ▾ Tools (3)                                                       ← F4    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ ─────────────────────────────────────────────────────────────────────  │  │
│  │ ▾ chooseDocument · output-available                          ✓        │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │   │ OUTPUT                                                           │  │  │
│  │   │   Status: SUCCESS                                                │  │  │      StudentResultCard
│  │   │   Message: 1 marksheet selected                                  │  │  │      or defaultTool Card
│  │   │   ┌────────────────────────────────────────────────────────────┐ │  │  │      with message/status
│  │   │   │ ✓ SUCCESS                                                  │ │  │  │      Badges (existing
│  │   │   │   1 marksheet selected                                      │ │  │  │      tool-message logic)
│  │   │   └────────────────────────────────────────────────────────────┘ │  │  │
│  │   │   [ Record #143 ] [ Class #7 ]                                   │  │  │
│  │   └─────────────────────────────────────────────────────────────────┘  │  │
│  │   ▸ View raw output                              [ 📋 ]               │  │  ← F4b: copy-to-clipboard
│  │      (click 📋 → navigator.clipboard.writeText(JSON.stringify(...))    │  │     button next to label,
│  │       → toast.success("Copied!") / toast.error on permission denied)  │  │     inside raw JSON
│  │ ─────────────────────────────────────────────────────────────────────  │  │     collapsible trigger
│  │ ▾ validateMarksheet · output-available                      ✓         │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │   │ ✓ 12 valid · 3 invalid                                          │  │  │      ValidationSummary
│  │   │   • row 4  — total out of range                                  │  │  │      component
│  │   │   • row 11 — student_id missing                                  │  │
│  │   │   • row 19 — score > max                                         │  │
│  │   └─────────────────────────────────────────────────────────────────┘  │  │
│  │   ▸ View raw output                              [ 📋 ]               │  │
│  │ ─────────────────────────────────────────────────────────────────────  │  │
│  │ ▸ streamDocument · output-available   (closed by default — user       │  │
│  │                                          can expand for input)       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
```

`ToolGroup` shows "Tools (3)" reflecting all three `tool-*` parts in this assistant message. Each individual `ToolMessage` still renders its own state machine (`input-streaming` / `input-available` / `output-available` / `output-error`) per the existing `tool-message.svelte` logic.

---

## 5. Assistant final response

```
│                                                                             │
│  I reviewed the maths marksheet for Mr Johnson's 2nd term. Here's what       │
│  I found:                                                                    │
│                                                                             │
│  • 12 students have valid scores                                              │
│  • 3 rows need correction:                                                    │
│     - Row 4: total exceeds 100                                               │
│     - Row 11: missing student ID                                              │
│     - Row 19: score higher than max                                           │
│                                                                             │
│  I auto-fixed what I could. The marksheet is ready for your review —         │
│  approve below to commit, or edit it first.                                  │
│                                                                             │
│                                                       [ copy ]  [ ↻ retry ]  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Rendered via the existing `Markdown` component inside `MessageContent`. `MessageAction` shows copy + retry buttons (unchanged).

---

## 6. HITL validation gate — `ActionBar` surfaces

The `awaitValidation` data part (persisted via `writeDataPart` per backend commit `fd7cd37`) reaches `chat.svelte`. The existing `ActionBar` renders:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─[✓]────────────────────────────────────────────────────────────┐  │  │
│  │  │  Marksheet validation required                                  │  │   ← ActionBar
│  │  │  marksheets/7 · 2nd term                                         │  │      mode="validation"
│  │  │  ──────────────────────────────────────────────────────────────  │  │      (existing,
│  │  │  [ ✓ Validate ]   [ Skip ▾ ]                                    │  │       spec §2.1)
│  │  │                  ├─ Force commit (skip auto-fix)                 │  │      dropdownOptions
│  │  │                  └─ Save without committing                      │  │      → resumeWorkflow(id, dropdownId)
│  │  └─────────────────────────────────────────────────────────────────┘  │      → cancelValidation()
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                              ┌─────
                                                                              │ ⚠ Rate limit
                                                                              │   will hit at 14:32
                                                                              │   (Toaster bottom-left,
                                                                              │    post-F3)
                                                                              └─────
```

The ActionBar mounts inside the floating composer wrapper; it consumes the persisted `data-awaitValidation` part that the new workflow emits.

The `cancelValidation()` call (wired to `Skip` → `onSecondary`) already exists in the chat context; no new wiring is needed for this spec.

---

## 7. Error scenario — `AUTO_FIX_EXHAUSTED`

If auto-fix retries are exhausted, `categorizeAIError` returns the new variant (spec §4.7, F6) and `ErrorAlert` renders:

```
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  ⚠  Auto-fix couldn't resolve all issues                              │  │   ← ErrorAlert
│  │     We've auto-corrected what we could. Review the remaining          │  │      (F6)
│  │     marksheet errors and edit the document, then click                 │  │
│  │     Validate again.                                                    │  │
│  │                                                                       │  │
│  │     [ Edit marksheet ]                                                │  │   ← NEW button
│  └───────────────────────────────────────────────────────────────────────┘  │      action: edit_marksheet_then_retry
│                                                                             │      → goto('/workspace')
│                                                                             │      or open marksheet view
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Five more error variants follow the same shape:
- `STUDENT_ID_MISSING` → "Mention a student"
- `PERSIST_PATH_MISSING` → "Run /format"
- `TOOL_NOT_REGISTERED` → "Contact support" (no button)
- `AGENT_LOOP_EXHAUSTED` → "Rephrase"
- `BUN_PRECONDITION_FAILED` → "Contact support" (no button)

---

## 8. The complete loop, at a glance

```
USER                    ASSISTANT                                    TOOLS / ARTIFACTS
─────                   ─────────                                    ────────────────
"@mr-johnson
 Validate maths
 2nd term."
                        ▾ Thinking...                                ← Reasoning (existing)
                          (1) find marksheet
                          (2) validate
                          (3) surface for approval

                        ▾ Thinking completed                         ← F5 wrapper
                        ┌────────────────────────────────────────┐
                        │ ░░ gradient + ✨ Artifacts placeholder  │   ← ArtifactCard (loading)
                        │  "You'll be informed immediately..."   │
                        └────────────────────────────────────────┘

                        ▾ Tools (3)                                  ← F4 ToolGroup
                          ▾ chooseDocument  ✓ Status: SUCCESS      ← tool-message
                          ▾ validateMarksheet ✓ 12 valid / 3 errors ← tool-message
                          ▸ streamDocument  (artifact generated)    ← tool-message

                        ▾ Thinking completed                         ← F5 wrapper (done state)
                        ┌────────────────────────────────────────┐
                        │ ▓ mock doc   Artifacts                  │   ← ArtifactCard (done)
                        │             maths-term2.md              │
                        │ 22/05/2026 10:25                   [ 👁 ]│   ← click → workspace pane
                        └────────────────────────────────────────┘

                        I reviewed the maths marksheet...
                        3 rows need correction...                    ← Markdown

                        ┌──────────────────────────────────────┐
                        │ ⚠ Marksheet validation required      │     ← ActionBar (HITL)
                        │   [✓ Validate]  [Skip▾]               │     ← persisted data-awaitValidation
                        └──────────────────────────────────────┘


                                                                              ┌──────────
                                                                              │ ⚠ Rate    ← Toaster
                                                                              │   limit   (bottom-left,
                                                                              │   soon    post-F3)
                                                                              └──────────
```

---

## Visual element → Fix/Spec mapping (cheat sheet for smoke testing)

| What you see | Where it comes from | Spec / Fix |
|---|---|---|
| `[ claude-sonnet-4.5 ▾ ]   [ 24k/200k ]` | `chat-header.svelte` after F2 | §4.3 |
| (no activity icon) | `ActivityPopover` mount removed | F2 |
| TODO comment about background-tasks in `chat-header.svelte` source | Preserved files note | F2 / Decision D6 |
| `▾ Thinking...` collapsible | existing `Reasoning` (prompt-kit) | unchanged |
| `▾ Thinking completed ▾` collapsible | new parent wrapper in `chat.svelte` | §4.6 routing rule |
| Gradient + ✨ + skeleton inside "Thinking completed" | `ArtifactCard` loading state | §4.6 / F5 |
| Dark doc mock + title + filename + timestamp + 👁 | `ArtifactCard` done state | §4.6 / F5 |
| `▾ Tools (N)` chevron group | new `chat/ToolGroup.svelte` | §4.5 / F4 |
| Per-tool `ToolHeader` / `ToolInput` / `ToolOutput` | existing `tool-message.svelte` | unchanged (wrapper stripped) |
| 📋 copy button next to "View raw output" | F4b on `tool-message.svelte` | §4.5 / F4b |
| `[ Validate ] [ Skip ▾ ]` floating above composer | existing `ActionBar` | unchanged (HITL persisted) |
| `⚠ Auto-fix couldn't resolve... [ Edit marksheet ]` | `ErrorAlert` + new variant | §4.7 / F6 |
| Toaster bottom-left | `+layout.svelte` position | §4.4 / F3 |
| No PDF modal anywhere | `<PreviewModal />` removed | §4.2 / F1 |
| `ContextUsageIndicator` gone from composer footer | composer `ChatComposer.svelte` line ~1137 stripped | F2 |

---

## Lifecycle stages (mapped to spec sections)

1. **Idle** — header + composer + toaster mounted; no conversation. (spec §4.1 chrome)
2. **User sends** — `Message` with `variant="flat"` and accent bg; `MessageAction` shows copy + edit. (unchanged)
3. **Reasoning** — `Reasoning` collapsible; Markdown inside. (existing)
4. **Tool call (input)** — `ToolGroup` renders with N=1; per-tool `ToolHeader` shows state `input-available`; `ToolInput` shows JSON. (F4)
5. **Tool call (output)** — per-tool state flips to `output-available`; structured fields render via snippet dispatch (`validateClassResults`, `upsertStudentResult`, `defaultTool`). (existing tool-message logic; wrapper stripped in F4)
6. **Artifact streaming** — parent wrapper `▾ Thinking completed` renders; `ArtifactCard` shows gradient + sparkle + skeleton. (F5 loading state)
7. **Artifact done** — `ArtifactCard` flips to dark doc mock + title + filename + timestamp; eye button active. (F5 done state)
8. **Eye click** — `createEventDispatcher` fires `chat:openArtifact`; parent opens workspace pane. (F5 / D3)
9. **Loop continues** — additional `tool-*` parts aggregate into the same `ToolGroup`; count rises to N. (F4)
10. **Final text** — assistant's text part renders via Markdown; `MessageAction` shows copy + retry. (unchanged)
11. **HITL gate** — `awaitValidation` data part surfaces; `ActionBar` mounts above composer with [Validate] / [Skip▾]. (existing; persisted via `writeDataPart`)
12. **Resume / cancel** — `[Validate]` → `resumeWorkflow(id, dropdownId)`; `[Skip]` → `cancelValidation()` (server-side `run.cancel()`). (existing)
13. **Error recovery** — `categorizeAIError` returns one of 6 new variants; `ErrorAlert` shows title + message + action button. (F6)
14. **Toast** — system toasts (rate limit, auth) render at bottom-left. (F3)
15. **No PDF modal** — at no point does `<PreviewModal />` appear. (F1)

This lifecycle is the order in which smoke tests should run during chunk verification. Each numbered stage maps to a checklist item in `.superpowers/plans/2026-07-08-chat-agentic-ui-checklist.md`.
