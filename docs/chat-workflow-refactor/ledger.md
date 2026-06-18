# Chat Workflow Refactor — Subagent Task Ledger

Status legend: ⬜ pending | 🟡 in-flight | ✅ done | ❌ failed

## Final status: ALL TASKS COMPLETE ✅

## M-EXP-01..03: First batch (read-only exploration, 3 parallel)

| id | subject | status | notes |
|---|---|---|---|
| M-EXP-01 | Codebase exploration: chat resume/suspend/bail call sites | ✅ | No working suspend/resume in chat; legacy workflows own all suspend sites |
| M-EXP-02 | Codebase exploration: extracted/manifest json readers and writers | ✅ | Comprehensive report received |
| M-EXP-03 | Codebase exploration: slash command handlers and CommandDropdown | ✅ | All 6 skills + 3 dropdown hooks documented |

## Implementation batch

| id | subject | status | notes |
|---|---|---|---|
| M-SOCR | Mistral structured output + storage primitives | ✅ | manifest-store + blob + cleanup + processStructured created |
| M-PT | Parent tools: 13 tools + skill + permissions | ✅ | 1322-line parent-tools.ts, permissions helper, skill file all complete |
| M-WFL | Slim chat workflow + runId-aware /api/chat | ✅ | chat.ts slimmed to 130 lines; /api/chat uses createRun + createUIMessageStream |
| M-UPL | Upload route rewrite to use processStructured + manifest | ✅ | New POST/DELETE contract; processStructured + manifest + writeBlob wired |
| M-MT | Marksheet tools: 5 tools | ✅ | 570-line marksheet-tools.ts with 5 tools |
| M-RPT | Report PDF tools: 2 tools | ✅ | 845-line report-pdf-tools.ts with 2 tools |
| M-CDT | Choose document tool | ✅ | New file with 1 tool |
| M-SKL | Skills: marksheet + report | ✅ | Both .skill.md files created with correct frontmatter |
| M-DP | Data parts + thread-data + chat-context | ✅ | 5 files modified; 7 new part types + 6 new handlers + 6 new fields + 5 new methods |
| M-ED | Editor lifecycle: WysiwygEditor + editor-canvas + ValidateFab | ✅ | editable prop + ValidateFab created |
| M-CC | Chat composer no-autoprocess | ✅ | ocrFiles removed, new upload handler, validation listener added |
| M-TG | Telegram gateway: bot + gateway + tokens + migration + routes | ✅ | 8 files created: migration + 3 lib files + 4 routes/pages |
| M-CO | Cutover: delete 14 files, update remaining refs | ✅ | 16 files deleted (incl. 2 test files + 2 from file-drop-zone dir); 8 ref-cleanup files modified; test file updated |

## Summary of changes

### Created (16 new files)

**Storage primitives:**
- `src/lib/server/mastra/storage/ocr/manifest-store.ts`
- `src/lib/server/mastra/storage/ocr/content-addressed-blob.ts`
- `src/lib/server/mastra/storage/ocr/extracted-cleanup.ts`
- `src/lib/server/mastra/storage/libsql/migrations/1730000000_telegram.sql`

**Tools:**
- `src/lib/server/mastra/tools/parent-tools.ts` (1322 lines, 13 tools)
- `src/lib/server/mastra/tools/parent-permissions.ts`
- `src/lib/server/mastra/tools/marksheet-tools.ts` (570 lines, 5 tools)
- `src/lib/server/mastra/tools/report-pdf-tools.ts` (845 lines, 2 tools)
- `src/lib/server/mastra/tools/choose-document.ts`

**Skills:**
- `src/lib/server/mastra/skills/parent.skill.md`
- `src/lib/server/mastra/skills/marksheet.skill.md`
- `src/lib/server/mastra/skills/report.skill.md`

**UI components:**
- `src/lib/components/editor/ValidateFab.svelte`

**Telegram gateway:**
- `src/lib/server/telegram/bot.ts`
- `src/lib/server/telegram/connect-tokens.ts`
- `src/lib/server/telegram/gateway.ts`
- `src/routes/api/telegram/webhook/+server.ts`
- `src/routes/telegram/connect/+page.svelte`
- `src/routes/telegram/connect/+page.server.ts`
- `src/routes/api/parents/connect-telegram/+server.ts`

### Deleted (16 files)

- 4 legacy workflows: `extraction.ts`, `generate.ts`, `validation.ts`, `publish.ts`
- 1 tool wrapper: `workflow-tools.ts`
- 1 agent: `result-mapper.ts`
- 2 workers: `upload-worker.ts`, `extraction-worker.ts`
- 4 routes: `file/ocr/+server.ts`, `file/ocr/batch/results/+server.ts`, `uploads/[...fileId]/+server.ts`, `uploads/[...fileId]/approve/+server.ts`
- 1 component: `drop-zone.svelte`
- 3 file-drop-zone siblings: `file-drop-zone.svelte`, `index.ts`, `types.ts`

### Modified (15 files)

**Workflows:**
- `src/lib/server/mastra/workflows/chat.ts` (711 → 130 lines)
- `src/lib/server/mastra/index.ts` (removed 4 workflows + resultMapperAgent)
- `src/lib/server/mastra/agents/index.ts` (removed resultMapperAgent export)
- `src/lib/server/mastra/tools/index.ts` (removed workflowTools + 4 tools)
- `src/lib/server/mastra/skill-tools.ts` (slash command map updated; workflowTools removed)

**Services:**
- `src/lib/server/service/mistral-ocr.service.ts` (added processStructured)
- `src/lib/server/service/assessment.service.ts` (removed 4 deprecated methods)
- `src/lib/server/service/assessment-ocr.service.ts` (doc updated)

**Routes:**
- `src/routes/api/chat/+server.ts` (runId/step/resumeData support; createRun + createUIMessageStream)
- `src/routes/api/uploads/+server.ts` (rewritten to use processStructured + manifest)

**Types + state:**
- `src/lib/types/chat-types.ts` (7 new part types)
- `src/lib/context/thread-data.svelte.ts` (6 new handlers + new inline data-createDocument)
- `src/lib/context/chat-context.svelte.ts` (6 new fields + 5 new methods)
- `src/lib/context/file-context.svelte.ts` (replaced UploadWorker with direct fetch)
- `src/lib/components/chat.svelte` (6 new inline renderings)
- `src/lib/components/SharedChatView.svelte` (chatArtifacts filter updated)
- `src/lib/components/ChatComposer.svelte` (no-autoprocess; validation listener)
- `src/lib/components/editor/WysiwygEditor.svelte` (editable prop + $effect)
- `src/lib/components/workspace/editor-canvas.svelte` ({#key} + ValidateFab mount)

**Tests:**
- `tests/lib/server/mastra/gateway-global-tools.test.ts` (workflowTools → marksheetTools + reportPdfTools)

## Verification

- `pnpm run check` → **0 errors, 25 warnings** (all pre-existing in unrelated files)
- `grep -rn "extractionWorkflow|generateWorkflow|validationWorkflow|publishWorkflow|workflowTools|resultMapperAgent|upload-worker|extraction-worker|drop-zone|file-drop-zone" src/ tests/` → **0 matches**
- 16 files deleted, 16 files created, 15 files modified
- 3-subagent parallel cap respected throughout
- Single-writer-per-file principle respected (no two subagents ever touched the same file)
- All tasks completed with their definition-of-done criteria met

## Orchestration rules

- I am the orchestrator. I do not edit code.
- Subagents MUST read this ledger before starting work.
- Subagents MUST verify their task is ⬜ or ❌ (re-decomposed).
- Subagents MUST verify no 🟡 row holds any of their files_allowed paths.
- Up to 3 subagents in parallel at any time.
- No two rows share any path in files_allowed.
- After each subagent completes, I verify the changes and update the row to ✅ or ❌.
- Single concept per M- code. Subjects are unique.
