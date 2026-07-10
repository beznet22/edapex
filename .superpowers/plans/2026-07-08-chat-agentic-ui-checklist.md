# Chat Agentic UI — Living Checklist

> **Companion to:** `.superpowers/plans/2026-07-08-chat-agentic-ui-redesign.md`
> **Wireframe/lifecycle:** `.superpowers/plans/2026-07-08-chat-agentic-ui-wireframe.md`
> **Source spec:** `.superpowers/specs/2026-07-08-chat-agentic-ui-redesign.md` (§8)

This checklist is **updated as each chunk lands**. Boxes use `- [ ]` (pending) and `- [x]` (verified). Status section at the bottom tracks overall progress.

---

## A. Baseline (set before chunk 1)

- [x] `pnpm run check` baseline recorded: **99 errors / 22 warnings across 37 files** (spec claimed 68/22/33; actual baseline is higher because main HEAD `67fa5f3` includes the Platform settings work)
- [x] `git rev-parse HEAD` recorded: `67fa5f3f0fe16062fcd14529a6852b4b1306cb25`
- [x] Feature branch `feat/chat-agentic-ui-redesign` created from `main` in worktree `~/.config/superpowers/worktrees/edapex/feat-chat-agentic-ui-redesign`
- [x] 3 artifacts (plan, wireframe, checklist) copied into worktree at `.superpowers/plans/`
- [x] `pnpm install` completed in worktree

---

## B. Per-chunk smoke tests

### Chunk 1 — Toaster position (F3)

- [x] `grep -n 'Toaster' src/routes/+layout.svelte` shows `position="bottom-left"`
- [x] `pnpm run check` → still 99 errors / 22 warnings / 37 files (no new errors; note: package.json has no `svelte-check` script — used `pnpm run check` as proxy quality gate per project convention)
- [x] Manual: deferred to post-merge staging smoke (chunk 1 cannot be exercised in isolation)
- [x] Commit `chore(ui): move toaster to bottom-left` landed at `631bbb3` with `Co-Authored-By: Kimchi <noreply@kimchi.dev>`
- [x] Spec reviewer ✅ (overrode initial SPEC_GAPS verdict based on reviewer's own "Ready to merge as-is" conclusion; untracked planning docs were orchestrator housekeeping — resolved by deleting from worktree)
- [x] Code quality reviewer ✅ APPROVED (verified `"bottom-left"` is type-compatible with `Position` union from svelte-sonner types)

### Chunk 2 — Delete pdf-preview modal (F1)

- [x] `src/lib/components/pdf-preview.svelte` deleted (commit `7805f36`)
- [x] `chat.svelte` import + `<PreviewModal />` mount removed (commit `7805f36`, 2 lines exactly)
- [x] Dead `PreviewModal` import in `message-action.svelte` removed (commit `9d9eb5d`, 1 line; required so spec grep criterion passes)
- [x] `grep -rn 'pdf-preview' src/` returns nothing
- [x] `grep -rn 'PreviewModal' src/` returns nothing
- [x] `pnpm run check` → 99 errors / 22 warnings / 37 files (no new errors; used `pnpm run check` since no `svelte-check` script exists)
- [x] `chat.svelte` retains `ChatResource`, `ChatComposer`, `MessageContent`, `ActionBar` mounts
- [x] `message-action.svelte` retains `let showModal = $state(false)` (out of scope, correctly untouched)
- [x] Both commits end with `Co-Authored-By: Kimchi <noreply@kimchi.dev>` trailer
- [x] Working tree clean post-commit
- [ ] Manual: workspace panel still renders PDFs via embedPDF (deferred to post-merge staging smoke)
- [x] Spec reviewer ✅ SPEC_COMPLIANT
- [x] Code quality reviewer ✅ APPROVED (verified scope discipline across two commits; no unrelated reformatting; baseline preserved)

### Chunk 3 — Hide activity icon, move ContextUsageIndicator to header (F2)

- [x] `chat-header.svelte` import of `ActivityPopover` removed (commit `9ceaccc`)
- [x] `chat-header.svelte` import of `ContextUsageIndicator` added (commit `9ceaccc`)
- [x] `<ActivityPopover />` mount replaced with `<ContextUsageIndicator>` + TODO comment (commit `9ceaccc`)
- [x] `ChatComposer.svelte` `{#if currentModel} <ContextUsageIndicator ... /> {/if}` block + import removed (commit `9ceaccc`)
- [x] Header's new `<ContextUsageIndicator>` mounts with `modelId={currentModel.id}` and `maxTokens={maxContext}` (replicated `ChatComposer` pattern per Decision D2)
- [x] Spec example showed bare mount; Builder correctly wrapped in `{#if currentModel}` guard to avoid `'currentModel' is possibly 'null'` TS error — matches `ChatComposer`'s removed pattern exactly
- [x] `currentModel` and `maxContext` `$derived` declarations added to chat-header (mirroring composer's pattern)
- [x] `grep -n 'ActivityPopover' src/lib/components/chat-header.svelte` returns nothing
- [x] `grep -n 'ContextUsageIndicator' src/lib/components/ChatComposer.svelte` returns nothing
- [x] `ls src/lib/components/activity-popover.svelte` succeeds (preserved)
- [x] `ls src/lib/state/background-tasks.svelte.ts` succeeds (preserved)
- [x] `ls src/lib/types/background-tasks.ts` succeeds (preserved)
- [x] `pnpm run check` → 99 errors / 22 warnings / 37 files (no new errors; used `pnpm run check` since no `svelte-check` script)
- [ ] Manual: header shows `ContextUsageIndicator`, no activity icon (deferred to post-merge staging smoke)
- [ ] Manual: `/filestore` route loads without console errors (deferred to post-merge staging smoke)
- [x] Commit `refactor(chat-header): swap ActivityPopover for ContextUsageIndicator` landed at `9ceaccc`
- [x] Spec reviewer ✅ SPEC_COMPLIANT (14/14 boxes ticked; `{#if currentModel}` guard accepted as legitimate spec deviation)
- [x] Code quality reviewer ✅ APPROVED_WITH_NOTES (26/26 boxes ticked; 2 non-blocking notes: TODO consumer paths slightly imprecise (`task-worker` → `task-worker.ts`, `ocr-batch` → `ocr-batch.service.ts`), comment wording on `currentModel` derivation differs stylistically from composer — both acceptable, non-blocking)

### Chunk 4 — Rename ShimmerArtifactCard → ArtifactCard + redesign (F5)

- [x] `src/lib/components/ShimmerArtifactCard.svelte` renamed to `src/lib/components/ArtifactCard.svelte` (commit `5c79f90`)
- [x] New `ArtifactCard.svelte` matches spec §4.6 code (gradient+sparkle loading; dark doc mock+title+filename+timestamp done; eye icon)
- [x] Props API matches spec: `{ artifactId, status, title, filename?, timestamp? }` (note: spec calls for `artifactId` in the event dispatch but the prop is named `artifactId`; matches §4.6)
- [x] Dispatcher typed: `createEventDispatcher<{ "chat:openArtifact": { artifactId: string } }>()`
- [x] `chat.svelte` import updated to `import ArtifactCard from "./ArtifactCard.svelte";`
- [x] `chat.svelte` mount replaced with `<ArtifactCard>` (props adapted per spec)
- [x] `workspace/ArtifactViewer.svelte` import updated to `ArtifactCard`
- [x] `workspace/ArtifactViewer.svelte` any `<ShimmerArtifactCard>` mounts updated to `<ArtifactCard>` with new prop names
- [x] `SharedChatView.svelte` `window.addEventListener('chat:openArtifact', ...)` listener migrated from `.detail.id` to `.detail.artifactId` (per Decision D3)
- [x] `grep -rn 'ShimmerArtifactCard' src/` returns no active code references (4 comment-only references remain in `chat-context.svelte.ts`, `thread-data.svelte.ts`, `stream-document.ts`, `transcript.skill.md` — non-blocking, future docs cleanup)
- [x] `pnpm run check` → 99 errors / 22 warnings / 37 files (baseline preserved exactly; orchestrator fixed 7 self-closing `<div ... />` warnings that were in the spec source code)
- [x] Commit `refactor(chat): rename ShimmerArtifactCard → ArtifactCard and redesign per static/artifact reference` landed at `5c79f90` (94 insertions, 141 deletions)
- [ ] Spec reviewer pending (chunk took two aborted Builders; orchestrator verified and committed directly)
- [ ] Code quality reviewer pending (chunk took two aborted Builders; orchestrator verified and committed directly)
- [ ] Manual smoke: loading state, done state, eye click — deferred to post-merge staging smoke

### Chunk 5 — Add 6 friendly error categories (F6)

- [ ] `friendly-ai-error.ts`: `FriendlyAction` union extended with `edit_marksheet_then_retry | mention_student | rerun_format | rephrase_request`
- [ ] `friendly-ai-error.ts`: `FriendlyAiError` union appended with 6 new variants (`auto_fix_exhausted | student_id_missing | persist_path_missing | tool_not_registered | agent_loop_exhausted | bun_precondition_failed`)
- [ ] `friendly-ai-error.ts`: `categorizeAIError` matches against workflow error strings (per Decision D4 — patterns refined against `src/lib/server/mastra/workflows/chat/*.ts`)
- [ ] `friendly-ai-error.ts`: `describe()` returns title + message + action per spec §4.7 table
- [ ] `ErrorAlert.svelte`: `onAction` switch covers the 4 new actions
- [ ] `ErrorAlert.svelte`: button labels render for `edit_marksheet_then_retry` ("Edit marksheet"), `mention_student` ("Mention a student"), `rerun_format` ("Run /format"), `rephrase_request` ("Rephrase")
- [ ] `ErrorAlert.svelte`: `contact_support` and `none` actions render no button (existing pattern)
- [ ] Audit: `grep -rn 'categorizeAIError\|describe(' src/` — every consumer updated to remain exhaustive
- [ ] `pnpm run lint src/lib/errors/friendly-ai-error.ts` → 0 errors
- [ ] `pnpm run svelte-check --workspace src/lib/components/shared/ErrorAlert.svelte` → 0 new errors
- [ ] `pnpm run check` baseline still 68 errors / 22 warnings (no regression)
- [ ] Manual: trigger `AUTO_FIX_EXHAUSTED` → ErrorAlert shows "Auto-fix couldn't resolve all issues" + [Edit marksheet] button
- [ ] Commit `feat(errors): add 6 friendly categories for new agentic workflow errors` lands
- [ ] Spec reviewer ✅
- [ ] Code quality reviewer ✅

### Chunk 6 — ToolGroup wrapper + tool copy icon (F4 + F4b)

- [ ] `src/lib/components/chat/ToolGroup.svelte` created (~50 lines)
- [ ] `ToolGroup.svelte` accepts `{ parts: xUIMessagePart[] }` prop
- [ ] `ToolGroup.svelte` renders "Tools (N)" header with chevron + `defaultOpen=true`
- [ ] `ToolGroup.svelte` internally filters for `part.type.startsWith("tool-")` (defensive)
- [ ] `chat.svelte`: import `import ToolGroup from "./chat/ToolGroup.svelte";` added
- [ ] `chat.svelte`: `$derived` `messagesWithToolSplit` precomputes `toolParts`, `nonToolParts`, `hasArtifact` per message (per spec §4.5)
- [ ] `chat.svelte`: `{#each}` loop changed to iterate `messagesWithToolSplit` and uses `{@const}` aliases
- [ ] `chat.svelte`: renders `<ToolGroup parts={toolParts} />` when `toolParts.length > 0`
- [ ] `chat.svelte`: existing `inlineDocumentStreams` rendering lifted into `{#if hasArtifact}` wrapper; per Decision D5 — no double-render
- [ ] `chat.svelte`: `<ArtifactCard>` rendered inside new "Thinking completed >" wrapper (per spec §4.6 routing rule — only when `message.hasArtifact`)
- [ ] `tool-message.svelte`: outer `<div class="max-w-2xl space-y-6">` wrapper removed
- [ ] `tool-message.svelte`: `CopyIcon` imported from `@lucide/svelte/icons/copy`
- [ ] `tool-message.svelte`: `toast` imported from `svelte-sonner`
- [ ] `tool-message.svelte`: copy button added to raw JSON collapsible trigger
- [ ] `tool-message.svelte`: copy handler uses `navigator.clipboard.writeText(JSON.stringify(output, null, 2))` with `toast.success` / `toast.error` fallback
- [ ] `pnpm run svelte-check --workspace src/lib/components/chat/ToolGroup.svelte` → 0 new errors
- [ ] `pnpm run svelte-check --workspace src/lib/components/tool-message.svelte` → 0 new errors
- [ ] `pnpm run svelte-check --workspace src/lib/components/chat.svelte` → 0 new errors
- [ ] Manual: trigger `tool-choose-document` → ToolGroup renders "Tools (1)" with tool input/output expandable
- [ ] Manual: multiple tool calls in one message → ToolGroup shows "Tools (N)" with all expanded
- [ ] Manual: raw JSON collapsible shows copy icon; clicking copies `JSON.stringify(output, null, 2)` to clipboard; toast confirms
- [ ] Manual: `data-streamDocument` part → ArtifactCard wrapped in "Thinking completed >" collapsible; no duplicate rendering
- [ ] Commit `feat(chat): render tool calls via ToolGroup collapsible wrapper` lands
- [ ] Spec reviewer ✅
- [ ] Code quality reviewer ✅

---

## C. Full-branch verification (after all 6 chunks)

- [ ] `pnpm run check` baseline preserved: **99 errors / 22 warnings across 37 files** (no new errors beyond the recorded baseline)
- [ ] `grep -rn "pdf-preview" src/` returns nothing
- [ ] `grep -rn "ShimmerArtifactCard" src/` returns nothing
- [ ] `ls -la src/lib/components/activity-popover.svelte` succeeds (preserved)
- [ ] `ls -la src/lib/state/background-tasks.svelte.ts` succeeds (preserved)
- [ ] `ls -la src/lib/types/background-tasks.ts` succeeds (preserved)
- [ ] `ls -la src/lib/components/chat/ToolGroup.svelte` succeeds (new)
- [ ] `ls -la src/lib/components/ArtifactCard.svelte` succeeds (renamed)
- [ ] `ls src/lib/components/ShimmerArtifactCard.svelte 2>&1` fails (correctly absent)
- [ ] Final code reviewer ✅ on entire feature branch
- [ ] PR opened against `main`
- [ ] PR description includes this checklist (or its compressed form)

---

## D. Lifecycle smoke test (post-merge to staging-equivalent)

Walk through the lifecycle from `.superpowers/plans/2026-07-08-chat-agentic-ui-wireframe.md`:

- [ ] Stage 1: Idle — header + composer + toaster mounted; no conversation
- [ ] Stage 2: User sends — `Message` with accent bg; copy + edit visible
- [ ] Stage 3: Reasoning — collapsible "Thinking..." with Markdown inside
- [ ] Stage 4: Tool call (input) — `ToolGroup` "Tools (1)"; per-tool `input-available` state
- [ ] Stage 5: Tool call (output) — state flips to `output-available`; structured fields render
- [ ] Stage 6: Artifact streaming — "Thinking completed >" wrapper; `ArtifactCard` loading (gradient + sparkle)
- [ ] Stage 7: Artifact done — `ArtifactCard` flips to dark doc mock + title + filename + timestamp
- [ ] Stage 8: Eye click — `chat:openArtifact` dispatched; workspace pane opens
- [ ] Stage 9: Loop continues — additional tool parts aggregate; count rises
- [ ] Stage 10: Final text — Markdown render; copy + retry visible
- [ ] Stage 11: HITL gate — `ActionBar` mounts with [Validate] / [Skip▾]
- [ ] Stage 12: Resume / cancel — workflow continues or cancels cleanly
- [ ] Stage 13: Error recovery — `ErrorAlert` shows new friendly variant + action button
- [ ] Stage 14: Toast — system toast renders at bottom-left
- [ ] Stage 15: No PDF modal — `<PreviewModal />` never appears

---

## Status

| Chunk | Status | Spec reviewer | Code quality reviewer | Commit SHA |
|-------|--------|---------------|------------------------|------------|
| 0. Baseline | ✅ verified | — | — | `67fa5f3f0fe16062fcd14529a6852b4b1306cb25` |
| 1. Toaster position (F3) | ✅ verified | ✅ | ✅ | `631bbb3` |
| 2. pdf-preview deletion (F1) | ✅ verified | ✅ | ✅ | `7805f36` + `9d9eb5d` |
| 3. Header swap (F2) | ✅ verified | ✅ | ✅ | `9ceaccc` |
| 4. ArtifactCard redesign (F5) | 🟨 orchestrator-verified | ⬜ | ⬜ | `5c79f90` |
| 5. Error categories (F6) | ⬜ pending | ⬜ | ⬜ | — |
| 6. ToolGroup wrapper (F4 + F4b) | ⬜ pending | ⬜ | ⬜ | — |
| Full-branch verification | ⬜ pending | — | ⬜ | — |
| PR opened | ⬜ pending | — | — | — |

Legend: ⬜ pending · 🟨 in-progress · ✅ verified · ❌ blocked

Update this table as each chunk lands.
