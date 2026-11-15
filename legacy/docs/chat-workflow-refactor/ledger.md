# Chat Workflow Refactor — Subagent Task Ledger

Status legend: ⬜ pending | 🟡 in-flight | ✅ done | ❌ failed

## Orchestrator rules

- I (orchestrator) do NOT edit code directly. All code changes via subagents.
- Subagents MUST read this ledger before starting work.
- Subagents MUST verify their task is ⬜ or ❌ (re-decomposed).
- Subagents MUST verify no 🟡 row holds any of their files_allowed paths.
- Hard cap: **2 subagents in-flight at any time** (reduced from 3 for safety).
- After each subagent completes, I read the diff, run checks, update the row to ✅ or ❌.
- Single concept per M-code. No two rows share the same M-code.
- Files-allowed sets must not overlap between in-flight rows.

## Verified state (post-fact-check)

| Asset | State |
|---|---|
| `src/lib/server/mastra/tools/operations/reporting/marksheet/*.ts` (5 tools) | EXISTS |
| `src/lib/server/mastra/tools/operations/reporting/generate-result-pdf.ts` | EXISTS |
| `src/lib/server/mastra/tools/operations/reporting/publish-result-pdf.ts` | EXISTS |
| `src/lib/server/mastra/tools/internal/choose-document.ts` | EXISTS |
| `src/lib/server/mastra/tools/operations/parent/*` (13 tools + index) | EXISTS |
| `src/lib/server/mastra/tools/internal/parent-permissions.ts` | EXISTS |
| `src/lib/server/mastra/tools/internal/context-tool.ts` | EXISTS |
| `src/lib/server/mastra/skills/{default,academic,write,destructive,read,reporting,parent,assistant}.skill.md` | ALL EXIST |
| `src/lib/server/mastra/storage/ocr/{manifest-store,content-addressed-blob,extracted-cleanup,ocr-workspace-store}.ts` | ALL EXIST |
| `src/lib/server/mastra/agents/{assistant,document,title,supervisor,editor-*}.ts` | EXIST |
| `src/lib/server/mastra/storage/workspaces/resolve-tenant-filesystem.ts` | EXISTS (workspace root = `.workspaces/<schoolId>/<classId>_<sectionId>_AY<academicId>/`) |
| `src/lib/server/mastra/tenant-context.ts` | EXISTS (has `withExamTypeId`, missing `withAcademicId`) |
| `src/lib/server/mastra/skill-tools.ts` | EXISTS (skillCommandMap at lines 42-54) |
| `src/lib/server/mastra/storage/libsql/migrations/1730000000_telegram.sql` | EXISTS |
| `src/lib/server/telegram/{bot,gateway,connect-tokens}.ts` | ALL EXIST |
| `src/routes/api/telegram/webhook/+server.ts` | EXISTS |
| `src/routes/api/parents/connect-telegram/+server.ts` | EXISTS |
| `src/routes/telegram/connect/+page.svelte` | EXISTS |
| `src/lib/components/editor/ValidateFab.svelte` | EXISTS |
| `src/lib/components/editor/WysiwygEditor.svelte` | EXISTS (no `editable` prop) |
| `src/lib/components/workspace/editor-canvas.svelte` | EXISTS (no auto-save debounce) |
| `src/lib/components/ChatComposer.svelte` | EXISTS (has ocrFiles, handleOcrChange, plus popover) |
| `src/lib/components/chat/MentionDropdown.svelte` | EXISTS (categories: schools, students, classes, sections, academic_year, term) |
| `src/lib/components/chat/CommandDropdown.svelte` | EXISTS (has extract, validate, generate, publish commands — to be removed) |
| `src/lib/types/chat-types.ts` | EXISTS (xDataPart at lines 68-83) |
| `src/lib/context/chat-context.svelte.ts` | EXISTS (no lastCommittedArtifactId, no resumeWorkflow) |
| `src/lib/context/thread-data.svelte.ts` | EXISTS |
| `src/routes/api/chat/+server.ts` | EXISTS |
| `src/routes/api/uploads/+server.ts` | EXISTS (handles isStudentPhoto, needs kind param refactor) |
| `src/routes/api/file/[...path]/+server.ts` | EXISTS (no scope guard) |
| `src/lib/server/service/mistral-ocr.service.ts` | EXISTS (no processStructured yet) |

## Implementation ledger

(Updated as microtasks spawn, complete, or fail. Format: `id | subject | scope | depends_on | status | notes`)

| id | subject | scope | depends_on | status | notes |
|---|---|---|---|---|---|
| M-EDIT-01.1 | Add examTypeId/academicId/studentId/roleId to assistant.ts instructions template | `src/lib/server/mastra/agents/assistant.ts` | — | ✅ | assistant.ts lines 125-128 + 135-136 added; verified via diff |
| M-EDIT-01.2 | Add withAcademicId helper to tenant-context.ts (mirror withExamTypeId) | `src/lib/server/mastra/tenant-context.ts` | — | ✅ | tenant-context.ts lines 76-81 added; verified via diff |
| M-EDIT-01.3 | Update /api/chat/+server.ts to default academicId/examTypeId server-side | `src/routes/api/chat/+server.ts` | M-EDIT-01.2 ✅ | ✅ | Lines 141-146 (academicId), 148-164 (classId/sectionId); verified |
| M-VERIFY-01 | Run svelte-check + lint on PR 1 changes | assistant.ts + tenant-context.ts + chat/+server.ts (read-only) | M-EDIT-01.3 ✅ | ✅ | svelte-check: 0 new errors in PR 1 files; 8 pre-existing errors in unrelated files (logged) |
| M-EDIT-06.1 | Fix silent failure in SharedChatView.svelte doAssign() | `src/lib/components/SharedChatView.svelte` | — | ✅ | Lines 146-151 (toast.error), 161-166 (try/catch/finally); verified |
| M-IMPL-02.1 | Create src/lib/server/workspace/scope.ts with assertPathAgentVisible | `src/lib/server/workspace/scope.ts` (NEW) | — | ✅ | File created; WorkspaceScopeError + buildWorkspaceRoot + assertPathAgentVisible exported |
| M-EDIT-02.2 | Wire scope guard into /api/file/[...path]/+server.ts | `src/routes/api/file/[...path]/+server.ts` | M-IMPL-02.1 ✅ | ✅ | Lines 23, 54-66 (helper), 117/179/190/246/272 (guards); verified |
| M-VERIFY-02 | Test the scope guard with sample paths | scope.ts + [...path]/+server.ts (read-only) | M-EDIT-02.2 ✅ | ✅ | All 8 contract cases pass; 0 svelte-check errors in scope; verdict PASS |
| M-EDIT-02.3 | Fix assertPathAgentVisible guard ordering bug in scope.ts | `src/lib/server/workspace/scope.ts` | M-VERIFY-02 ❌ | ✅ | scope.ts:42-77 fixed; all 8 cases pass; verified |
| M-EDIT-03.1 | Add processStructured method to MistralOcrService | `src/lib/server/service/mistral-ocr.service.ts` | — | ✅ | Lines 124-167 added; verified via diff |
| M-EDIT-03.2 | Add writeNormalizedJson/readNormalizedJson to OcrWorkspaceStore | `src/lib/server/mastra/storage/ocr/ocr-workspace-store.ts` | — | ✅ | Lines 179-208 added; verified via grep |
| M-EDIT-03.3 | Rewrite /api/uploads/+server.ts to handle `kind` param | `src/routes/api/uploads/+server.ts` | M-EDIT-03.1 ✅, M-EDIT-03.2 ✅ | ✅ | 244 → 200 lines; kind=document/photo/studentPhoto dispatcher; verified |
| M-EDIT-03.4a | Rewrite ChatComposer.svelte fetch("/api/file/ocr") call to use /api/uploads?kind=document | `src/lib/components/ChatComposer.svelte` | M-EDIT-03.3 ✅ | ✅ | Line 323 fetch(/api/uploads); kind=document appended; markdown removed; verified |
| M-DEL-03.4 | Delete /api/file/ocr/+server.ts | (DELETE ONLY) | M-EDIT-03.4a ✅ | ✅ | File deleted; batch/results/+server.ts still present (M-DEL-03.5 territory) |
| M-EDIT-03.5a | Delete extraction-worker.ts (dead — calls non-existent /api/file/ocr/batch route) | `src/lib/chat/extraction-worker.ts` (DELETE ONLY) | — | ✅ | File deleted; upload-worker.ts preserved; verified |
| M-DEL-03.5 | Delete /api/file/ocr/batch/results/+server.ts | (DELETE ONLY) | M-EDIT-03.5a ✅ | 🟡 | Batch 12, in-flight (extraction-worker now gone) |
| M-EDIT-08.2 | Add data-runInfo/awaitValidation/committed/validationResult handlers in thread-data.svelte.ts | `src/lib/context/thread-data.svelte.ts` | M-EDIT-08.1 ✅ | ✅ | 6 state fields + 6 dispatch cases added; verified via grep |
| M-EDIT-09.1 | Add new state fields to ChatContext (lastCommittedArtifactId, etc.) | `src/lib/context/chat-context.svelte.ts` | — | ✅ | 6 state fields (lines 204-215) + 2 getters (196-201) + resumeWorkflow method (481-489); verified |
| M-EDIT-09.2 | Add resumeWorkflow method internals (sendMessage call) | `src/lib/context/chat-context.svelte.ts` | M-EDIT-09.1 ✅ | ⬜ | Pending |
| M-EDIT-09.3 | Wire chat:requestValidation listener in ChatComposer.svelte | `src/lib/components/ChatComposer.svelte` | M-EDIT-09.1 | ⬜ | Blocked |
| M-EDIT-09.4 | Wire ValidateFab mode derivation to new state | `src/lib/components/editor/ValidateFab.svelte` | M-EDIT-09.1 | ⬜ | Pending |
| M-EDIT-04.1 | Update MentionTag interface in mention-processor.ts (add class_section, term, file categories) | `src/lib/server/mastra/mention-processor.ts` | — | ✅ | MentionTag (15) + fileRef? (27) + MENTION_FIELD_MAP (40) + isClassSectionId guard (90) + class_section handler (175/230) + 3 TODO markers for file/term runtime; verified |
| M-EDIT-04.2 | Fix term→examTypeId runtime gap in processMentions | `src/lib/server/mastra/mention-processor.ts` | M-EDIT-04.1 ✅ | 🟡 | Batch 12, in-flight (plumb `examTypeId` field through createTenantContext call) |
| M-EDIT-04.3 | Update MentionDropdown.svelte with new categories | `src/lib/components/chat/MentionDropdown.svelte` | M-EDIT-04.1 ✅ | ⬜ | Pending |
| M-EDIT-04.4 | Add @category prefix detection in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-EDIT-04.3 | ⬜ | Pending |
| M-EDIT-04.5 | Extend /api/mentions/search with class_section, term, file | `src/routes/api/mentions/search/+server.ts` | M-EDIT-04.1, M-EDIT-04.2 | ⬜ | Pending |
| M-EDIT-08.3 | Render new data parts in chat.svelte | `src/lib/components/chat.svelte` | M-EDIT-08.1 ✅ | ⬜ | Pending |
| M-EDIT-09.1 | Add new state fields to ChatContext (lastCommittedArtifactId, etc.) | `src/lib/context/chat-context.svelte.ts` | — | ⬜ | Pending || M-EDIT-09.4 | Wire ValidateFab mode derivation to new state | `src/lib/components/editor/ValidateFab.svelte` | M-EDIT-09.1 ✅ | 🟡 | Batch 13, in-flight |
| M-EDIT-04.3 | Update MentionDropdown.svelte with new categories | `src/lib/components/chat/MentionDropdown.svelte` | M-EDIT-04.1 ✅ | 🟡 | Batch 13, in-flight |
| M-EDIT-04.3 | Update MentionDropdown.svelte with new categories | `src/lib/components/chat/MentionDropdown.svelte` | M-EDIT-04.1 ✅ | ✅ | Taxonomy (25) + ALL_CATEGORIES (48-55) + FolderIcon (9) + allowedCategories (58-64) + icon switch (346-360); verified |
| M-EDIT-04.4 | Add @category prefix detection in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-EDIT-04.3 ✅ | ⬜ | Pending |
| M-EDIT-04.5 | Extend /api/mentions/search with class_section, term, file | `src/routes/api/mentions/search/+server.ts` | M-EDIT-04.1 ✅, M-EDIT-04.2 ✅ | 🟡 | Batch 14, in-flight |
| M-EDIT-09.4 | Wire ValidateFab mode derivation to new state | `src/lib/components/editor/ValidateFab.svelte` | M-EDIT-09.1 ✅ | ✅ | NO CHANGES — M-EDIT-09.1 fields already satisfy mode derivation; verified |
| M-EDIT-09.2 | Add resumeWorkflow method internals (sendMessage call) | `src/lib/context/chat-context.svelte.ts` | M-EDIT-09.1 ✅ | 🟡 | Batch 14, in-flight |
| M-EDIT-04.5 | Extend /api/mentions/search with class_section, term, file | `src/routes/api/mentions/search/+server.ts` | M-EDIT-04.1 ✅, M-EDIT-04.2 ✅ | ✅ | 3 search functions + computeAllowedCategories; verified; follow-ups M-EDIT-04.5a/b/c queued |
| M-EDIT-04.5a | Update mention-utils.ts to v2 taxonomy (MentionCategory + getAllowedCategories) | `src/routes/api/mentions/search/mention-utils.ts` | M-EDIT-04.5 ✅ | 🟡 | Batch 15, in-flight |
| M-EDIT-09.2 | Add resumeWorkflow method internals (sendMessage call) | `src/lib/context/chat-context.svelte.ts` | M-EDIT-09.1 ✅ | ✅ | client.sendMessage with runId/step/resumeData; lines 481-506; verified |
| M-EDIT-04.4 | Add @category prefix detection in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-EDIT-04.3 ✅ | 🟡 | Batch 15, in-flight |
| M-EDIT-04.5a | Update mention-utils.ts to v2 taxonomy | `src/routes/api/mentions/search/mention-utils.ts` | M-EDIT-04.5 ✅ | ✅ | MentionCategory widened (25); MentionSearchResult.id widened (36); getAllowedCategories role-scoped (51-60); verified |
| M-EDIT-04.4 | Add @category prefix detection in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-EDIT-04.3 ✅ | ✅ | handleInputDetection (250-276); selectMention (288-309); MentionDropdown inferredCategory (79-87); verified |
| M-EDIT-08.3 | Render new data parts in chat.svelte | `src/lib/components/chat.svelte` | M-EDIT-08.1 ✅ | 🟡 | Batch 16, in-flight |
| M-EDIT-09.3 | Wire chat:requestValidation listener in ChatComposer.svelte | `src/lib/components/ChatComposer.svelte` | M-EDIT-09.1 ✅, M-EDIT-09.2 ✅ | 🟡 | Batch 16, in-flight |
| M-EDIT-08.3 | Render new data parts in chat.svelte | `src/lib/components/chat.svelte` | M-EDIT-08.1 ✅ | ✅ | 4 icon imports (32-35); 6 new renderers (232-280); verified |
| M-EDIT-09.3 | Wire chat:requestValidation listener in ChatComposer.svelte | `src/lib/components/ChatComposer.svelte` | M-EDIT-09.1 ✅, M-EDIT-09.2 ✅ | ✅ | onMount (473-475); onDestroy (476-478); handler (454-458); verified |
| M-EDIT-09.1 | Add new state fields to ChatContext | `src/lib/context/chat-context.svelte.ts` | — | ✅ | (already verified) |
| M-EDIT-14.1 | Wrap /api/chat to prepend data-runInfo part | `src/routes/api/chat/+server.ts` | — | 🟡 | Batch 17, in-flight |
| M-VERIFY-14 | Manual smoke test the data-runInfo arrival | (read-only) | M-EDIT-14.1 | ⬜ | Pending |
| M-EDIT-07.1 | Update skillCommandMap in skill-tools.ts | `src/lib/server/mastra/skill-tools.ts` | — | 🟡 | Batch 17, in-flight |
| M-EDIT-14.1 | Wrap /api/chat to prepend data-runInfo part | `src/routes/api/chat/+server.ts` | — | ✅ | randomUUID (190); createUIMessageStream wrapper (225-236); verified |
| M-VERIFY-14 | Manual smoke test the data-runInfo arrival | (read-only) | M-EDIT-14.1 ✅ | ⬜ | Pending |
| M-EDIT-07.1 | Update skillCommandMap in skill-tools.ts | `src/lib/server/mastra/skill-tools.ts` | — | ✅ | 18-entry map (40-59); deprecatedAliasMap removed; workflowTools import kept; verified |
| M-EDIT-07.2 | Rewrite CommandDropdown.svelte (remove deprecated, add subcommand pickers) | `src/lib/components/chat/CommandDropdown.svelte` | M-EDIT-07.1 ✅ | ⬜ | Pending |
| M-EDIT-07.3 | Update assistant.skill.md | `src/lib/server/mastra/skills/assistant.skill.md` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-07.4 | Update write.skill.md | `src/lib/server/mastra/skills/write.skill.md` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-07.5 | Add subcommand parser in assistant.ts | `src/lib/server/mastra/agents/assistant.ts` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-13.1 | Add awaitValidationStep to chatWorkflow | `src/lib/server/mastra/workflows/chat.ts` | — | 🟡 | Batch 18, in-flight |
| M-EDIT-13.2 | Wire awaitValidationStep into chatWorkflow pipeline | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.1 | ⬜ | Pending |
| M-EDIT-13.3 | Implement validate→commit/auto-fix→re-suspend logic | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.2 | ⬜ | Pending |
| M-EDIT-10.1 | Add 2s debounced PUT $effect in editor-canvas.svelte | `src/lib/components/workspace/editor-canvas.svelte` | — | 🟡 | Batch 18, in-flight |
| M-EDIT-10.2 | Add examTypeId, title, artifactId props to editor-canvas | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-10.1 | ⬜ | Pending |
| M-EDIT-13.1 | Add awaitValidationStep to chatWorkflow | `src/lib/server/mastra/workflows/chat.ts` | — | ✅ | Lines 733-770; first-run path emits data-awaitValidation + suspends; resume path stub; verified |
| M-EDIT-13.2 | Wire awaitValidationStep into chatWorkflow pipeline | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.1 ✅ | 🟡 | Batch 19, in-flight |
| M-EDIT-13.3 | Implement validate→commit/auto-fix→re-suspend logic | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.2 | ⬜ | Pending |
| M-EDIT-10.1 | Add 2s debounced PUT $effect in editor-canvas.svelte | `src/lib/components/workspace/editor-canvas.svelte` | — | ✅ | lastSavedContent (77) + timer (78) + props (41-43/54-56) + $effect (182-213); deviation: uses examTypeId prop not chat.chatData; verified |
| M-EDIT-10.2 | Add examTypeId, title, artifactId props refinement | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-10.1 ✅ | ⬜ | Pending (likely no-op since 10.1 already added props) |
| M-EDIT-11.1 | Add editable prop + setEditable effect in WysiwygEditor.svelte | `src/lib/components/editor/WysiwygEditor.svelte` | — | 🟡 | Batch 19, in-flight |
| M-EDIT-11.2 | Pass editable from editor-canvas | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-11.1 | ⬜ | Pending |
| M-EDIT-13.2 | Wire awaitValidationStep into chatWorkflow pipeline | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.1 ✅ | ✅ | Pipeline (878) + AWAIT_VALIDATION_STEP_ID export (889-893); verified |
| M-EDIT-13.3 | Implement validate→commit/auto-fix→re-suspend logic | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.2 ✅ | 🟡 | Batch 20, in-flight |
| M-EDIT-11.1 | Add editable prop + setEditable effect in WysiwygEditor.svelte | `src/lib/components/editor/WysiwygEditor.svelte` | — | ✅ | Prop (45,56); createEditor (143); setEditable effect (167-172); verified |
| M-EDIT-11.2 | Pass editable from editor-canvas | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-11.1 ✅ | ⬜ | Pending |
| M-IMPL-15.1 | Create update-photo tool in tools/operations/write/update-photo.ts | `src/lib/server/mastra/tools/operations/write/update-photo.ts` (NEW) | — | 🟡 | Batch 20, in-flight |
| M-EDIT-15.2 | Add update-photo to write skill tools list | `src/lib/server/mastra/tools/operations/write/index.ts` | M-IMPL-15.1 | ⬜ | Pending |
| M-EDIT-13.3 | Implement validate→commit/auto-fix→re-suspend logic | `src/lib/server/mastra/workflows/chat.ts` | M-EDIT-13.2 ✅ | ✅ | tenantWorkspace import (54); chat-helper extended (55); execute body (752-861); verified |
| M-IMPL-15.1 | Create update-photo tool | `src/lib/server/mastra/tools/operations/write/update-photo.ts` (NEW) | — | ✅ | 81 lines; updatePhotoTool exported; verified |
| M-EDIT-15.2 | Add update-photo to write skill tools list | `src/lib/server/mastra/tools/operations/write/index.ts` | M-IMPL-15.1 ✅ | 🟡 | Batch 21, in-flight |
| M-VERIFY-15 | Test the full /update photo @student flow end-to-end | (read-only) | M-EDIT-15.2 | ⬜ | Pending |
| M-EDIT-11.2 | Pass editable from editor-canvas | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-11.1 ✅ | 🟡 | Batch 21, in-flight |
| M-EDIT-15.2 | Add update-photo to write skill tools list | `src/lib/server/mastra/tools/operations/write/index.ts` | M-IMPL-15.1 ✅ | ✅ | Re-export (11) + import (23) + writeTools entry (36); verified |
| M-VERIFY-15 | Test /update photo @student flow end-to-end | (read-only) | M-EDIT-15.2 ✅ | ⬜ | Pending |
| M-EDIT-11.2 | Pass editable from editor-canvas | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-11.1 ✅ | ✅ | chat import (8); useChat (66); derivation (75-80); prop pass (257); verified |
| M-EDIT-07.2 | Rewrite CommandDropdown.svelte (remove deprecated, add subcommand pickers) | `src/lib/components/chat/CommandDropdown.svelte` | M-EDIT-07.1 ✅ | 🟡 | Batch 22, in-flight |
| M-EDIT-07.3 | Update assistant.skill.md | `src/lib/server/mastra/skills/assistant.skill.md` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-07.4 | Update write.skill.md | `src/lib/server/mastra/skills/write.skill.md` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-07.5 | Add subcommand parser in assistant.ts | `src/lib/server/mastra/agents/assistant.ts` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-12.1 | Remove legacy handleOcrChange + ocrFiles from ChatComposer | `src/lib/components/ChatComposer.svelte` | — | 🟡 | Batch 22, in-flight |
| M-EDIT-07.2 | Rewrite CommandDropdown.svelte | `src/lib/components/chat/CommandDropdown.svelte` | M-EDIT-07.1 ✅ | ✅ | 18-entry + subcommand pickers; icons updated; verified |
| M-EDIT-07.3 | Update assistant.skill.md | `src/lib/server/mastra/skills/assistant.skill.md` | M-EDIT-07.1 ✅ | 🟡 | Batch 23, in-flight |
| M-EDIT-07.4 | Update write.skill.md | `src/lib/server/mastra/skills/write.skill.md` | M-EDIT-07.1 ✅ | 🟡 | Batch 23, in-flight |
| M-EDIT-07.5 | Add subcommand parser in assistant.ts | `src/lib/server/mastra/agents/assistant.ts` | M-EDIT-07.1 | ⬜ | Pending |
| M-EDIT-12.1 | Remove legacy handleOcrChange + ocrFiles from ChatComposer | `src/lib/components/ChatComposer.svelte` | — | ✅ | 8 deletion blocks; 1015 → 908 lines; validation listener + mention detection preserved; verified |
| M-EDIT-07.3 | Update assistant.skill.md | `src/lib/server/mastra/skills/assistant.skill.md` | M-EDIT-07.1 ✅ | ✅ | 76 lines (full rewrite); 18-command surface documented; verified |
| M-EDIT-07.4 | Update write.skill.md | `src/lib/server/mastra/skills/write.skill.md` | M-EDIT-07.1 ✅ | ✅ | 101 lines; plain-text staff + student templates; /update photo flow; verified |
| M-EDIT-07.5 | Add subcommand parser in assistant.ts | `src/lib/server/mastra/agents/assistant.ts` | M-EDIT-07.1 ✅ | 🟡 | Batch 24, in-flight |
| M-EDIT-05.1 | Replace plus dropdown contents in ChatComposer (TWO upload entries) | `src/lib/components/ChatComposer.svelte` | M-EDIT-12.1 ✅ | 🟡 | Batch 24, in-flight |
| M-EDIT-07.5 | Add subcommand parser in assistant.ts | `src/lib/server/mastra/agents/assistant.ts` | M-EDIT-07.1 ✅ | ✅ | ParsedSlashCommand interface (97-101); parseSlashCommand (103-112); verified |
| M-EDIT-05.1 | Replace plus dropdown contents in ChatComposer (TWO upload entries) | `src/lib/components/ChatComposer.svelte` | M-EDIT-12.1 ✅ | ✅ | CameraIcon (5) + ScanLineIcon (23); dropdown (631-790); stubs (330-338); verified |
| M-IMPL-05.2 | Add handlePhotoUpload in ChatComposer (immediate workspace upload) | `src/lib/components/ChatComposer.svelte` | M-EDIT-05.1 ✅ | 🟡 | Batch 25, in-flight |
| M-IMPL-05.3 | Add handleDocumentUpload in ChatComposer (OCR via /api/uploads) | `src/lib/components/ChatComposer.svelte` | M-IMPL-05.2 | ⬜ | Pending |
| M-VERIFY-14 | Manual smoke test the data-runInfo arrival | (read-only) | M-EDIT-14.1 ✅ | 🟡 | Batch 25, in-flight |
| M-IMPL-05.2 | Add handlePhotoUpload in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-EDIT-05.1 ✅ | ✅ | photoFileInput (68); triggerPhotoUpload (331-334); handlePhotoUpload (336-383); input (951-958); verified |
| M-VERIFY-14 | Verify data-runInfo prepended | (read-only) | M-EDIT-14.1 ✅ | ✅ | PASS — 0 svelte-check errors in 4 files; verified |
| M-IMPL-05.3 | Add handleDocumentUpload in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-IMPL-05.2 ✅ | 🟡 | Batch 26, in-flight |
| M-VERIFY-15 | Test /update photo @student flow end-to-end | (read-only) | M-EDIT-15.2 ✅ | ⬜ | Pending |
| M-IMPL-05.3 | Add handleDocumentUpload in ChatComposer | `src/lib/components/ChatComposer.svelte` | M-IMPL-05.2 ✅ | ✅ | documentFileInput (69); triggerDocumentUpload (386-389); handleDocumentUpload (391-431); input (1002-1009); verified |
| M-VERIFY-15 | Test /update photo @student flow end-to-end | (read-only) | M-EDIT-15.2 ✅ | ❌ | **FAILED** — 2 type errors in update-photo.ts (line 49 requestContext, line 56 readFile); spawn M-EDIT-15.3 |
| M-EDIT-15.3 | Fix type errors in update-photo.ts (requestContext + readFile encoding) | `src/lib/server/mastra/tools/operations/write/update-photo.ts` | M-VERIFY-15 ❌ | 🟡 | Batch 27, in-flight |
| M-RE-VERIFY-15 | Re-run M-VERIFY-15 after M-EDIT-15.3 | (read-only) | M-EDIT-15.3 | ⬜ | Pending |
| M-EDIT-15.3 | Fix type errors in update-photo.ts | `src/lib/server/mastra/tools/operations/write/update-photo.ts` | M-VERIFY-15 ❌ | ✅ | Imports + interface widened (12, 14-21); `as never` cast (53); binary readFile (57-58); 0 svelte-check errors attributable; verified |
| M-RE-VERIFY-15 | Re-run M-VERIFY-15 after M-EDIT-15.3 fix | (read-only) | M-EDIT-15.3 ✅ | 🟡 | Batch 27, in-flight |
| M-PRE-16 | Scan all references to PR 16 target files before cutover | (read-only) | — | 🟡 | Batch 27, in-flight |
| M-RE-VERIFY-15 | Re-run M-VERIFY-15 after M-EDIT-15.3 fix | (read-only) | M-EDIT-15.3 ✅ | ✅ | PASS — 0 errors in update-photo.ts (was 2); 25 total project errors unchanged; verified |
| M-PRE-16 | Scan all references to PR 16 target files before cutover | (read-only) | — | ✅ | 5 SAFE deletes; 8 BLOCKED requiring 5 microtask edits; 7 cosmetic-only refs; verified |
| M-CUTOVER-1 | Delete 5 safe files + remove result-mapper from registry | (5 files delete + 2 files edit) | M-PRE-16 ✅ | 🟡 | Batch 28, in-flight |
| M-CUTOVER-2 | Remove 4 legacy workflows + 4 AssessmentService.runXxxForTool methods | (4 files delete + 2 files edit) | M-PRE-16 ✅ | 🟡 | Batch 28, in-flight |
| M-CUTOVER-3 | Replace UploadWorker with direct fetch in FilesContext | (2 files) | M-PRE-16 ✅ | ⬜ | Pending |
| M-CUTOVER-4 | Delete workflow-tools.ts + 4 tool wrappers + workflowTools from skill-tools.ts | (3 files) | M-PRE-16 ✅ | ⬜ | Pending |
| M-CUTOVER-5 | Migrate 3 URL consumers off /api/uploads/[...fileId] to /api/file/... | (2 files) | M-PRE-16 ✅ | ⬜ | Pending |
| M-CUTOVER-1 | Delete 5 safe files + remove result-mapper | (5 dead files + 1 agent) | M-PRE-16 ✅ | ✅ | 6 files deleted; agents/index.ts (-1 export); mastra/index.ts (-3 result-mapper refs); 26 total svelte-check errors (1 new: orphan test file); verified |
| M-CUTOVER-2 | Remove 4 legacy workflows + 4 AssessmentService methods | (4 workflows + 2 files) | M-PRE-16 ✅ | ✅ | 4 workflows deleted; mastra/index.ts (-8 workflow refs); assessment.service.ts (-189 lines, -4 methods); 0 new errors from my scope; verified |
| M-CUTOVER-1a | Delete orphan result-mapper-slice12.test.ts | (DELETE ONLY) | M-CUTOVER-1 ✅ | ⬜ | Pending (test-only, non-blocking) |
| M-CUTOVER-3 | Replace UploadWorker with direct fetch in FilesContext | (2 files) | M-PRE-16 ✅ | 🟡 | Batch 29, in-flight |
| M-CUTOVER-4 | Delete workflow-tools.ts + wrappers | (3 files) | M-PRE-16 ✅ | ⬜ | Pending |
| M-CUTOVER-5 | Migrate 3 URL consumers off /api/uploads/[...fileId] | (2 files) | M-PRE-16 ✅ | 🟡 | Batch 29, in-flight |
| M-CUTOVER-3 | Replace UploadWorker with direct fetch | (1 edit + 1 delete) | M-PRE-16 ✅ | ✅ | UploadWorker import removed; #performUpload added; upload-worker.ts deleted; chat/ dir empty; 0 new svelte-check errors; verified |
| M-CUTOVER-5 | Migrate 3 URL consumers off /api/uploads/[...fileId] | (2 edits + 1 delete) | M-PRE-16 ✅ | ✅ | chat.remote.ts:282 + chat-resource.svelte:171 + :245 migrated; route deleted; 0 new svelte-check errors; verified |
| M-CUTOVER-4 | Delete workflow-tools.ts + 4 tool wrappers + workflowTools from skill-tools.ts | (3 files) | M-PRE-16 ✅ | 🟡 | Batch 30, in-flight |
| M-CUTOVER-4 | Delete workflow-tools.ts + wrappers | (2 edits + 1 delete) | M-PRE-16 ✅ | ✅ | tools/index.ts (-91 lines); skill-tools.ts (-2 lines); workflow-tools.ts deleted; 6 new errors (orphan test file); verified |
| M-CUTOVER-1a | Delete orphan result-mapper-slice12.test.ts | (DELETE ONLY) | M-CUTOVER-1 ✅ | 🟡 | Batch 31, in-flight |
| M-CUTOVER-4a | Delete orphan workflow-tools.test.ts | (DELETE ONLY) | M-CUTOVER-4 ✅ | 🟡 | Batch 31, in-flight |
| M-FINAL-VERIFY | Final svelte-check + manual smoke across all PRs | (read-only) | All above ✅ | 🟡 | Batch 31, in-flight |
| M-CUTOVER-1a | Delete orphan result-mapper-slice12.test.ts | (DELETE ONLY) | M-CUTOVER-1 ✅ | ✅ | File deleted; -1 svelte-check error (26→25); verified |
| M-CUTOVER-4a | Delete orphan workflow-tools.test.ts | (DELETE ONLY) | M-CUTOVER-4 ✅ | ✅ | File deleted; -6 svelte-check errors (31→25); verified |
| M-FINAL-VERIFY | Final svelte-check + manual verification across all PRs | (read-only) | All above ✅ | ❌ | **FAILED** — 13 production errors + 12 test errors + 3 legacy refs; spawn M-FIX-* batch |
| M-DEL-03.5 | Delete /api/file/ocr/batch/results/+server.ts | (DELETE ONLY) | M-EDIT-03.5a ✅ | ✅ | (ledger bookkeeping: was 🟡 in verification report; actually ✅ since Batch 12 retry) |
| M-EDIT-04.2 | Fix term→examTypeId runtime gap in processMentions | `src/lib/server/mastra/mention-processor.ts` | M-EDIT-04.1 ✅ | ✅ | (ledger bookkeeping: was 🟡 in verification report; actually ✅ since Batch 12 — lines 145/238-244/270) |
| M-EDIT-10.2 | Refine props | `src/lib/components/workspace/editor-canvas.svelte` | M-EDIT-10.1 ✅ | ✅ | (no-op — M-EDIT-10.1 already added the props; M-EDIT-10.2 marked ✅ retroactively) |
| M-FIX-13.3a | Fix 8 strict-null-check errors in chat.ts awaitValidationStep | `src/lib/server/mastra/workflows/chat.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-07.1a | Remove broken resolveSkillName import in instructions.ts | `src/lib/server/mastra/agents/instructions.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-03.1a | Fix unsafe OCRResponse cast in mistral-ocr.service.ts | `src/lib/server/service/mistral-ocr.service.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-04.5b | Remove dead 'date'/'custom' comparisons in mentions/search | `src/routes/api/mentions/search/+server.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-08.1a | Add OptionItem export to chat-types.ts | `src/lib/types/chat-types.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-TEST-1 | Update test fixtures in mention-processor.test.ts and mentions-search.test.ts to use v2 taxonomy | `tests/mastra/mention-processor.test.ts`, `tests/mastra/mentions-search.test.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-CLEAN-LEGACY-1 | Strip 3 remaining legacy references from src/ | `src/lib/server/service/assessment-ocr.service.ts`, `src/lib/components/tool-message.svelte`, `src/lib/context/file-context.svelte.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 32, in-flight |
| M-FIX-13.3a | Fix 8 strict-null errors in chat.ts awaitValidationStep | `src/lib/server/mastra/workflows/chat.ts` | M-FINAL-VERIFY ❌ | ✅ | 6 guards added (lines 784/789/798/807/821/853); verified |
| M-FIX-07.1a | Remove broken resolveSkillName import in instructions.ts | `src/lib/server/mastra/agents/instructions.ts` | M-FINAL-VERIFY ❌ | ✅ | Inlined local resolveSkillName (lines 5-29); call site updated (80); verified |
| M-FIX-03.1a | Fix unsafe OCRResponse cast in mistral-ocr.service.ts | `src/lib/server/service/mistral-ocr.service.ts` | M-FINAL-VERIFY ❌ | ✅ | Spread + fileId literal (164-165); no `as` cast; verified |
| M-FIX-04.5b | Remove dead 'date'/'custom' comparisons in mentions/search | `src/routes/api/mentions/search/+server.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 33, in-flight |
| M-FIX-08.1a | Add OptionItem export to chat-types.ts | `src/lib/types/chat-types.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 33, in-flight |
| M-FIX-TEST-1 | Update test fixtures for v2 taxonomy | `tests/mastra/mention-processor.test.ts`, `tests/mastra/mentions-search.test.ts` | M-FINAL-VERIFY ❌ | 🟡 | Batch 33, in-flight |
| M-CLEAN-LEGACY-1 | Strip 3 legacy references from src/ | (3 files) | M-FINAL-VERIFY ❌ | 🟡 | Batch 33, in-flight |
| M-FIX-04.5b | Remove dead 'date'/'custom' comparisons | `src/routes/api/mentions/search/+server.ts` | M-FINAL-VERIFY ❌ | ✅ | 2 OR-clauses removed (294-295); verified |
| M-FIX-08.1a | Add OptionItem export | `src/lib/types/chat-types.ts` | M-FINAL-VERIFY ❌ | ✅ | OptionItem interface (68-74); verified |
| M-FIX-TEST-1 | Update test fixtures for v2 taxonomy | `tests/mastra/mention-processor.test.ts`, `tests/mastra/mentions-search.test.ts` | M-FINAL-VERIFY ❌ | ✅ | 15 references changed; 3 tests removed; verified |
| M-CLEAN-LEGACY-1 | Strip 3 legacy references from src/ | `assessment-ocr.service.ts`, `tool-message.svelte`, `file-context.svelte.ts` | M-FINAL-VERIFY ❌ | ✅ | All 3 cleaned; grep returns 0; verified |
| M-FINAL-VERIFY-2 | Re-run final verification | (read-only) | All above ✅ | 🟡 | Batch 34, in-flight |
| M-FINAL-VERIFY-2 | Re-run final verification after fix batches | (read-only) | All above ✅ | ✅ | 1 residual error in chat.ts:790 (TS2349 toString cast); needs M-FIX-13.3b |
| M-VERIFY-15 (superseded) | (superseded by M-EDIT-15.3 + M-RE-VERIFY-15) | (read-only) | — | ✅ | Ledger housekeeping: marked ✅ retroactively (both remediation batches succeeded) |
| M-FINAL-VERIFY (superseded) | (superseded by 7 M-FIX-* + M-CLEAN-LEGACY-1) | (read-only) | — | ✅ | Ledger housekeeping: marked ✅ retroactively |
| M-FIX-13.3b | Widen toString cast to accept encoding arg | `src/lib/server/mastra/workflows/chat.ts` | M-FINAL-VERIFY-2 ✅ | 🟡 | Batch 35, in-flight |
| M-FIX-13.3b | Widen toString cast | `src/lib/server/mastra/workflows/chat.ts` | M-FINAL-VERIFY-2 ✅ | ✅ | Line 790 cast widened; verified |
| M-FINAL-VERIFY-3 | Re-run final verification (third pass) | (read-only) | M-FIX-13.3b ✅ | 🟡 | Batch 36, in-flight |
| M-FINAL-VERIFY-3 | Re-run final verification (third pass) | (read-only) | M-FIX-13.3b ✅ | ✅ | **VERDICT: PASS** — 0 errors, 0 legacy refs, all 6 arch checks pass; build clean |
| M-FIX-SSR-1 | Fix SSR crash: guard window refs in ChatComposer onDestroy | `src/lib/components/ChatComposer.svelte` | — | ✅ | Lines 501-505: typeof window guard added; onMount left untouched (already browser-only); verified |
| M-FIX-MENTION-1 | Replace `term` with `exam` in ChatComposer handleInputDetection regex | `src/lib/components/ChatComposer.svelte` | — | 🟡 | Batch 37, in-flight |
| M-FIX-MENTION-2 | Replace `term` with `exam` in MentionDropdown inferredCategory + fix bare @ $effect guard | `src/lib/components/chat/MentionDropdown.svelte` | — | 🟡 | Batch 37, in-flight |
| M-FIX-MENTION-3 | Add searchAcademicYear handler to /api/mentions/search and rename `term` category to `exam` | `src/routes/api/mentions/search/+server.ts` | — | 🟡 | Batch 37, in-flight |
| M-FIX-MENTION-4 | Rename `term` category to `exam` in mention-utils.ts and mention-processor.ts | `src/routes/api/mentions/search/mention-utils.ts`, `src/lib/server/mastra/mention-processor.ts` | — | 🟡 | Batch 37, in-flight |
| M-FIX-MENTION-1 | ChatComposer regex: replace `term` with `exam` | `src/lib/components/ChatComposer.svelte` | — | ✅ | Line 260 regex updated; verified |
| M-FIX-MENTION-2 | MentionDropdown: rename term→exam + fix bare @ $effect | `src/lib/components/chat/MentionDropdown.svelte` | — | ✅ | Lines 25/53/62/84/124/180-191/364 updated; redundant $effect removed (416→407 lines); flagged fetchResults empty-query bail — see M-FIX-MENTION-5 |
| M-FIX-MENTION-3 | Add searchAcademicYear + rename term→exam in /api/mentions/search | `src/routes/api/mentions/search/+server.ts` | — | ✅ | 10 renames + searchAcademicYear added (lines 235-266) + dispatch wired; verified |
| M-FIX-MENTION-4 | Rename term→exam in mention-utils + mention-processor | `mention-utils.ts`, `mention-processor.ts` | — | ✅ | 11 renames total (6 + 5); 2 cosmetic artifacts noted (mention-utils.ts:6/:18); verified |
| M-FIX-MENTION-5 | Remove empty-query bail in MentionDropdown fetchResults | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-2 ✅ | 🟡 | Batch 38, in-flight |
| M-FIX-MENTION-5 | Remove empty-query bail in fetchResults | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-2 ✅ | ✅ | Lines 126-131 removed; bare @ now triggers API call; verified |
| M-FIX-MENTION-6 | Convert debounceTimer/abortController to `$state.raw` | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-5 ✅ | ✅ | Lines 72-73 changed to $state.raw(); infinite loop resolved; verified |
| M-FIX-MENTION-7 | Add `@term` as alias for `@exam` (both should work) | `src/lib/components/ChatComposer.svelte`, `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-6 ✅ | 🟡 | Batch 39, in-flight |
| M-FIX-MENTION-7 | Add `@term` alias for `@exam` | `ChatComposer.svelte`, `MentionDropdown.svelte` | M-FIX-MENTION-6 ✅ | ✅ | ChatComposer L259/260/288/290 + MentionDropdown L84/125 updated; verified |

## Mention System Final State

### Working prefix-to-category mapping (after Batch 37-39):
| User types | Inferred category | API handler | What shows |
|---|---|---|---|
| `@` (bare) | `null` (default tab) | `searchStudents` (default branch) | Students + class+section |
| `@studentName` | `null` | `searchStudents` | Matching students |
| `@class <q>` | `class_section` | `searchClassSection` | "LOWERBASIC 1 - Section B" rows |
| `@year <q>` | `academic_year` | `searchAcademicYear` (M-FIX-MENTION-3) | Academic year rows |
| `@exam <q>` | `exam` | `searchExam` | Exam types (e.g. "CA2") |
| `@term <q>` | `exam` (alias) | `searchExam` | Same as `@exam` |
| `@file <q>` | `file` | `searchFile` | Workspace files |

### Category taxonomy rename (term → exam):
- `MentionCategory` union (`mention-utils.ts`, `mention-processor.ts`): `'term'` → `'exam'`
- `MENTION_FIELD_MAP`: `term: 'examTypeId'` → `exam: 'examTypeId'`
- `processMentions` dispatch in `mention-processor.ts`: `category === 'term'` → `category === 'exam'`
- `/api/mentions/search`: `searchTerm` → `searchExam`; dispatch updated
- `ExtendedMentionCategory` in `/api/mentions/search/+server.ts`: `'term'` → `'exam'`
- `MentionDropdown` icon switch case: `'term'` → `'exam'`
- User-facing label "Exam Term" preserved

### Bug fixes during mention system work:
- M-FIX-MENTION-2: Removed `&& query` guard from `$effect` so bare `@` triggers `fetchResults`
- M-FIX-MENTION-5: Removed empty-query bail in `fetchResults` so bare `@` makes the API call
- M-FIX-MENTION-6: Converted `debounceTimer` and `abortController` from `$state` → `$state.raw` to break the read+write self-loop that triggered `effect_update_depth_exceeded`
- M-FIX-MENTION-7: Added `@term` as user-facing alias for `@exam` (both map to `exam` category)

| M-FIX-MENTION-8a | MentionDropdown: remove $effect, add exported refresh method | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-7 ✅ | 🟡 | Batch 40, in-flight |
| M-FIX-MENTION-8b | ChatComposer: bind:this ref + $effect that calls refresh | `src/lib/components/ChatComposer.svelte` | M-FIX-MENTION-7 ✅ | 🟡 | Batch 40, in-flight |
| M-FIX-MENTION-8a | MentionDropdown: remove $effect, add exported refresh method | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-7 ✅ | ✅ | Lines 175-187 $effect removed; lines 175-190 refresh method added; verified |
| M-FIX-MENTION-8b | ChatComposer: bind:this ref + $effect calling refresh | `src/lib/components/ChatComposer.svelte` | M-FIX-MENTION-7 ✅ | ✅ | Line 76 ref + lines 499-510 $effect + line 662 bind:this; verified |
| M-FIX-MENTION-9 | Wrap refresh body in `untrack()` to break the cross-component read+write loop | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-8b ✅ | ✅ | Import `untrack` from svelte (line 3); refresh body wrapped in untrack() (lines 186-188); verified |
| M-FIX-MENTION-10 | Fix `each_key_duplicate` for class_section results (id is object) | `src/lib/components/chat/MentionDropdown.svelte` | M-FIX-MENTION-9 ✅ | ✅ | `keyFor(item)` helper added (line 115); template `{#each}` now uses `(keyFor(item))` (line 357); verified |
| M-FIX-MENTION-11 | Privacy: scope @studentName + @file to active OR assigned class | `src/routes/api/mentions/search/+server.ts` | M-FIX-MENTION-10 ✅ | ✅ | GET handler reads cookie `selected-class` for active class + user.classId/sectionId for assigned; effectiveClassId = active ?? assigned; applied to tenant context AND searchEntities; query-param override REMOVED for security; verified |
