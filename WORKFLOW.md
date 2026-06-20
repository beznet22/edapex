Can you confirm that the Final architecture diagram (with the three decisions) was also fully implemented? See bellow


<think>

The user has answered all three questions. Let me now provide the final consolidated plan, incorporating these final decisions:

1. **Auto-save trigger**: 1s debounce, on every keystroke. The ValidateFab shows in 'revalidate' mode as soon as the user starts typing post-commit.

2. **Re-validate flow**: Yes, the validate-marksheet tool should re-derive the JSON from the edited markdown (Model B). This means the tool ALWAYS re-derives, not just on first call. The correctedMarkdown is always passed.

3. **Auto-fix output**: Re-stream with full new markdown (re-rendered from the fixed JSON).

These decisions are mostly aligned with my recommendations. Let me make sure the plan reflects them clearly and finalize the response.

The user has given all the answers needed. I should now provide a final, complete plan that:
1. Integrates all the decisions
2. Is focused on what was changed/refined
3. Is not too long (the user has been through several iterations)

I should:
- Acknowledge the final decisions
- Update the relevant sections
- Maybe add a quick implementation order
- End with a summary of what to build

Let me write this in plan mode (read-only, no edits).

I need to be careful about length. The user has been through many rounds. Let me make this final response focused on:
1. The 3 final decisions
2. Updated sections (auto-save debounce, validate-marksheet always re-derives, auto-fix re-streams)
3. A final implementation order with the consolidated file list
4. A summary

I'll keep it tight and not repeat prior context.
</think>


Final decisions baked in. The plan is now complete. Below is the deltas-only consolidation.

---

# Final Decisions

| Decision | Value |
|---|---|
| Auto-save post-commit | 1s debounce, on every keystroke. ValidateFab flips to `revalidate` the moment `chat.editContent !== null`. |
| Re-validate flow | `validate-marksheet` ALWAYS re-derives the JSON from the edited markdown (Model B, ~1-2s). The JSON on disk is always derived from the current markdown. There is no "read from disk" path. |
| Auto-fix output | Re-stream with full new markdown (re-rendered from the fixed JSON). Editor receives the new content via the same `data-createDocument` lifecycle. |

## 1. Auto-save debounce (1s)

`src/lib/components/workspace/editor-canvas.svelte`:

```ts
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

$effect(() => {
  if (!streamContent || streaming) return;  // no auto-save while streaming
  const md = textContent;
  if (md == null) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    if (!artifactId) return;
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = chat.chatData?.threadId
      ? `exams/examType-${chat.threadData.examTypeId}/${safeTitle}.md`
      : null;
    if (!path) return;
    void fetch(`/api/file/${path}`, {
      method: 'PUT',
      body: new Blob([md], { type: 'text/markdown' })
    });
  }, 1000);
});
```

`WysiwygEditor.svelte`'s `onUpdate` continues to fire on every keystroke. The `editor-canvas.svelte` $effect debounces the PUT.

`chat.editContent` is updated on every keystroke (no debounce on the in-memory state — only on the network write). The ValidateFab's mode is derived from `chat.editContent != null`, so it flips to `revalidate` immediately on first keystroke.

## 2. `validate-marksheet` always re-derives

The tool's `inputSchema` requires `correctedMarkdown: string` (no longer optional). The skill is updated to read the latest markdown from the workspace (`exams/examType-<id>/<artifactId>.md`) and pass it.

```ts
// src/lib/server/mastra/tools/marksheet-tools.ts
export const validateMarksheetTool = createTool({
  id: 'validate-marksheet',
  description: 'Re-derive the JSON from the current markdown via the document agent, then run safeParse.',
  inputSchema: z.object({
    documentId: z.string(),
    correctedMarkdown: z.string()
  }),
  outputSchema: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), errors: z.array(...) })
  ]),
  execute: async (input, context) => {
    const tenant = context.tenantContext as TenantContext;
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: buildWorkspaceRequestContext(tenant) as never });

    // ALWAYS re-derive the JSON from the markdown (Model B)
    const docAgent = mastra.getAgent('document');
    const { object: json } = await docAgent.generate(
      `Re-parse the following academic markdown into the structured ResultOutput JSON. Preserve every fact exactly. Return only the JSON.\n\n${input.correctedMarkdown}`,
      { structuredOutput: { schema: resultOutputSchema } }
    );
    await fs.writeFile(`extracted/${input.documentId}.json`, JSON.stringify(json, null, 2), { recursive: true, overwrite: true });

    const result = resultOutputSchema.safeParse(json);
    if (result.success) return { ok: true as const };
    return {
      ok: false as const,
      errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message, code: i.code }))
    };
  }
});
```

The marksheet skill is updated:

```markdown
## 4. Call validate-marksheet

Call `validate-marksheet` with:
- `documentId`: the current document id
- `correctedMarkdown`: read the latest markdown from `exams/examType-<examTypeId>/<safeTitle>.md` (or the workspace equivalent)

The tool always re-derives the JSON from the current markdown. This means:
- First-time validation: the markdown is the freshly streamed version.
- Re-validation after edits: the markdown is the user's edited version.
- The JSON on disk is overwritten with the re-derived version on every validate.
```

The agent's prompt includes a hint about where to read the markdown from disk:

```ts
async function buildAssistantPrompt({ tenant, lastCommittedArtifactId, lastValidationErrors }) {
  const safeTitle = (lastCommittedArtifactId ?? '').replace(/^artifact-/, '');
  const markdownPath = `exams/examType-${tenant.examTypeId}/${safeTitle}.md`;
  // ...
  return [
    'You are about to validate a marksheet.',
    `Read the latest markdown from the workspace at: ${markdownPath}`,
    'Then call validate-marksheet with { documentId, correctedMarkdown: <contents> }.',
    ...
  ].join('\n');
}
```

## 3. Auto-fix re-streams full new markdown

`auto-fix-marksheet` is unchanged from the prior plan: it applies mechanical fixes to the JSON, writes the updated JSON to `extracted/<id>.json`, then re-runs `documentAgent.stream` on the fixed JSON and emits `data-createDocument` parts (processing → streaming → success). The editor receives the full new markdown via the streaming parts. The user sees the fixed version, with the auto-applied regions briefly highlighted in yellow (3s fade).

The marksheet skill's step 5 is updated:

```markdown
## 5. Handle the result

- **ok: true**: go to step 6.
- **ok: false**: call `auto-fix-marksheet` with `{ documentId, errors, currentMarkdown }`. The tool:
  - Calls the document agent to patch the JSON at ≥80% confidence.
  - Writes the patched JSON to `extracted/<documentId>.json`.
  - Re-renders the markdown from the patched JSON via `documentAgent.stream`.
  - Emits `data-createDocument { processing, streaming, success }` parts (the editor receives the new full markdown).
  - The auto-applied regions briefly highlight in the editor (yellow, 3s fade).
  - Returns `{ appliedFixes, unresolvedErrors, reStreamedArtifactId }`.

If `appliedFixes.length > 0`, tell the teacher: "I auto-fixed N issues. Re-review the editor and click **Validate** when ready, or edit and re-validate."

If `unresolvedErrors.length > 0`, list them for the teacher.
```

The agent's flow naturally handles the "all errors auto-fixed" case: if the re-streamed document's JSON passes safeParse (when the user clicks Validate again), commit. The skill's step 4-5 loop runs until either success or the user gives up.

## 4. Tool re-derivation timing (the 1-2s pause)

`validate-marksheet`'s `execute` does an LLM call. While it runs, the agent is in the middle of streaming. The user sees:

1. Teacher clicks Validate → `chat:requestValidation` event → chat composer sends `/validate` message.
2. New chat turn. The assistant step starts streaming. The agent says: "Validating the marksheet…" (text-delta).
3. Agent calls `validate-marksheet`. Tool runs (1-2s). During this, the agent is awaiting the tool result.
4. Tool returns `{ ok: true }` or `{ ok: false, errors }`. The agent continues streaming its response.

There is no `data-validationResult` part emitted by the tool itself (per the prior refinement — validation errors are explained in chat by the agent, not via a part). The ValidateFab stays in `validating` mode until the tool returns. The editor stays `editable: false` while the workflow step is in flight.

The `pendingValidationArtifactId` is cleared when:
- The tool returns success: agent calls `commit-marksheet` next → eventually `chat.lastCommittedArtifactId = artifactId` is set by the `data-committed` handler.
- The tool returns failure: agent calls `auto-fix-marksheet` next. While auto-fix runs, `pendingValidationArtifactId` is still set. After auto-fix returns and the re-stream emits `data-createDocument { success }`, the validation is "done" — but it didn't succeed. The agent may call `validate-marksheet` again (loop) or wait for the user.

To handle the "validation done, user must re-validate" state cleanly, we add a new chat-context field:

```ts
lastValidationOutcome: { artifactId: string; status: 'success' | 'errors'; errors?: ValidationError[] } | null = null;
```

The `validate-marksheet` tool's output is captured by the agent, and the agent dispatches a custom event (or the route handler does it server-side via a tool wrapper):

```ts
// In the tool wrapper for validate-marksheet
const wrappedExecute = async (input, ctx) => {
  const result = await originalExecute(input, ctx);
  await ctx.writer?.write({
    type: 'data-validationResult',
    id: `vr-${input.artifactId ?? input.documentId}`,
    data: {
      artifactId: input.artifactId ?? `artifact-${input.documentId}`,
      status: result.ok ? 'success' : 'errors',
      errorCount: result.ok ? undefined : result.errors.length
    }
  });
  return result;
};
```

`data-validationResult` is rendered in `chat.svelte` as a compact inline message ("✓ Validation passed" or "✗ 3 validation errors — see the assistant's explanation"). The ValidateFab is the user-facing action; the chat message is a hint.

The `lastValidationOutcome` is set on `data-validationResult` and consumed by the ValidateFab mode derivation. The FAB transitions: `validating` → (FAB hidden, header shows ✓ "Saved" on commit) OR `validating` → `revalidate` (if user must re-validate after auto-fix).

## 5. Final architecture diagram (with the three decisions)

```
TEACHER FLOW (per turn):

  Types `/marksheet <student-name>` (or just `/marksheet` if files already uploaded)
       │
       ▼
  ChatComposer sends message
       │
       ▼
  POST /api/chat
       │
       ▼
  chatWorkflow.createRunAsync → runId
       │
       ▼
  handleWorkflowStream (title + assistant in parallel)
       │
       ▼
  createUIMessageStream prepends data-runInfo
       │
       ▼
  Client receives stream. data-runInfo sets chat.activeRunId.
       │
       ▼
  Assistant agent loads marksheet skill. Tools: 5 marksheet + 3 general.
       │
       │ Agent says (text-delta): "Processing the marksheet."
       │
       ▼
  Agent calls format-marksheet-document → emits data-createDocument { processing }
       │
       ▼
  Stream begins. Agent calls documentAgent.stream.
       │
       │ For each chunk: data-createDocument { streaming, content }
       │ Client: ShimmerArtifactCard in chat + editor opens with read-only <Markdown>
       │
       ▼
  Stream ends. data-createDocument { success, content }.
       │ Client: <Markdown> unmounts, <WysiwygEditor> mounts with setContent.
       │         ValidateFab = validate. Editor editable = true.
       │
       ▼
  Agent says: "I've prepared the marksheet. Click Validate when ready."
       │
       ▼
  TEACHER EDITS (optional). Every keystroke:
       │ - WysiwygEditor onUpdate → chat.editContent
       │ - 1s debounce → PUT /api/file/exams/examType-<id>/<title>.md
       │ - ValidateFab mode flips to revalidate (chat.editContent != null)
       │
       ▼
  TEACHER CLICKS Validate
       │
       │ chat:requestValidation event → ChatComposer sends `/validate`
       │
       ▼
  New chat turn. chatWorkflow creates new run.
       │
       │ Agent reads markdown from workspace, calls validate-marksheet.
       │ Tool ALWAYS re-derives JSON (Model B, 1-2s). Writes JSON to extracted/<id>.json.
       │ Tool returns { ok: true } or { ok: false, errors }.
       │ Tool wrapper emits data-validationResult { success | errors }.
       │ Client: ValidateFab = validating → (next state).
       │
       ├─── ok: true ──►
       │     │
       │     │ Agent calls commit-marksheet. Tool writes to DB, removes from manifest.
       │     │ Tool emits data-committed { artifactId, recordId, studentName }.
       │     │ Client: ValidateFab = committed (hidden). Header ✓ "Saved (record #N)".
       │     │         Editor stays editable. Toast: "Want to /generate or /publish?"
       │     │ End of turn.
       │
       └─── ok: false ──►
             │
             │ Agent calls auto-fix-marksheet with { documentId, errors, currentMarkdown }.
             │ Tool patches JSON at ≥80% confidence, writes to extracted/<id>.json.
             │ Tool re-renders markdown from patched JSON via documentAgent.stream.
             │ Emits data-createDocument { processing, streaming, success } (re-stream).
             │ Client: <Markdown> mounts (replaces WysiwygEditor), then <WysiwygEditor> mounts again
             │         with the new content. Yellow highlight fades over 3s.
             │         ValidateFab = validate (re-evaluate).
             │ Agent says: "I auto-fixed N issues. Re-review and click Validate, or edit and re-validate."
             │
             ▼
       TEACHER CLICKS Validate AGAIN (or edits + clicks)
             │
             ▼
       Loop back to validate-marksheet with the new markdown.
```

## 6. Final implementation order

This replaces the prior plan's §15. Each step is a single shippable PR.

| # | PR | Scope | Risk |
|---|---|---|---|
| 1 | `feat: mistral-structured-output` | Add `processStructured` to `MistralOcrService`, `OcrWorkspaceStore.writeNormalizedJson`/`readNormalizedJson`, `manifest-store.ts`. New files only. | Low |
| 2 | `feat: workspace-scope-guard` | Add `assertPathAgentVisible`, wire into `routes/api/file/[...path]/+server.ts`. Tests for the guard. | Low |
| 3 | `feat: marksheet-and-report-tools` | Build `marksheet-tools.ts` (5 tools), `report-pdf-tools.ts` (2 tools), `choose-document.ts`. Build `marksheet.skill.md` and `report.skill.md`. Update `skill-tools.ts:42-49`. | Medium |
| 4 | `feat: new-upload-route` | Rewrite `POST /api/uploads` to call `processStructured` + manifest writers. Update `routes/api/chat/start-with-files/+server.ts`. | Medium |
| 5 | `feat: slim-chat-workflow` | Rewrite `chatWorkflow` to be a parallel of `[titleStep, assistantStep]`. Delete `classifyAndStreamWorkflow`, `classifyStep`, `streamDocumentStep`, `collapseStep`, `hitlVerifyStep`, `extractFileItemsStep`. Update `/api/chat` to use `createRunAsync` + `createUIMessageStream` for `data-runInfo` part. | Medium |
| 6 | `feat: editor-lifecycle` | Add `editable` prop to `WysiwygEditor`, add `{#key artifactId}` in `editor-canvas`, add `ValidateFab.svelte`, add auto-save debounce. Wire `chat:requestValidation` event in `ChatComposer`. | Medium |
| 7 | `feat: new-data-parts` | Add `runInfo`, `createDocument`, `generatePDF`, `validationResult`, `validationErrors`, `committed`, `awaitValidation`, `noDocuments` parts to `xDataPart`. Add handlers in `thread-data.svelte.ts`. Render in `chat.svelte`. | Medium |
| 8 | `feat: chat-composer-no-autoprocess` | Rewrite `handleOcrChange` in `ChatComposer.svelte` to NOT auto-process. Remove `ocrFiles` state. Update `inputDisabled`. | Low |
| 9 | `refactor: cutover` (big-bang PR) | Delete the 4 workflows + 4 tools + 4 routes + 2 workers + 2 components (per §12.3). Update all references. Deploy to staging. | High |
| 10 | `docs: chat-workflow-architecture` | New doc replacing old extract/generate/validate/publish runbooks. State machine diagram, slash-command → skill → tool map, deployment notes. | Low |

## 7. Final file list (consolidated)

### New files (12)

```
src/lib/server/mastra/tools/marksheet-tools.ts
src/lib/server/mastra/tools/report-pdf-tools.ts
src/lib/server/mastra/tools/choose-document.ts
src/lib/server/mastra/skills/marksheet.skill.md
src/lib/server/mastra/skills/report.skill.md
src/lib/server/mastra/storage/ocr/manifest-store.ts
src/lib/server/mastra/storage/ocr/extracted-cleanup.ts
src/lib/server/mastra/storage/ocr/content-addressed-blob.ts
src/lib/server/workspace/scope.ts
src/lib/components/editor/ValidateFab.svelte
```

### Edits (18)

```
src/lib/server/mastra/workflows/chat.ts
src/lib/server/mastra/index.ts
src/lib/server/mastra/agents/assistant.ts
src/lib/server/mastra/tools/index.ts
src/lib/server/mastra/skill-tools.ts
src/lib/server/mastra/storage/ocr/ocr-workspace-store.ts
src/lib/server/service/mistral-ocr.service.ts
src/lib/server/service/ocr-batch.service.ts
src/lib/server/service/assessment-ocr.service.ts
src/lib/server/service/assessment.service.ts
src/lib/types/chat-types.ts
src/lib/context/chat-context.svelte.ts
src/lib/context/thread-data.svelte.ts
src/lib/components/chat.svelte
src/lib/components/ChatComposer.svelte
src/lib/components/SharedChatView.svelte
src/lib/components/workspace/editor-canvas.svelte
src/lib/components/editor/WysiwygEditor.svelte
src/routes/api/chat/+server.ts
src/routes/api/uploads/+server.ts
src/routes/api/file/[...path]/+server.ts
```

### Files to delete (14)

```
src/lib/server/mastra/workflows/extraction.ts
src/lib/server/mastra/workflows/generate.ts
src/lib/server/mastra/workflows/validation.ts
src/lib/server/mastra/workflows/publish.ts
src/lib/server/mastra/tools/workflow-tools.ts
src/lib/server/mastra/agents/result-mapper.ts
src/lib/chat/upload-worker.ts
src/lib/chat/extraction-worker.ts
src/routes/api/file/ocr/+server.ts
src/routes/api/file/ocr/batch/results/+server.ts
src/routes/api/uploads/[...fileId]/+server.ts
src/routes/api/uploads/[...fileId]/approve/+server.ts
src/lib/components/drop-zone.svelte
src/lib/components/file-drop-zone/
```

## 8. Verification gates (per PR)

| Gate | Command |
|---|---|
| Type check | `pnpm run svelte-check --workspace path/to/changed/file.svelte` |
| Lint | `pnpm run lint path/to/changed/file.ts` |
| Unit test | `pnpm test path/to/changed/file.test.ts` |
| Manual smoke (cutover PR only) | Upload a marksheet via chat composer → type `/marksheet` → confirm shimmer appears in chat + editor opens with Markdown → streams → swaps to WysiwygEditor → click Validate → validate (success path) → DB row written → editor stays open with ✓ header → type `/generate <student>` → PDF shimmer appears + editor opens with PDF preview. Repeat with an error case. |

## 9. Risks specific to the new architecture

| Risk | Mitigation |
|---|---|
| The `validate-marksheet` tool's 1-2s re-derivation may timeout on long markdowns. | The `streamWithAutoRetry` helper already handles 429/5xx. We add a 30s timeout for the LLM call. If timeout, the tool returns `{ ok: false, errors: [{ path: 'general', message: 'Validation timed out. Try again.', code: 'TIMEOUT' }] }`. |
| The agent's "collect missing args" loop for `/generate` and `/publish` may ask the user too many questions or not enough. | The skill is explicit: "Confirm with the teacher once before calling." The agent is instructed to be concise. The `/generate` and `/publish` skills include the explicit confirmation step. |
| The `data-runInfo` part arrives AFTER the user has already seen a `data-createDocument` part (if the assistant's first action is a tool call). | `createUIMessageStream` with the `writer.write(data-runInfo)` first guarantees the runInfo is the first part the client sees. The handler in `ThreadData` stores `activeRunId` immediately. |
| Multiple files attached with `/marksheet`: the user has to disambiguate before the workflow proceeds. | The skill is explicit: "If multiple, call `choose-document` only after asking the teacher which one." The agent loops until the teacher picks. |
| After commit, the user edits and clicks Re-validate; the validate tool re-derives the JSON from the edited markdown. If the LLM mis-parses the user's edit, the new JSON may be wrong. | The user sees the JSON in the chat as part of the assistant's explanation ("Re-parsing your edits. Here's the JSON I derived. Click Validate again to commit, or correct me."). The user can review the JSON in the chat before the next Re-validate. |
| The `editable: false` lock during validation may be jarring if the user is mid-typing. | The lock takes effect when the user clicks Validate, not on first keystroke. The user is not surprised. |
| `auto-fix-marksheet` re-streaming may not match the user's manual edits (e.g., the user fixed field A, the auto-fix changes field B; the re-stream replaces both). | The re-stream only changes the auto-fixed fields. The user's manual edits to other fields are preserved in the workspace, but the new full markdown from the re-stream is the source of truth. The agent explains in chat what was changed. The user can re-edit if needed. |

---

That closes the plan. All decisions are integrated. The architecture is: **one chat workflow + slash commands load skills + skills load tool groups + tools are stateless and emit data parts to the stream + client has a single state machine driven by those parts**. The editor is a WYSIWYG canvas that swaps from a read-only `<Markdown>` preview during streaming to an interactive WysiwygEditor on success, with `editable` controlled by validation state, `editable: true` post-commit, and 1s debounced auto-save to the workspace. The ValidateFab is the single user-facing action: `validate` (initial), `validating` (in flight), `revalidate` (after user edits), or hidden (`committed`).

Ready to execute when you are. Just confirm which PR to start with.

<think>

The user confirmed all three recommended options. Let me now provide a clean final summary of the MVP parent operations plan. I should:

1. List the 13 tools (5 existing + 8 new)
2. Describe the multi-child flow
3. Describe the teacher-as-parent flow
4. Note the bulk operation policy
5. Note the memory policy
6. List the file changes needed

I should be focused and not repeat the entire plan. Just the MVP parent operations section.

I'm in plan mode, so I just present the plan. No edits.

Let me write a concise summary.
</think>
# MVP Parent Operations — Final

All three decisions baked in. The MVP parent skill is the **13 read-only tools** below, with **confirm-before-bulk** policy and **persistent per-parent memory**.

## 1. The 13 parent tools

| # | Tool id | Per | Tables | MVP |
|---|---|---|---|---|
| 1 | `list-my-children` | parent | `smStudents` | NEW |
| 2 | `view-child-result` | child | `smResultStores`, `smExamTypes` | existing |
| 3 | `download-child-pdf` | child | workspace | existing |
| 4 | `child-attendance` | child | `smStudentAttendances` | existing |
| 5 | `child-ranking` | child | `examMeritPositions` | existing |
| 6 | `child-performance-trend` | child | `smResultStores` (history) | existing |
| 7 | `view-child-timetable` | child | `smClassRoutines`, `smSubjects`, `smStaffs` | NEW |
| 8 | `view-child-homework` | child | `smHomeworks`, `smHomeworkStudents`, `smSubjects` | NEW |
| 9 | `view-child-exam-schedule` | child | `smExamSchedules`, `smExams`, `smSubjects`, `smStaffs` | NEW |
| 10 | `view-child-fees` | child | `smFeesAssigns`, `smFeesPayments`, `smFeesTypes` | NEW |
| 11 | `view-notice-board` | parent | `smNoticeBoards` | NEW |
| 12 | `view-school-events` | parent | `smEvents` | NEW |
| 13 | `view-holidays` | parent | `smHolidays` | NEW |

Plus the general tools from the parent skill: `search-school-directory`, `get-academic-context`, `choose-document`.

## 2. Multi-child flow

When the parent says "my kid" without naming one:

1. Agent calls `listMyChildrenTool` (one tool call, fast).
2. If 1 child, proceeds directly to the per-child tool.
3. If 2+ children, the bot replies: "You have 3 kids: Alice, Bob, Carol. For which?"
4. Parent names the child.
5. Agent resolves `studentId` (via `search-school-directory` if needed) and calls the per-child tool.

## 3. Bulk policy

When the parent says "all" or "my kids" (plural, ambiguous):

1. Agent calls `listMyChildrenTool` and shows the count.
2. Agent replies: "You have 3 kids. Fetching all results now — this may take a moment. Confirm?"
3. If confirmed, agent makes 3 per-child tool calls in sequence (Telegram has no parallel calls; this is a limitation).
4. The results are summarized in a single Markdown response, not three separate replies.

## 4. Teacher-as-parent flow

The bot resolves by `smParents.id`, not by `users.id`. A teacher who is also a parent:

- Has `users.id` → `smStaffs` (staff role) and `users.id` → `smParents` (parent role)
- Binds their `telegram_chat_id` to `smParents.telegram_chat_id` via the same magic link flow
- Their children are `smStudents` rows with `parentId = smParents.id`

The parent tools use only `smParents.id` and `smStudents.parentId`. The teacher's `smStaffs` row is irrelevant for parent queries. The agent's `RequestContext` is `forcedToolGroup: 'parent'`, not the staff group.

If the same person sends a message in two Telegram accounts (e.g., personal + work), each Telegram `chat_id` is a separate binding. The bot supports one binding per `smParents` row.

## 5. Persistent per-parent memory

The `telegram-gateway.ts` passes:

```ts
memory: {
  thread: `telegram-parent-${parentId}`,
  resource: `parent-${parentId}`
}
```

The assistant's `Memory` instance is shared across web and Telegram. The thread id namespace (`telegram-parent-*`) keeps parent conversations separate from the web chat conversations. The memory persists:

- Last kid discussed
- Recent questions
- Preferred output format (e.g., "always show me the table")
- Pending follow-ups

## 6. Updated `parent.skill.md`

```markdown
---
name: parent
description: Read-only access for parents to their children's school information via Telegram.
tools:
  - list-my-children
  - view-child-result
  - download-child-pdf
  - child-attendance
  - child-ranking
  - child-performance-trend
  - view-child-timetable
  - view-child-homework
  - view-child-exam-schedule
  - view-child-fees
  - view-notice-board
  - view-school-events
  - view-holidays
  - search-school-directory
  - get-academic-context
---

# Parent Bot

You serve parents who are messaging the school's Telegram bot. The bot binds a parent's Telegram chat to their `smParents` record via a magic-link flow. You have **read-only** access to their children's school data.

## Resolving the child

If the parent's request is about a specific child but they didn't name them, call `list-my-children` first.

- **1 child**: proceed directly.
- **2+ children**: list them and ask the parent to pick one.
- **0 children**: tell the parent they have no active students in the system; suggest contacting the school.

## Bulk operations

If the parent asks about "all my kids" or "everyone", confirm first: "You have N kids: [names]. Fetch all?" Then make the per-child tool calls sequentially and return a single summarized response.

## Read-only constraint

You CANNOT modify student data, fees, or any school records. If a parent asks to pay fees, change details, or contact a teacher, suggest they use the web portal or call the school.

## Telegram output

- Use Markdown (Telegram supports basic Markdown).
- Keep responses under 4000 chars; chunk if longer.
- For per-child results, use a compact format:
  ```
  Alice (P5A, Term 1):
  - Total: 425/500 (85%)
  - Rank: 3/30
  - Top subject: Math (95/100)
  ```
- For tabular data, use Telegram's code block (```) for alignment.

## Available tools

See `tools:` in the frontmatter. All tools check `assertParentOwnsStudent` before returning data.
```

## 7. The 8 new tools — input/output schemas

```ts
// listMyChildrenTool
input: {}
output: {
  children: Array<{
    studentId: number;
    fullName: string;
    admissionNo: number | null;
    classId: number | null;
    className: string | null;
    sectionId: number | null;
    sectionName: string | null;
    rollNo: number | null;
    studentPhoto: string | null;
  }>
}

// viewChildTimetableTool
input: { studentId: number; weekStartDate?: string; }
output: {
  studentId: number;
  className: string;
  sectionName: string;
  weekSchedule: {
    monday: Array<{ startTime: string; endTime: string; subject: string; teacherName: string | null; roomId: number | null }>;
    tuesday: Array<...>;
    // ... wednesday, thursday, friday, saturday, sunday
  };
}

// viewChildHomeworkTool
input: { studentId: number; filter?: 'upcoming' | 'past' | 'all' }
output: {
  studentId: number;
  homework: Array<{
    homeworkId: number;
    subjectName: string;
    homeworkDate: string;
    submissionDate: string;
    description: string;
    fileUrl: string | null;
    completeStatus: 'complete' | 'incomplete' | 'partial' | string;
    teacherComments: string | null;
    marks: string | null;
  }>;
}

// viewChildExamScheduleTool
input: { studentId: number; fromDate?: string; toDate?: string }
output: {
  studentId: number;
  exams: Array<{
    examId: number;
    examTypeTitle: string;
    subjectName: string;
    date: string;
    startTime: string;
    endTime: string;
    roomId: number | null;
    teacherName: string | null;
  }>;
}

// viewChildFeesTool
input: { studentId: number; }
output: {
  studentId: number;
  totalAssigned: number;
  totalPaid: number;
  balance: number;
  items: Array<{
    feesType: string;
    feesGroup: string | null;
    amount: number;
    dueDate: string;
    paidAmount: number;
    paymentDate: string | null;
    paymentMode: string | null;
    status: 'paid' | 'partial' | 'unpaid';
  }>;
}

// viewNoticeBoardTool
input: { limit?: number }
output: {
  notices: Array<{
    noticeId: number;
    title: string;
    message: string;
    noticeDate: string;
    publishOn: string;
    informTo: string | null;
  }>;
}

// viewSchoolEventsTool
input: { limit?: number; fromDate?: string }
output: {
  events: Array<{
    eventId: number;
    title: string;
    fromDate: string;
    toDate: string;
    location: string | null;
    description: string | null;
    url: string | null;
    imageUrl: string | null;
  }>;
}

// viewHolidaysTool
input: { limit?: number; year?: number }
output: {
  holidays: Array<{
    holidayId: number;
    name: string;
    fromDate: string;
    toDate: string;
    description: string | null;
  }>;
}
```

## 8. Permission gate

A single helper at `src/lib/server/mastra/tools/parent-permissions.ts`:

```ts
export function assertParentOwnsStudent(
  parentContext: ParentContext,
  studentId: number
): void {
  if (!parentContext.childIds.includes(studentId)) {
    throw new ForbiddenError(
      `Parent ${parentContext.parentId} does not have access to student ${studentId}.`
    );
  }
}
```

`parentContext.childIds` is resolved at link time (cached) by querying `smStudents where parentId = parentContext.parentId AND activeStatus = 1`. The parent gateway caches this in libSQL.

## 9. File changes (concrete)

### New files

| Path | Purpose |
|---|---|
| `src/lib/server/mastra/tools/parent-tools.ts` | All 8 new tools + the existing 5 (consolidated, ~400 lines) |
| `src/lib/server/mastra/skills/parent.skill.md` | Replaces whatever partial plan existed |
| `src/lib/server/mastra/tools/parent-permissions.ts` | `assertParentOwnsStudent` + `ForbiddenError` |
| `src/lib/server/telegram/bot.ts` | grammY bot instance |
| `src/lib/server/telegram/gateway.ts` | Wraps the assistant agent with `forcedToolGroup: 'parent'` |
| `src/lib/server/telegram/connect-tokens.ts` | Magic link token store (libSQL) |
| `src/lib/server/mastra/storage/libsql/migrations/<ts>_telegram.sql` | `connect_tokens` table, `smParents.telegram_chat_id` UNIQUE constraint, `telegram_phone`, `telegram_linked_at` columns |
| `src/routes/telegram/connect/+page.svelte` | Magic-link landing page |
| `src/routes/api/telegram/webhook/+server.ts` | Webhook receiver |
| `src/routes/api/parents/connect-telegram/+server.ts` | School portal "Connect Telegram" action |

### Edits

| Path | Change |
|---|---|
| `src/lib/server/mastra/skill-tools.ts:42-49` | No change (parent skill has no slash command; it's triggered by Telegram messages) |
| `src/lib/server/mastra/agents/assistant.ts:147-155` | Tool resolver already supports `forcedToolGroup` from `requestContext`. No change. |

## 10. What is NOT in MVP

Out of scope for the parent MVP (deferred to later phases):

- Submit fees via Telegram
- View transport/dormitory/library details
- View subject-specific attendance (`smSubjectAttendances`)
- View online exam results (`smStudentTakeOnlineExams`)
- View student documents / certificates / ID card
- Direct messaging to teachers
- Absence notifications (push)
- Two-way chat with the school
- Voice notes / photo uploads from parents

These can be added later as additional read-only tools or as new skills with `forcedToolGroup`.

---

That covers the MVP parent operations. The prior plan's Telegram section is now fleshed out with concrete tool definitions, the skill content, the permission model, and the file changes. Ready to integrate into the larger refactor when you are.

<think>


The user has confirmed all three decisions:
1. Ledger persisted to .planning/ledger.md
2. Up to 3 parallel subagents
3. Use the M- prefix taxonomy

Let me now write a focused summary that captures the orchestration strategy with these decisions baked in. I should not make any edits, just present the plan.

The user's original question was: "How will subagents be orchestrated to ensure two or more agents are not given the same work to avoid duplicate work."

I've already presented the full design. The user has now confirmed the operational parameters. Let me wrap up with a tight summary that:
1. Re-states the design with the three decisions baked in
2. Gives the actual `M-` prefix taxonomy for the marksheet refactor
3. Shows the first batch of subagent spawns
4. Notes the .planning/ledger.md file structure

I should be focused and not repeat too much. The user has been through several iterations and is now drilling into orchestration.

I'm in plan mode, so no edits. Just present the plan.
</think>
# Orchestration Strategy — Final

All three decisions baked in. Below is the operational contract I will follow when implementation begins.

## 1. The ledger file

**Location**: `docs/chat-workflow-refactor/ledger.md` (in the existing `docs/` directory; alongside the architecture doc).

**Format**: A Markdown table that the subagents read on entry.

**Owner**: I am the only writer. Subagents are read-only on this file.

**Initial state** (when implementation starts):

```markdown
# Chat Workflow Refactor — Subagent Task Ledger

Status legend: ⬜ pending | 🟡 in-flight | ✅ done | ❌ failed

| id | subject | scope (files allowed) | depends_on | status | notes |
|---|---|---|---|---|---|
```

Each subagent, before doing work, is given a prompt that includes:

```
1. Read docs/chat-workflow-refactor/ledger.md
2. Verify your task id is ⬜ or ❌ (re-decomposed)
3. Verify no row in 🟡 status has any of your files_allowed paths
4. If checks pass, proceed. If not, STOP and report.
```

After the subagent reports success, I verify the changes, then update the ledger row to ✅ (or ❌ with notes).

## 2. The M- prefix taxonomy for the marksheet refactor

| Code | Subject | Concept |
|---|---|---|
| M-EXP | "Codebase exploration" | Read-only research |
| M-SOCR | "Mistral structured output" | `processStructured`, `writeNormalizedJson` |
| M-WFL | "Slim chat workflow" | `workflows/chat.ts` (rewrite) |
| M-MT | "Marksheet tools" | `tools/marksheet-tools.ts` |
| M-RPT | "Report PDF tools" | `tools/report-pdf-tools.ts` |
| M-CDT | "Choose document tool" | `tools/choose-document.ts` |
| M-SKL | "Skills (marksheet + report)" | `skills/marksheet.skill.md`, `skills/report.skill.md` |
| M-DP | "Data parts + thread-data" | `chat-types.ts`, `thread-data.svelte.ts`, `chat.svelte` |
| M-CC | "Chat composer no-autoprocess" | `ChatComposer.svelte` |
| M-ED | "Editor lifecycle" | `editor-canvas.svelte`, `WysiwygEditor.svelte`, `ValidateFab.svelte` |
| M-PT | "Parent tools" | `tools/parent-tools.ts`, `skills/parent.skill.md` |
| M-TG | "Telegram gateway" | `telegram/bot.ts`, `telegram/gateway.ts`, migration, routes |
| M-CO | "Cutover" | delete old workflows/tools/routes/components |

**Rule**: no two rows share the same `M-` code. The code is the subject's identity.

## 3. The 3-subagent parallelism cap

At any time, at most 3 subagents are in-flight (🟡). I read each subagent's output, verify against the ledger and the file diff, and only then update the ledger to ✅ and spawn the next.

If a subagent's task is dependent on another that hasn't started yet, I either:
- Wait (don't spawn)
- Skip to a different independent microtask (only if one is un-blocked)
- Decompose the dependent task into smaller pieces (some of which may be un-blocked)

I never spawn a 4th to "speed things up" — the cap is hard.

## 4. The first batch of subagent spawns (when implementation starts)

These are the 3 parallel reads that kick off the work:

```
SUBAGENT 1 (M-EXP-01): "Map all call sites of /api/chat +resume, .suspend, .bail"
  files_allowed: (read-only)
  files_forbidden: (none)
  done: when report lists every call site with file:line

SUBAGENT 2 (M-EXP-02): "Map all readers/writers of extracted/<id>.json and manifest.json"
  files_allowed: (read-only)
  files_forbidden: (none)
  done: when report lists every reader/writer with file:line

SUBAGENT 3 (M-EXP-03): "Map all slash command handlers in skill-tools.ts and CommandDropdown"
  files_allowed: (read-only)
  files_forbidden: (none)
  done: when report lists every slash command, its skill, its tools, and the dropdown
```

All three are `explore` subagents. They cannot write. They never conflict. They run in parallel. Their outputs feed the next batch (the implementation microtasks).

## 5. The implementation microtask sequence (after the first batch)

The next batch (3 in parallel, all `general` subagents) becomes:

```
SUBAGENT 4 (M-SOCR): "Add processStructured to MistralOcrService + add manifest-store.ts + content-addressed-blob.ts + extracted-cleanup.ts"
  files_allowed:
    src/lib/server/service/mistral-ocr.service.ts
    src/lib/server/mastra/storage/ocr/manifest-store.ts (new)
    src/lib/server/mastra/storage/ocr/content-addressed-blob.ts (new)
    src/lib/server/mastra/storage/ocr/extracted-cleanup.ts (new)
  files_forbidden: everything else
  done: when:
    - processStructured exists, uses documentAnnotationFormat
    - manifest-store has readManifest/writeManifest/addDocument/removeDocument
    - content-addressed-blob has writeBlob/readBlob/deleteBlobIfOrphan
    - extracted-cleanup has removeCommittedDocument
    - pnpm run lint passes on all 4 files

SUBAGENT 5 (M-PT): "Build all 13 parent tools + parent skill + permissions helper"
  files_allowed:
    src/lib/server/mastra/tools/parent-tools.ts (new)
    src/lib/server/mastra/tools/parent-permissions.ts (new)
    src/lib/server/mastra/skills/parent.skill.md (new)
  files_forbidden: everything else
  done: when:
    - 13 tool exports present, each with inputSchema/outputSchema
    - parent.skill.md matches the 13-tool list
    - assertParentOwnsStudent throws ForbiddenError on mismatch
    - pnpm run lint passes on .ts files

SUBAGENT 6 (M-TG): "Build Telegram gateway: bot.ts, gateway.ts, connect-tokens.ts, migrations, routes"
  files_allowed:
    src/lib/server/telegram/bot.ts (new)
    src/lib/server/telegram/gateway.ts (new)
    src/lib/server/telegram/connect-tokens.ts (new)
    src/lib/server/mastra/storage/libsql/migrations/<ts>_telegram.sql (new)
    src/routes/telegram/connect/+page.svelte (new)
    src/routes/api/telegram/webhook/+server.ts (new)
    src/routes/api/parents/connect-telegram/+server.ts (new)
  files_forbidden: everything else
  done: when:
    - bot.ts creates grammY instance from env
    - gateway.ts wraps assistantAgent.stream with forcedToolGroup='parent'
    - migration adds connect_tokens table + smParents.telegram_* columns
    - magic link flow works end-to-end in test
```

These 3 are independent (no shared files), so they run in parallel. The cap is respected.

After all 3 complete, I:
- Read each subagent's changes
- Verify the `done` criteria
- Update the ledger to ✅
- Spawn the next batch (e.g., M-MT, M-RPT, M-CDT — all tools work)

## 6. The serial cutover

The final microtask (M-CO) is serial because it deletes code. It runs alone:

```
SUBAGENT N (M-CO): "Delete 4 workflows, 4 tools, 4 routes, 2 workers, 2 components; update remaining refs"
  files_allowed:
    (only DELETE operations; no new content)
    src/lib/server/mastra/workflows/{extraction,generate,validation,publish}.ts (delete)
    src/lib/server/mastra/tools/workflow-tools.ts (delete)
    src/lib/server/mastra/agents/result-mapper.ts (delete)
    src/lib/chat/{upload-worker,extraction-worker}.ts (delete)
    src/routes/api/file/ocr/+server.ts (delete)
    src/routes/api/file/ocr/batch/results/+server.ts (delete)
    src/routes/api/uploads/[...fileId]/+server.ts (delete)
    src/routes/api/uploads/[...fileId]/approve/+server.ts (delete)
    src/lib/components/drop-zone.svelte (delete)
    src/lib/components/file-drop-zone/ (delete directory)
  files_forbidden: any new file creation; any other file modification
  done: when:
    - All 14 files gone
    - pnpm run svelte-check passes
    - pnpm run lint passes
    - pnpm test passes
```

If M-CO needs to update an import elsewhere (because a deleted file was imported), I decompose: spawn a follow-up microtask with explicit "update imports in <file>" scope. The delete itself is bounded; the import updates are separate microtasks.

## 7. What I will NEVER do as the orchestrator

- Edit any file directly (`Write`, `Edit` tools)
- Run a build, install, or test command (`pnpm install`, `pnpm run build`)
- Create commits
- Make a subagent do two microtasks in one prompt
- Spawn a subagent without an explicit `files_allowed` / `files_forbidden` list
- Spawn more than 3 subagents in parallel
- Skip the verification step (read the diff, run the check, update the ledger)
- Spawn a subagent whose `M-` code is already 🟡 in the ledger
- Spawn a subagent whose `files_allowed` overlaps with a 🟡 row's `files_allowed`

## 8. What the user can monitor

The `docs/chat-workflow-refactor/ledger.md` file is the single source of truth. The user can `Read` it at any time to see:
- What's in flight (3 rows max)
- What's done
- What's pending
- What failed and needs re-decomposition

The `M-` code column maps to a known concept. A row marked `❌` with notes is a subagent that needs re-spawning with tighter constraints or further decomposition.

## 9. When this orchestration kicks in

I do NOT start spawning subagents yet. The user is still in plan mode, reviewing the architecture. The orchestration contract above will be applied when the user approves the plan and signals "start implementation."

At that point:
1. I `Read` the existing `docs/chat-workflow-refactor/` directory (if it exists) to confirm `ledger.md` is the right location.
2. I create `docs/chat-workflow-refactor/ledger.md` with the initial table (3 rows: M-EXP-01, M-EXP-02, M-EXP-03, all ⬜).
3. I spawn the 3 `explore` subagents in parallel.
4. I read their outputs and proceed per the contract.

---

The orchestration strategy is now fully defined. The plan is complete: storage layout, slash-command skills, marksheet/report tools, parent skill, editor lifecycle, and the orchestration contract for implementation.

Ready when you are. Just say "start" (or "begin M-EXP-01" to skip the exploration batch) and I'll initialize the ledger and spawn the first wave of subagents.



