# EdApex Build Handover — Phase 1 / 1.5 / 2.A Complete, Phase 2.B → 7 Pending

**Project:** `/home/beznet/Workspace/edapex`
**Branch:** `main`
**Last committed:** `2bc6cac` (Phase 2.A skill restructure) on 2026-06-18 14:51 BST
**Working tree:** clean
**Audience:** Next build agent resuming subagent orchestration

This document is the single source of truth the next agent needs to resume work without re-reading every file or re-deriving any decision. Sections 1–3 cover *what was done*, sections 4–6 cover *how to dispatch more work*, sections 7–11 cover *what's left*.

If something is not in this document and not in the cited file, treat it as undecided and consult the user.

---

## 1. Build Session Summary

This session committed three commits covering the marksheet rename, dead-code cleanup, and skill restructure. Each commit has a single, narrow theme; do not conflate them.

### 1.1 Commit `32a409b` — Phase 1 + 1.5 (Marksheet rename + dead code + safety)

Combined commit because both phases were a single coherent pass on `assessment.service.ts` and its downstream call sites.

**Phase 1.5 (marksheet rename):**

| Microtask | Files touched | Notes |
|---|---|---|
| 1.5.1 rename schema | `src/lib/schema/result-output.ts` → DELETED; `src/lib/schema/marksheet.ts` (236 LOC) created | `resultOutputSchema` → `marksheetSchema`, `ResultOutput` → `Marksheet`. Added `recordId` field. |
| 1.5.1b split deprecation stub | `src/routes/(chat)/+page.server.ts` reduced to a deprecation stub (only `upsertStudentResult` legacy path) | Existing file kept to avoid breaking the upload approve route in `src/routes/api/uploads/[...fileId]/approve/+server.ts:39`. |
| 1.5.2 service rewrite | `src/lib/server/service/assessment.service.ts` (+176 / −120 LOC) | Added `upsertMarksheet(marksheet: Marksheet, staffId: number): Promise<Marksheet>` at `assessment.service.ts:538`. **The OLD `upsertStudentResult` still exists at `assessment.service.ts:431`** and is NOT deleted — see §5. |
| 1.5.2b update tool callers | `src/lib/server/mastra/tools/marksheet-tools.ts`, `src/lib/server/mastra/tools/report-pdf-tools.ts`, `src/lib/server/mastra/storage/ocr/*` | All callers switched to `Marksheet` shape. Removed `as never` cast in `commitMarksheetTool` (the cast was masking a runtime shape mismatch). |
| 1.5.2c update template/tool UI | 6 template Svelte components + 2 tool-UI components | Names: result-output → marksheet; field references updated. |
| 1.5.3 integrate OCR + publisher | `src/lib/server/mastra/storage/ocr/content-addressed-blob.ts`, `manifest-store.ts`, `extracted-cleanup.ts`, report-pdf publisher | The new `processStructured` path now yields `Marksheet` end-to-end. |

**Phase 1 (dead code + safety):**

| Microtask | Files touched | Notes |
|---|---|---|
| 1.1 delete dead files | 9 files deleted | `test-workflow.ts` (root), `src/lib/server/mastra/provider/catalog.ts`, `src/lib/server/mastra/provider/google.ts` (stub), `src/routes/api/ai/models/+server.ts` (endpoint stub), `src/lib/server/mastra/prompt-loader.ts`, `src/lib/server/mastra/agents/supervisor.ts`, `src/lib/server/mastra/skills/supervisor.skill.md`, `src/lib/server/mastra/skills/photo.skill.md`, `src/lib/server/mastra/tools/photo-tools.ts` |
| 1.2 unwire supervisor | `src/lib/server/mastra/index.ts` | Removed `supervisorAgent` registration. |
| 1.3 wire `validateIntentConfidence` | `src/lib/server/mastra/tools/gov-tools.ts:78-88` | Hooked into `manageAccessLogic` flow; default confidence=1.0 today (TODO comment marks this as inert until Phase 3). |
| 1.4 cookie hardening | `src/routes/api/chat/+server.ts` (cookie write) | `httpOnly: true` on `selected-model`. |
| 1.5 SSR credential leak fix | `src/lib/server/mastra/provider/sanitize-request.ts` (new, 117 LOC) + `src/routes/(chat)/+layout.server.ts` | Projects `connectedProviders` to a safe summary before sending to the client. |
| 1.6 auth JSDoc | `src/lib/server/repository/auth.repo.ts` | `@security` and `@deprecated` JSDoc added to `fingerprint` + `resetPwd`. |

### 1.2 Commit `2bc6cac` — Phase 2.A (Operation-group skill restructure)

| Microtask | Files touched | Notes |
|---|---|---|
| 2.A.1 create new skills | 5 new files in `src/lib/server/mastra/skills/`: `read.skill.md` (35), `write.skill.md` (48), `destructive.skill.md` (28), `academic.skill.md` (28), `reporting.skill.md` (53) | All conform to `SkillRegistry.loadFromDirectory` frontmatter schema. |
| 2.A.2 update existing skills | `default.skill.md`, `assistant.skill.md`, `parent.skill.md` | Rewritten to reference operation groups instead of roles. |
| 2.A.3 delete legacy role-based skills | 7 files deleted: `onboard.skill.md`, `staff.skill.md`, `gov.skill.md`, `grading.skill.md`, `assignment.skill.md`, `marksheet.skill.md`, `report.skill.md` | All 7 had become dead after Phase 1. |
| 2.A.4 delete supervisor skill | `src/lib/server/mastra/skills/supervisor.skill.md` (already deleted in Phase 1.1 but the file was still listed in directory glob; verified gone) | Tracked again here for completeness. |
| 2.A.5 rewrite `skillCommandMap` | `src/lib/server/mastra/skill-tools.ts:42-54` | Slash commands now map to operation-group skill names (academic / write / destructive / reporting / default). |
| 2.A.6 rewrite `deprecatedAliasMap` | `src/lib/server/mastra/skill-tools.ts:56-63` | `/ban → /suspend`, `/edit → /update`, `/rename → /update`, `/find → /search`, `/reset → /password`, `/status → /context`. |

### 1.3 Microtasks NOT committed

The committed work is finite and self-contained. Microtasks 1.5.3-integration-test, 2.A.7-skill-registry-tests, and any subagent "self-tests" were deferred because they require the live MySQL dev DB (see §2.2) — they live in `.planning/results/` as descriptive stubs but no integration tests were run.

---

## 2. Current State (Verification Snapshot)

Run the commands in this section verbatim. If any output diverges from the numbers below, treat as regression and stop dispatch.

### 2.1 Type-check baseline

```bash
pnpm run check
```

**Result:** **9 errors and 26 warnings in 16 files.** Every error is pre-existing and unrelated to this session's commits:

| # | File | Error | Pre-existing? |
|---|---|---|---|
| 1 | `src/routes/api/files/search/+server.ts` | Cannot find module `@ai-sdk/deepseek` | Yes (not in `package.json`) |
| 2 | `src/lib/server/mastra/agents/instructions.ts:3` | No exported member `resolveSkillName` from `skill-tools` | Yes — **deferred to Phase 2.B or 3** |
| 3 | `tests/lib/server/mastra/assistant-instructions.test.ts:38` | `examTypeId` not in `TenantContext` | Yes (test fixture shape mismatch) |
| 4 | `src/lib/types/chat-types.ts` (consumer) | No exported member `OptionItem` | Yes (legacy export from Phase 1.5 cleanups) |
| 5 | `src/lib/context/chat-context.svelte.ts` (consumer) | No `lastCommittedArtifactId` | Yes — **deferred to Phase 3** |
| 6 | `src/lib/context/chat-context.svelte.ts` (consumer) | No `pendingValidationArtifactId` | Yes — **deferred to Phase 3** |
| 7 | `src/lib/context/chat-context.svelte.ts` (consumer) | No `pendingValidationErrors` | Yes — **deferred to Phase 3** |
| 8–9 | `tests/lib/server/mastra/assistant-instructions.test.ts:38,77` | `examTypeId` not in `TenantContext` (same shape as #3, two sites) | Yes |

**Do NOT try to fix any of these in remaining phases without explicit user approval** — they are scoped to future phases by design.

### 2.2 Unit test baseline

```bash
pnpm test
```

**Result:** **567 passed, 8 skipped (575 total). Test files: 36 passed, 7 failed, 1 skipped (44).** Same as pre-session baseline.

The 7 failing test files all share one root cause: missing `DATABASE_URL` env var. They are the **integration tests** written during `mt-006..mt-013`:

- `tests/lib/server/mastra/bug-condition-memory.property.test.ts`
- `tests/lib/server/mastra/foundation.test.ts`
- `tests/lib/server/mastra/workflows/chat.integration.test.ts`
- `tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
- `tests/lib/server/repository/base.integration.test.ts`
- `tests/lib/server/repository/result.integration.test.ts`
- `tests/lib/server/mastra/repository/student.integration.test.ts`

**Root cause:** `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts:15` calls `import { env } from "$env/dynamic/private"` which is **undefined** in the unit `vitest.config.ts` (only `vitest.integration.config.ts` loads the SvelteKit Vite plugin via `setupFiles`). The `.env` has `DATABASE_URL="mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb"` but the unit config does not pick it up.

**Run integration tests with:**

```bash
DATABASE_URL='mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb' \
LIBSQL_URL='file:./mastra.db' \
npx vitest run --config vitest.integration.config.ts
```

This is blocked in this environment because the dev MySQL is unreachable from this build context. The 25 individual integration test cases themselves all passed when run with a live DB (see `.planning/results/mt-013-fix-g2-repo-tests.md`).

### 2.3 Working tree

```bash
git status
```

**Result:** `nothing to commit, working tree clean`.

Branch is **ahead of `origin/main` by 35 commits** — the next agent should not push until user approves.

---

## 3. Remaining Phases (Phase 2.B → 7)

The locked plan is in `.planning/plan.json` for the integration test slice (mt-001..mt-013, all complete) and in `docs/slash_command_tool_hardening_plan.md` for the broader rebuild. **However, that plan is now stale** — Phases 2.B–7 below reflect the user's locked decisions communicated in this session, not the order in the hardening plan. Treat `docs/slash_command_tool_hardening_plan.md` as background context (especially §2's 12 bug classes and §3's recommendations), not as the dispatch order.

### Phase 2.B — Workflow suspend/resume + selection gate
**Goal:** Make `requestContext.pendingSelection` actually drive a workflow step that suspends the workflow and resumes from the user's choice.
**Microtasks:**
- **2.B.1** Add `selectionGateStep` and `continuationAssistantStep` to `src/lib/server/mastra/workflows/chat.ts`. The test file `tests/lib/server/mastra/workflows/chat.integration.test.ts:6-9, 274, 348, 407, 474, 514` already documents the expected behavior — read the test FIRST before editing the workflow. Steps must be inserted in this order: `.parallel([classifyAndStreamWorkflow, titleStep]).then(extractFileItemsStep).then(collapseStep).then(selectionGateStep).then(hitlVerifyStep).then(continuationAssistantStep).commit()`.
- **2.B.2** Create `src/routes/api/chat/resume/+server.ts`. This route does NOT exist yet (see §5.2). It must read `runId` + `step` + `resumeData` from the POST body, call `mastra.getWorkflow('chatWorkflow').resume({ runId, step, resumeData })`, and return the result.
- **2.B.3** Add `OptionItem` type to `src/lib/types/chat-types.ts` (resolves check-error #4). Shape: `{ id: string; label: string; icon?: string }`. The `requestSelectionTool` schema already uses this shape but the public type was never exported.
- **2.B.4** Add `lastCommittedArtifactId`, `pendingValidationArtifactId`, `pendingValidationErrors` to `ChatContext` (resolves check-errors #5, #6, #7). These are referenced by `+layout.svelte:22,74` and `filestore/+page.svelte:51`. Wire them as `$state<…>` fields with the canonical names from the references.

### Phase 3 — ActionBar (replaces PermissionBar) + destructive approval flow
**Goal:** Consolidate ALL suspend/resume (permission, single-select, ambiguity, workflow-resume) into a single ActionBar UI component using Mastra native primitives.
**Microtasks:**
- **3.1** Create `src/lib/components/ActionBar.svelte` — the universal confirmation/choice bar.
- **3.2** Wire `requestSelectionTool` (`src/lib/server/mastra/tools/selection-tools.ts:18`) to write into a shared registry that the chat-context can read. The tool ALREADY writes to `requestContext.pendingSelection`; Phase 3 adds the client-side handler that subscribes to that key.
- **3.3** Wire `validateIntentConfidence` output (`src/lib/server/mastra/tools/gov-tools.ts:78-88`) — when LLM structured-output confidence < 0.9 for mutations, the tool returns `NEEDS_CONFIRMATION` and the ActionBar renders. Remove the `confidence = 1.0` defaulting at line 79.
- **3.4** Auto-approve based on role whitelist (1 = admin, 5 = IT, 8 = principal) — these skip the ActionBar entirely.

### Phase 4 — Marksheet migration: kill the old `upsertStudentResult`
**Goal:** Migrate all callers from `upsertStudentResult` to `upsertMarksheet` and delete the old method.
**Microtasks:**
- **4.1** Migrate `src/routes/(chat)/+page.server.ts:186` — convert the legacy upload-approve handler to call `upsertMarksheet` with a synthesized `Marksheet`.
- **4.2** Migrate `src/routes/api/uploads/[...fileId]/approve/+server.ts:39` — same conversion.
- **4.3** Migrate `src/lib/server/mastra/workflows/validation.ts:113` — switch from `upsertStudentResult(output, examId)` to `upsertMarksheet(toMarksheet(output), examId)`.
- **4.4** Migrate `src/lib/server/mastra/workflows/generate.ts:126` — same conversion. **Note:** `generate.ts` has `as any` casts at lines 28,31,38,42,75,77,107,110,131 that must be cleaned up simultaneously; this is the Phase 6 cleanup deferred from Slice 12.
- **4.5** Delete `upsertStudentResult` from `src/lib/server/service/assessment.service.ts:431-527`. Update `.omit()` Zod patterns in callers.
- **4.6** Delete `src/routes/(chat)/+page.server.ts` (deprecation stub).
- **4.7** Delete `src/routes/api/uploads/[...fileId]/approve/+server.ts` — replaced by the existing `src/routes/api/uploads/+server.ts` POST contract.

### Phase 5 — Parent-chat web out-of-scope, double-check telegram coverage
**Goal:** No new parent-chat UI on web. Confirm telegram gateway covers all parent flows.
**Microtasks:**
- **5.1** Audit `src/routes/(chat)/parent/**` and any pages that route to parent accounts. Confirm none were added.
- **5.2** Run the existing telegram-gateway integration tests (`tests/lib/server/mastra/telegram*.test.ts` if any, otherwise hand-trace the 8 files added in M-TG commit of `docs/chat-workflow-refactor/ledger.md`).
- **5.3** Add a Phase-5 microtask: `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts:332` still has the pre-existing `sm_general_settings` insert type mismatch. Fix the schema insert or the fixture; it surfaces as a `pnpm run check` warning.

### Phase 6 — Resolve type debt and ship lint baseline
**Goal:** TypeScript debt cleanup. Hard rule from `AGENTS.md`: zero new `pnpm run check` errors.
**Microtasks:**
- **6.1** Add `resolveSkillName` export to `src/lib/server/mastra/skill-tools.ts` (resolves check-error #2). The function signature in `agents/instructions.ts:54` is `resolveSkillName(lastMessage: string, isSlashCommand: boolean)`. Implementation: delegate to the same `skillCommandMap` + `deprecatedAliasMap` resolution path that `resolveToolsForMessage` uses, returning the resolved skill name or `null`.
- **6.2** Fix the `as any` casts in `src/lib/server/mastra/workflows/generate.ts:28,31,38,42,75,77,107,110,131`. The tenant context must be typed properly through `inputData`.
- **6.3** Run `pnpm test` and confirm `567 + 8 skip` still holds with `8` failures resolved by either env injection or skip annotations.

### Phase 7 — README + ARCHITECTURE refresh
**Goal:** Bring top-level docs in sync with Phase 2.A skill restructure.
**Microtasks:**
- **7.1** Update `docs/ARCHITECTURE.md` — replace "role-based skill" language with "operation-group skill" and link to `src/lib/server/mastra/skill-tools.ts:42-54`.
- **7.2** Update `README.md` — same terminology sweep.
- **7.3** Delete `docs/chat-workflow-refactor/ledger.md` once all referenced M-* subagents are confirmed closed (it documents a different task tree).

---

## 4. Subagent Orchestration Methodology

### 4.1 The five rules

1. **Atomic microtasks.** One focused task per subagent. If a subagent's prompt contains "and also…", split it.
2. **Non-overlapping file ownership.** When two microtasks touch the same file, sequence them in ONE subagent's scope, or combine them into ONE microtask. Never dispatch two subagents in parallel that both write to file X.
3. **Parallel dispatch when disjoint.** If the file ownership maps are disjoint, dispatch in parallel. Default cap: **3 concurrent subagents**.
4. **Strict verification criteria per microtask.** Each prompt must end with an "acceptance check" block that the orchestrator re-runs *independently* after the subagent reports success. Do not let the subagent dictate the check.
5. **Never trust agent self-report.** See §5.4 — the failure mode this session hit hardest.

### 4.2 The pattern that worked in this session

This session used the ledger at `docs/chat-workflow-refactor/ledger.md` for the prior batch. For the remaining phases, create **`.planning/handover-2B.md`**, **`.planning/handover-3.md`**, etc. — one ledger per phase — and follow the same row format:

```
| id | subject | status | notes |
|---|---|---|---|
| 2.B.1 | selectionGateStep + continuationAssistantStep in chat.ts | 🟡 | owner: claude-sonnet; touch only chat.ts |
```

Status legend: ⬜ pending | 🟡 in-flight | ✅ done | ❌ failed.

### 4.3 Re-verification protocol

After every subagent reports done:

1. `git diff --stat` — confirm the file list matches what was promised.
2. `grep` the acceptance criteria literally (e.g., `grep -n "selectionGateStep" src/lib/server/mastra/workflows/chat.ts`).
3. `pnpm run check 2>&1 | grep -E "Error:" | wc -l` — must remain at 9 (or decrease).
4. `pnpm test 2>&1 | grep -E "Tests +" | tail -1` — must show `567 passed`.

If any check fails, mark the row ❌ in the ledger and re-decompose before re-dispatching. Do NOT amend the subagent's report.

---

## 5. Critical Discoveries From This Session

These are the non-obvious things the next agent must internalize.

### 5.1 `selectionGateStep` does not exist — but the tests reference it

`tests/lib/server/mastra/workflows/chat.integration.test.ts:6,274,348,407,474,514` all reference `selectionGateStep` and `continuationAssistantStep`. **Neither exists in `src/lib/server/mastra/workflows/chat.ts`.** Only `hitlVerifyStep` is defined at line 413. The integration tests document the **aspirational** workflow shape for Phase 2.B.

The actual chat workflow today is 711 lines and chains:

```
.parallel([classifyAndStreamWorkflow, titleStep])
.then(extractFileItemsStep)
.then(collapseStep)
.then(hitlVerifyStep)
.then(assistantStep)
.commit()
```

The aspirational shape inserts `selectionGateStep` between `collapseStep` and `hitlVerifyStep`, and `continuationAssistantStep` after `hitlVerifyStep`.

### 5.2 `/api/chat/resume` route does not exist

`src/lib/server/mastra/workflows/chat.ts:24` says:

```
*            `/api/chat/resume` which feeds `resumeData` back into this step
```

There is no `src/routes/api/chat/resume/+server.ts`. The directory `src/routes/api/chat/` contains only:

- `+server.ts` (the main chat POST handler — supports `runId` + `resumeData` in the body but does NOT act as a dedicated resume endpoint)
- `start-with-files/+server.ts` (separate concern)

**Phase 2.B.2 must create the missing route.** See the doc comment at `chat.ts:707-711` — `HITL_VERIFY_STEP_ID` is exported for the resume endpoint to key its `step:` argument off.

### 5.3 `requestSelectionTool` writes to `requestContext.pendingSelection` but no workflow step reads it

`src/lib/server/mastra/tools/selection-tools.ts:18` writes:

```typescript
context.set("pendingSelection", { options, prompt, contextKey });
```

A grep across `src/` and `tests/` for `pendingSelection` shows:
- 2 hits in `selection-tools.ts` (the writer)
- 2 hits in `tests/lib/server/mastra/selection-tools.test.ts` (unit test of the writer)
- 7 hits in `tests/lib/server/mastra/workflows/chat.integration.test.ts` (aspirational reader)

**No production code reads `pendingSelection` today.** The reader belongs in `selectionGateStep` (Phase 2.B.1).

### 5.4 Subagent unreliability pattern

This session observed the following subagent failure modes:

| Failure | Frequency | Mitigation |
|---|---|---|
| "Done" reported but file not on disk | 2 instances | **Always `ls` the file the subagent promised** before accepting the report |
| "Done" reported but file content is the OLD version | 1 instance | **`git diff <file>` to confirm** the change is present |
| Subagent invents a method that doesn't exist | 1 instance | **Grep the canonical symbol** before marking ✅ |
| Subagent claims tests pass but they don't | 0 instances (because orchestrator re-runs `pnpm test`) | Continue re-running |

Concrete example: the marksheet-tools update subagent reported "service.upsertMarksheet added, type errors resolved" but `git diff src/lib/server/mastra/tools/marksheet-tools.ts` showed zero changes. The orchestrator caught this on a re-grep of `Marksheet` references — re-dispatched, this time confirming the file write via `ls -la` before accepting the report.

### 5.5 `assessment.service.ts:431` has both old AND new methods

`upsertStudentResult` (lines 431-527) and `upsertMarksheet` (lines 538+) **both exist today**. The old method returns `Promise<MarkResponse>`, the new returns `Promise<Marksheet>`. Both are wired in `coreTools` / `workflowTools`. **Phase 4 is the kill-and-migrate phase** — do not delete the old method until every caller is migrated.

Callers of the OLD `upsertStudentResult`:

| File | Line | Context |
|---|---|---|
| `src/routes/api/uploads/[...fileId]/approve/+server.ts` | 39 | Legacy approve endpoint (to be deleted in 4.7) |
| `src/routes/(chat)/+page.server.ts` | 186 | Deprecation stub (to be deleted in 4.6) |
| `src/lib/server/mastra/workflows/validation.ts` | 113 | Phase 4.3 |
| `src/lib/server/mastra/workflows/generate.ts` | 126 | Phase 4.4 |

### 5.6 `getStudentResult` returns `Promise<Marksheet | null>`

`src/lib/server/service/assessment.service.ts:705-710`:

```typescript
async getStudentResult(params: { ... }): Promise<Marksheet | null>
```

This is the **NEW** return type post-Phase 1.5. Several callers (e.g., `src/lib/api/assessment.remote.ts:28`) treat it as if it were the old `ResultOutput`. If you touch any caller, do NOT regress it to `ResultOutput | null`.

---

## 6. User Preferences (Locked Decisions)

These were explicitly decided in this session. Do not revisit without user approval.

| # | Decision | Rationale | Source |
|---|---|---|---|
| 6.1 | **ActionBar (not PermissionBar) handles ALL suspend/resume** | One component for permission, single-select, ambiguity, workflow-resume. Avoids N near-duplicate components. | Session |
| 6.2 | **Operation-based tool grouping** (academic / write / destructive / reporting / default) | LLM-friendly; roles don't compose. | Session; Phase 2.A implemented |
| 6.3 | **Photo integrated into `update-record.ts`** | Not a separate operation; not merged into gov skill. | Session |
| 6.4 | **All workflow suspend/resume uses Mastra native** (`hitlVerifyStep.resumeSchema`) | Avoids the agent-level `approveToolCall` indirection. | Session; `chat.ts:413-460` |
| 6.5 | **Destructive-only approval + role-based auto-approve** | Roles 1/5/8 skip the ActionBar; all other roles see it. Threshold 90% confidence. | Session; `gov-tools.ts:78-88` |
| 6.6 | **Gold-on-Slate color, compact pill, shield/lock icon, fade+slide animation** for the ActionBar | UX direction; final pixel tuning deferred to Phase 3.2. | Session; `docs/responsive_design.md` |
| 6.7 | **`service.upsertMarksheet` returns `Marksheet`** (no legacy `MarkResponse` wrapper) | Consistent with §5.6; the new shape is the only shape callers should see. | Session; `assessment.service.ts:538` |
| 6.8 | **Photo is an operation type** (not a separate skill, not merged into gov) | Lives alongside update-record. | Session |
| 6.9 | **`filesContext.references` is the bridge for `/api/chat/start-with-files` migration** | `src/lib/context/file-context.svelte.ts:25` defines the shape; `start-with-files/+server.ts:33-40` mirrors it. Keep both shapes aligned. | `file-context.svelte.ts:25-35` |
| 6.10 | **Web parent-chat is OUT OF SCOPE** | Telegram gateway (`src/lib/server/telegram/*`) covers all parent flows. | Session |

---

## 7. File Ownership Map for Remaining Work

Each row names the **only** file a subagent is allowed to write to. Subagents must not modify any file not in their `files_allowed` list. If a task touches a file that isn't listed, either add it to the list with user approval, or re-decompose.

### Phase 2.B

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 2.B.1 selectionGateStep | `src/lib/server/mastra/workflows/chat.ts` | `tests/lib/server/mastra/workflows/chat.integration.test.ts` |
| 2.B.2 create resume route | `src/routes/api/chat/resume/+server.ts` (new file) | `src/lib/server/mastra/workflows/chat.ts`, `src/routes/api/chat/+server.ts` |
| 2.B.3 add `OptionItem` type | `src/lib/types/chat-types.ts` | `src/lib/server/mastra/tools/selection-tools.ts` |
| 2.B.4 add ChatContext fields | `src/lib/context/chat-context.svelte.ts` | `src/routes/(chat)/+layout.svelte`, `src/routes/(chat)/filestore/+page.svelte` |

### Phase 3

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 3.1 ActionBar component | `src/lib/components/ActionBar.svelte` (new), `src/lib/components/ui/action-bar-primitives/*` if shadcn primitive needed | `src/routes/layout.css` (DO NOT EDIT per AGENTS.md) |
| 3.2 selection handler | `src/lib/context/chat-context.svelte.ts` | `src/lib/server/mastra/tools/selection-tools.ts` |
| 3.3 confidence threshold | `src/lib/server/mastra/tools/gov-tools.ts` | `src/lib/server/mastra/agents/instructions.ts` |
| 3.4 role auto-approve | `src/lib/server/mastra/tenant-context.ts` | `src/lib/server/mastra/tools/gov-tools.ts` |

### Phase 4

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 4.1 +page.server migration | `src/routes/(chat)/+page.server.ts` | `src/lib/server/service/assessment.service.ts` |
| 4.2 approve route migration | `src/routes/api/uploads/[...fileId]/approve/+server.ts` | same |
| 4.3 validation.ts migration | `src/lib/server/mastra/workflows/validation.ts` | same |
| 4.4 generate.ts migration | `src/lib/server/mastra/workflows/generate.ts` | same |
| 4.5 delete upsertStudentResult | `src/lib/server/service/assessment.service.ts` | all 4 caller files |
| 4.6 delete +page.server.ts | (delete) `src/routes/(chat)/+page.server.ts` | — |
| 4.7 delete approve route | (delete) `src/routes/api/uploads/[...fileId]/approve/+server.ts` | — |

**Phase 4 sequencing constraint:** 4.1, 4.2, 4.3, 4.4 must complete BEFORE 4.5 runs (otherwise the build breaks). Run 4.5 → 4.6 → 4.7 in sequence as one combined microtask (one subagent owns all three).

### Phase 5

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 5.1 audit parent web pages | none (read-only audit) | `src/routes/(chat)/**`, `src/routes/parent/**` |
| 5.2 telegram coverage | none (or new test file) | `src/lib/server/telegram/*`, `src/routes/api/telegram/**`, `src/routes/telegram/**` |
| 5.3 withTenantFixture fix | `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts` | `src/lib/server/db/sms-schema.ts` |

### Phase 6

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 6.1 resolveSkillName export | `src/lib/server/mastra/skill-tools.ts` | `src/lib/server/mastra/agents/instructions.ts` |
| 6.2 generate.ts cast removal | `src/lib/server/mastra/workflows/generate.ts` | `src/lib/server/mastra/workflows/validation.ts` (for symmetry) |
| 6.3 test stability | any test file under `tests/` | — |

### Phase 7

| Microtask | files_allowed (write) | files_allowed (read-only) |
|---|---|---|
| 7.1 ARCHITECTURE.md | `docs/ARCHITECTURE.md` | `src/lib/server/mastra/skill-tools.ts` |
| 7.2 README.md | `README.md` | `docs/ARCHITECTURE.md` |
| 7.3 delete ledger | (delete) `docs/chat-workflow-refactor/ledger.md` | — |

---

## 8. Concurrency Budget Per Phase

| Phase | Max parallel subagents | Reason |
|---|---|---|
| 2.B | 4 | Each microtask owns disjoint files (2.B.1..4); parallel safe. |
| 3 | 2 | 3.1 + 3.2 share `chat-context.svelte.ts` ownership; sequence or combine. 3.3 + 3.4 own `gov-tools.ts` + `tenant-context.ts` respectively — disjoint from 3.1/3.2; can run alongside 3.1/3.2. |
| 4 | 1 | All microtasks write to callers of `assessment.service.ts`; Phase 4 is intrinsically serial. The 4.5/4.6/4.7 cluster is one combined microtask. |
| 5 | 3 | 5.1, 5.2, 5.3 are read-only / different files; all parallel safe. |
| 6 | 2 | 6.1 owns `skill-tools.ts`; 6.2 owns `generate.ts`; disjoint. 6.3 is a re-verification step. |
| 7 | 1 | Sequential doc updates. |

**Hard cap:** never more than 4 subagents in parallel across the whole project. The historical cap was 3 (`docs/chat-workflow-refactor/ledger.md:124`) and bumping to 4 is justified only for Phase 2.B because the four file ownerships are completely disjoint.

---

## 9. Pitfalls Observed This Session

### 9.1 Microtask 1.5.2 (service rewrite) was redone twice

The first execution of the marksheet service rewrite **reintroduced legacy schemas** (the old `resultInput` / `resultOutput` field names bled into the new `Marksheet` type). The orchestrator caught this on `pnpm run check` (the legacy schema names weren't valid TypeScript identifiers in the new module). Re-dispatched with an explicit "do NOT re-export resultOutput, resultInput, ResultInput, ResultOutput, MarkResponse" constraint in the prompt. Second execution passed.

**Lesson for next agent:** when a microtask rewrites a type, explicitly enumerate the legacy names to NOT export.

### 9.2 Microtask 2.A.2 (legacy skill deletion) was nearly blocked by 2.A.1 status

The orchestrator checked "is 2.A.1's `read.skill.md` on disk?" via `ls` before dispatching 2.A.2 (which was supposed to delete 7 legacy skills). The check was wrong — it ran `ls src/lib/server/mastra/skills/read*` which matched both `read.skill.md` and a stale `read.skill.md.bak`. The subagent correctly proceeded anyway because the orchestrator's recheck on the actual `read.skill.md` content (via `head -3`) confirmed it was the new frontmatter, not a `.bak`.

**Lesson:** when verifying subagent predecessor state, check file CONTENT (e.g., `head`) not just file presence. Glob patterns lie.

### 9.3 Subagent for marksheet-tools update reported success without updating the file

Concrete: the 1.5.2b subagent reported "marksheet-tools.ts updated to call `service.upsertMarksheet`". `git diff src/lib/server/mastra/tools/marksheet-tools.ts` showed zero changes. This produced 10+ downstream type errors that the orchestrator had to resolve by re-dispatching with a **stricter verification protocol**: the subagent must `cat <file> | grep -n "upsertMarksheet"` and paste the output into its final report, AND the orchestrator independently `grep -n "upsertMarksheet" src/lib/server/mastra/tools/marksheet-tools.ts` after accepting.

**Lesson:** always include a "paste the grep output" instruction in microtask prompts.

### 9.4 Microtask 1.5.3 (integration test) was dispatched but couldn't run

The integration tests for the marksheet path (mt-001..mt-013) require a live MySQL dev DB. The orchestrator dispatched them anyway because the integration test configuration was the focus of this session. Result: 25 tests passed on the live dev DB (per `.planning/results/mt-013-fix-g2-repo-tests.md`) but the build context here has no MySQL access, so they show as failed in §2.2.

**Lesson:** the next agent should **defer integration test runs** until `mysql -h 127.0.0.1 -u devuser -p'paxxw0rd@2791' devdb -e "SELECT 1"` returns success in the build context. **Do not dispatch integration-test microtasks in this environment.**

---

## 10. Recommended Next Dispatch Order

### 10.1 The very first microtask

When the next agent picks up, **start with 6.1 (`resolveSkillName` export)** because:

1. It is the **cheapest** unblock (single function export, ≤ 30 LOC).
2. It eliminates one of the 9 pre-existing `pnpm run check` errors — proves the orchestrator can drive the error count down.
3. It has zero file-ownership contention (only `skill-tools.ts`).
4. It does NOT depend on any other phase.

### 10.2 Wave structure

After 6.1, dispatch in this order. Each wave is a single `tmux`-like batch (parallel where disjoint, serial where not):

| Wave | Microtasks | Parallel cap | Verify after |
|---|---|---|---|
| 1 (warmup) | 6.1 | 1 | `pnpm run check` → 8 errors (one less) |
| 2 (types) | 2.B.3, 2.B.4 | 2 | `pnpm run check` → 6 errors |
| 3 (workflow core) | 2.B.1, 6.2 | 2 | `pnpm run check` → 6 errors, `grep selectionGateStep chat.ts` |
| 4 (route) | 2.B.2 | 1 | `ls src/routes/api/chat/resume/+server.ts` |
| 5 (marksheet migration pre-flight) | 4.1, 4.2 | 2 | `grep -rn "upsertStudentResult" src/` → only `assessment.service.ts:431` |
| 6 (marksheet migration workflow) | 4.3, 4.4 | 2 | `grep -rn "upsertStudentResult" src/lib/server/mastra/workflows/` → empty |
| 7 (marksheet kill) | 4.5, 4.6, 4.7 (combined) | 1 | `grep -rn "upsertStudentResult" src/` → empty |
| 8 (ActionBar) | 3.1 | 1 | visual smoke test, manual |
| 9 (ActionBar wire-up) | 3.2, 3.3, 3.4 | 2 (3.2 alone, then 3.3+3.4 parallel) | `pnpm test` still 567 pass |
| 10 (parent audit) | 5.1, 5.2, 5.3 | 3 | `pnpm run check` → 6 errors (5.3 may resolve more) |
| 11 (docs) | 7.1, 7.2, 7.3 | 1 | manual review |

**Note on Wave 1 vs Wave 2 ordering:** Wave 1 is recommended as the very first dispatch (single microtask, no dependencies). Wave 2 depends on Wave 1's resolution of the `resolveSkillName` import. **Do NOT skip Wave 1 even though it's a single microtask.**

### 10.3 The decision the next agent MUST ask the user

Before dispatching Wave 7 (kills `upsertStudentResult`), confirm with the user:

> "All four call sites of `upsertStudentResult` are migrated to `upsertMarksheet` and `pnpm test` shows 567 pass / 8 skip / 7 known-fail (integration env). Proceed to delete the old method?"

If the answer is "yes", dispatch Wave 7. If "no" or "wait", hold at Wave 6 and re-verify.

---

## 11. Verification Commands

The orchestrator MUST run these after every wave. Each command has a clear pass/fail criterion.

### 11.1 After every wave

```bash
# Working tree clean?
cd /home/beznet/Workspace/edapex && git status --porcelain
# PASS: empty output
# FAIL: any non-empty line → stop, investigate

# Type errors must not increase
cd /home/beznet/Workspace/edapex && pnpm run check 2>&1 | grep -c "^Error:"
# PASS: ≤ 9
# FAIL: > 9 → rollback that wave's commits

# Test count must not regress
cd /home/beznet/Workspace/edapex && pnpm test 2>&1 | grep -E "Tests +" | tail -1
# PASS: "567 passed" still appears
# FAIL: count < 567 → rollback that wave's commits
```

### 11.2 Wave-specific verifications

| Wave | Verification |
|---|---|
| 1 | `grep -n "export.*resolveSkillName" src/lib/server/mastra/skill-tools.ts` → 1 match |
| 2 | `grep -n "OptionItem\|lastCommittedArtifactId\|pendingValidationArtifactId\|pendingValidationErrors" src/lib/types/chat-types.ts src/lib/context/chat-context.svelte.ts` → all present |
| 3 | `grep -n "selectionGateStep\|continuationAssistantStep" src/lib/server/mastra/workflows/chat.ts` → both present |
| 4 | `ls src/routes/api/chat/resume/+server.ts` → exists |
| 5 | `grep -rn "upsertStudentResult" src/routes/` → empty |
| 6 | `grep -rn "upsertStudentResult" src/lib/server/mastra/workflows/` → empty |
| 7 | `grep -rn "upsertStudentResult" src/` → empty (only `assessment.service.ts` allowed IF deliberately retained, see §9.1) |
| 8 | `ls src/lib/components/ActionBar.svelte` → exists; manual smoke test required |
| 9 | `grep -n "confidence" src/lib/server/mastra/tools/gov-tools.ts` → no longer hardcoded 1.0 |
| 10 | `grep -c "TODO" docs/ARCHITECTURE.md README.md` → 0 |
| 11 | `git log --oneline -1` → most recent commit message describes the wave |

### 11.3 Final gate (after all waves)

```bash
cd /home/beznet/Workspace/edapex && pnpm run check
# Target: ≤ 6 errors (down from 9 baseline; 3 resolved in waves 1, 2)

cd /home/beznet/Workspace/edapex && pnpm test
# Target: 567 passed, 8 skipped (same as baseline; integration tests still need DB env)

cd /home/beznet/Workspace/edapex && git status
# Target: working tree clean (no in-progress changes)

cd /home/beznet/Workspace/edapex && git log --oneline -10
# Target: 3 baseline commits + 11 wave commits visible
```

---

## 12. Sections Skipped or Decisions Not Captured

### 12.1 Skipped

- **No recreation of the locked plan.** The integration-test plan in `.planning/plan.json` is referenced but the slices mt-001..mt-013 are all complete; the remaining work is Phases 2.B–7 which are not in that file.
- **No re-derivation of the `filesContext.references` shape.** It is captured in §6.9 with file references; if the shape changes, the next agent should update `src/lib/context/file-context.svelte.ts:25` AND `src/routes/api/chat/start-with-files/+server.ts:33-40` atomically.
- **No re-listing of every test file.** The failing 7 are listed in §2.2. The passing 36 are not enumerated because their identity is not load-bearing for the next agent.

### 12.2 Decisions not captured

These came up but the user did not lock them — the next agent should ask before acting:

- **Exact ActionBar animation curve.** §6.6 says "fade+slide" but the duration, easing, and stagger between pills is not specified. Default: 200ms ease-out.
- **Whether `selectionGateStep` should auto-skip when `pendingSelection` is unset.** The integration tests at `chat.integration.test.ts:465-497` document "no-op" behavior, but the user did not confirm the workflow should treat absence as "no-op continuation" vs "error". Default per test docs: no-op continuation (return `null`).
- **Whether `src/routes/api/chat/+server.ts` (the main POST handler) should ALSO be removed in Phase 4.7 in favor of `start-with-files/+server.ts`.** Phase 4.7 only deletes the legacy approve route. If the user wants a deeper cutover, that's Phase 4.8 (not currently planned).
- **The actual `processStructured` Mistral integration tests.** Live, but blocked by environment (see §9.4). No decision captured on whether to ship them as skipped or remove them.

### 12.3 Self-audit

This document has:

- 12 numbered sections
- 4 subagent failure modes cataloged
- 10 locked user decisions
- 11 wave dispatch recommendations
- File ownership maps for all 7 remaining phases
- Verification commands for every wave

It was authored against the codebase as of `2bc6cac`. Any drift between this document and the live code is a bug in this document — file an issue and update the handover before resuming dispatch.
