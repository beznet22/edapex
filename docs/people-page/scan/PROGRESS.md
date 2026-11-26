# PWA Document Scanner — Implementation Progress

Tracker for `~/.commandcode/plans/pwa-document-scanner-v3.md` (**plan v3**, 858 lines).

Read the plan for design and measurements; this file only records delivery state. Every row below
names the plan section it implements, so the two can be diffed.

- **Started:** 2026-11-25
- **Plan version:** v3 (adapts [`pwa-document-scanner-overview-v3.md`](pwa-document-scanner-overview-v3.md))
- **Legend:** ✅ done · 🟡 in progress · ⬜ not started · 🔴 blocked

## Documents in this folder

| File | Role |
| --- | --- |
| [`pwa-document-scanner-overview-v3.md`](pwa-document-scanner-overview-v3.md) | Owner's origin spec. Camera UX, state matrix, sync model. |
| [`base-reference-camera-view.png`](base-reference-camera-view.png) | Base camera screen every overlay in §2 is layered onto. Close `×` top-left, torch top-right, gallery bottom-left, shutter bottom-center. |
| `PROGRESS.md` | This file — delivery state. |

> Conflict rule: the plan wins on extraction/transport/storage (it is measured); the spec wins on
> camera UX intent. Where they disagree — e.g. the spec still names `jscanify`/`opencv.js` and
> `Mistral OCR`, which the plan drops — the plan is authoritative, and §2 of the spec should be
> read with those substitutions.

## Locked decisions this tracker assumes

From the plan's "Decisions locked" table — a row is only ✅ if it matches these:

| Decision | Locked value |
| --- | --- |
| Surface | `/people` → Students tab |
| Extraction | `deepseek-flash` via raw `fetch` to `/v1/responses` + strict `json_schema` |
| Fallback | `gemini-3.5-flash-lite` on DeepSeek 5xx |
| Draft storage | `teacher_remarks.metadata` (new nullable column) |
| Status keys | `committed`/`failed` internally; `Uploaded`/`Error` in UI |
| Compression | existing `compressImage`, 1600 px / q0.80, `maxSizeKB: 0` |
| Image pipeline | no opencv/jscanify; blur gate only |
| Schema change | hand-written SQL, never `drizzle-kit push` |

## UI rules (non-negotiable)

Enforced on every scan component. A component is not done until all four hold:

| Rule | How it is checked |
| --- | --- |
| **Design tokens only** — colour, radius, spacing come from `src/routes/layout.css` | No palette classes (`bg-amber-500`, `text-sky-700`, …), no raw `#hex`, `rgb()`, or literal `oklch()` in any `.svelte` file |
| **shadcn-svelte primitives first** | `Button`, `Input`, `Textarea`, `Label`, `Badge`, `Alert`, `Spinner`, `DropdownMenu`, `Select`, `ResponsiveSheet`. A raw element is allowed only where shadcn ships no primitive (e.g. `<table>`, which the library does not provide) |
| **No custom component without need** | Custom only for genuinely new behaviour (camera viewfinder, marks grid). Anything that is "a button that looks different" is a `Button` with a variant |
| **Light + dark both from tokens** | No `dark:` overrides that hardcode a palette; dark mode is the `.dark` token block |

Audit command used to verify (scans **all** of `components/people/`, not just the scanner folder):

```bash
grep -rn "<button\|<textarea\|<select" src/lib/components/people/
grep -rnE "\b(bg|text|border|ring)-(amber|sky|emerald|red|green|blue|yellow|slate|gray|zinc|neutral|violet|purple|orange|teal|cyan|indigo|rose|pink)-[0-9]" src/lib/components/people/
```

> **2026-11-25 — scope widened.** The migration started with the four scan components, then the
> whole `people/` folder was brought onto the same rule at the owner's request. Every raw
> `<button>` in `src/lib/components/people/` is gone (0 remaining).

## Pre-work (§3a–3c) — complete

| Item | Plan ref | Status | Evidence |
| --- | --- | --- | --- |
| Provider A/B | §3a | ✅ | DeepSeek 112/114, 2.98 s, $0.29/1k |
| Endpoint + transport | §5 | ✅ | `/v1/responses` strict; AI SDK drops images |
| Degradation sweep | §3b | ✅ | 30° skew 1/32; 16 px blur 32/32 |
| Compression on real canvas | §3c | ✅ | Chrome 209–224 KB; 2/114 identical to proxy |

## Delivery — mapped to the plan's gates

The plan defines four gates (§6); work is chunked underneath them. A gate is only complete when its
**exit criterion** in the plan is satisfied.

### Gate 1 — capture → draft → commit → publish (`§6 Gate 1`)
Target: 6 documents minimum, 0 silent mis-grades, 2 known errors visibly catchable.

| # | Chunk | Plan ref | Status | Started | Completed |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Migration SQL + `metadata` declaration | §4 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.2 | `scan-types.ts` (envelope, parse/serialize) | §1 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.3 | `scan-extraction-schema.ts` (paper-shaped Zod) | §5 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.4 | `scan-status.ts` (matrix + stale `queued`) | §2 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.5 | `scan-access.ts` (`assertScanScope`) | §7 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.6 | `scan-store.ts` (metadata r/w + paths) | §1 | ✅ | 2026-11-25 | 2026-11-25 |
| 1.7 | Unit tests: envelope/status/access/schema/paths | §9.2 | ✅ | 2026-11-25 | 2026-11-25 |
| 2.1 | `scan-prompt.ts`, `scan-budget.ts` | §5, risk 12 | ✅ | 2026-11-25 | 2026-11-25 |
| 2.2 | `scan-extract.ts` (DeepSeek + 1 auto re-extract) | §5, risk 13 | ✅ | 2026-11-25 | 2026-11-25 |
| 2.3 | `scan-mapper.ts` + `scan-subject-match.ts` (compose → validate) | §5a | ✅ | 2026-11-25 | 2026-11-25 |
| 2.4 | `scan-capture.ts` + capture/extract/status/image routes | §5 | ✅ | 2026-11-25 | 2026-11-25 |
| 2.5 | Provider + mapper unit tests | §9.3, §9.10 | ✅ | 2026-11-25 | 2026-11-25 |
| 3.1 | `scan-commit.ts` + metadata re-upsert | §5, risk 7 | ✅ | 2026-11-25 | 2026-11-25 |
| 3.2 | `scan-publish.ts` | §5, risk 11 | ✅ | 2026-11-25 | 2026-11-25 |
| 3.3 | Duplicate-send handling (envelope idempotency, no shared-code change) | §5 | ✅ | 2026-11-25 | 2026-11-25 |
| 3.4 | Live DB pass + fixture restore | §9.4 | ✅ | 2026-11-25 | 2026-11-25 |
| **G1** | **Gate 1 exit criterion (6 docs)** | §6 Gate 1 | ⬜ | — | — |

### Gate 2 — capture quality, auto-capture, auto-advance (`§6 Gate 2`)

| # | Chunk | Plan ref | Status |
| --- | --- | --- | --- |
| 5.1 | `capture-quality.ts` (Laplacian blur + stability) | §6 Gate 2.2 | ✅ 2026-11-25 |
| 5.2 | `scan-compress.ts` (1600 px wrapper) | §3c | ✅ 2026-11-25 |
| 5.3 | `capture-feedback.ts` (audio + haptics) | §6 Gate 2.4 | ✅ 2026-11-25 |
| 5.4 | Viewfinder, context pill, capture dock | §3 components | ✅ 2026-11-25 |
| 5.5 | Auto-advance + **confirmation** (Undo dropped by owner) | §6 Gate 2.5 | ✅ 2026-11-25 |
| 5.6 | `torch.ts` — narrow typed adapter (torch is absent from the DOM lib) | §2A | ✅ 2026-11-25 |
| 5.8 | ~~Undo~~ — **removed** (owner decision, see Decision log) | spec §2C | ✅ 2026-11-25 |
| 5.7 | Scanner route `/(chat)/people/scan/[studentId]` (load + page) | §3 routes | ✅ 2026-11-25 |
| **G2** | **Gate 2 exit criterion — needs a physical device** | §6 Gate 2 | 🔴 2026-11-25 |

### Gate 3 — offline + multi-device (`§6 Gate 3`)

| # | Chunk | Plan ref | Status |
| --- | --- | --- | --- |
| 6.1 | `scan-queue.ts` (IndexedDB) + offline banner | §6 Gate 3 | ✅ 2026-11-25 |
| 6.2 | Replay through idempotent capture → extract | §6 Gate 3 | ✅ 2026-11-25 |
| 6.3 | Cross-device resume test | §9.5 | 🔴 2026-11-25 |
| **G3** | **Gate 3 exit criterion — needs two devices** | §6 Gate 3 | 🔴 2026-11-25 |

### Gate 4 — matrix, bulk, PDF viewer, retention (`§6 Gate 4`)

| # | Chunk | Plan ref | Status |
| --- | --- | --- | --- |
| 4.1 | `/people` term selector + `Marks` column | §3 modified | ✅ 2026-11-25 |
| 4.2 | `scan-status-badge`, `scan-row-actions` | §3 components | ✅ 2026-11-25 |
| 4.3 | `exam` URL param + `StudentFilters.examTypeId` | §3 modified | ✅ 2026-11-25 |
| 4.4 | `people-load.ts` — `examTypes`, `selectedExamTypeId`, `scanCounts`, per-row status | §3 modified | ✅ 2026-11-25 |
| 4.5 | `+page.svelte` handlers: capture / review / publish-all / exam select | §3 modified | ✅ 2026-11-25 |
| 4.6 | Toolbar gating per spec §4B (`Batch Scan Ungraded`, `Publish All Uploaded (X/Y)`, drafts badge) | spec §4B | ✅ 2026-11-25 |
| 5.6 | `marks-review-sheet` + `marks-cell-editor` | §6 Gate 1.4 | ✅ 2026-11-25 |
| 6.4 | Bulk publish with per-row outcomes | §6 Gate 4 | ✅ 2026-11-25 |
| 6.5 | `pdf-preview-sheet` + `GET /api/people/marks/pdf/[studentId]` | §6 Gate 4 | ✅ 2026-11-25 |
| 6.6 | Full row-action gating matrix | §6 Gate 4 | ✅ 2026-11-25 |
| **G4** | **Gate 4 exit criterion** | §6 Gate 4 | ⬜ |

## Decision log

Deviations from the spec or plan, with the reason. Nothing here overrides a measurement.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-25 | **No Undo after capture** (spec §2C specified a 3 s Undo/Retake). Confirmation toast instead. | Extraction is dispatched immediately, so by the time Undo is tappable the request is server-side and cannot be safely cancelled. Offering it would be a fake affordance. Owner-approved. |
| 2026-11-25 | Reuse `AssessmentPublisherService` rather than a ~300-line publisher copy (plan §3, risk 11). | It already takes `studentIds[]`, handles concurrency and writes the `exam-<id>-<messageId>` timeline row. Removes the duplicate-code drift risk entirely. |
| 2026-11-25 | Publish calls `resend: true` and enforces idempotency from the envelope, instead of changing the shared duplicate-send matcher. | Changing `isEmailAlreadySent` would alter legacy publish behaviour for every existing flow; the owner's rule is additive-only. |
| 2026-11-25 | Name-led identity matching; admission number is weak corroboration only. | Teachers misremember or omit admission numbers but do not forget whose book they are holding. A wrong number never raises a warning by itself. |
| 2026-11-25 | Exact subject-code matching only; no contains/fuzzy fallback. | Live collisions (`CL/VR`+`JP/LIT`, `PSRN`+`PSRN/QR`) would go ambiguous, and every assigned code in the active year is printed verbatim on the paper — so the fuzzy layer could only break a clean match. |

## Blocked / external

| Item | Blocks | Plan ref |
| --- | --- | --- |
| GRADEK + MIDDLEBASIC log books | Gate 1 target (6-doc minimum can proceed) | §6 Gate 1 |
| Funded DeepSeek credit | Full accuracy rehearsal | §3a |
| Physical device | Camera/torch/haptics/iOS canvas | §3c, §9.8 |

## Issues found and fixed

| Date | Issue | Fix |
| --- | --- | --- |
| 2026-11-25 | Plan §4 assumed MySQL 8, but dev is **MariaDB 11.5.2**. `ADD COLUMN IF NOT EXISTS` is MariaDB-only; MySQL 8 rejects it. | Rewrote the guard as `information_schema` + `PREPARE`, which is identical on both engines. |
| 2026-11-25 | My first ledger insert used `INSERT ... SELECT 'x', MAX(batch)+1 FROM migrations WHERE NOT EXISTS (...)`. An aggregate with no `GROUP BY` **always** returns one row, so the guard never blocked and wrote `batch=1`. Three rows landed (one correct, two from a clone dry-run that also wrote the real ledger). | Switched to `FROM DUAL` + scalar subquery; deleted the two stray batch-1 rows; re-ran to prove a no-op. Ledger now 350 rows, exactly one for this migration. |
| 2026-11-25 | Zod **strips** unknown keys rather than rejecting them, so a hallucinated `category` is silently discarded, not surfaced. | Test corrected to assert stripping; provider is told `additionalProperties: false` so the model is still constrained at the API boundary. |
| 2026-11-25 | `scan-store` file helpers hardcoded `process.cwd()`, so tests would have written into the real `storage/marks-scans/`. | Added an optional `cwd` to `saveScanFile` / `readScanFile` / `scanFileExists`; tests use a temp dir. Verified real `storage/` stays absent. |
| 2026-11-25 | My mapper test asserted NURSERY grades on the LOWERBASIC scale (expected "A", got "EXCEEDING"). | Test was wrong, not the code: NURSERY/GRADEK/DAYCARE use EYFS ranges. Corrected the assertion and pinned both scales. |
| 2026-11-25 | Plan §5 shows a flat extraction JSON (`fullName` at root) while §5a describes `student.*` fields. | Implemented the **nested `student`** shape, because that is the shape actually measured at 112/114. Recorded as a deviation. |
| 2026-11-25 | `createEnvelope` was passed `width: 0, height: 0`, which its own schema rejects (`positive()`), so every capture produced an unparseable envelope. | Added `readJpegDimensions` (SOF marker) and `readPngDimensions` (IHDR); capture now records real dimensions and fails with `MISSING_DIMENSIONS` rather than writing a broken envelope. |
| 2026-11-25 | **`sm_exam_setups` accumulates titles across years/categories** — a LOWERBASIC class returned 8 titles including NURSERY-only `ORAL`/`PSYCHO`. The mapper used them verbatim, so `marksheetSchema` rejected every record ("more titles than allowed"). | `titles` is now the **category's canonical order filtered to columns the paper shows**. Stale setup titles are ignored; a genuinely missing expected column becomes a warning. Regression test added. |
| 2026-11-25 | `sm_students` has no `gender` column (it is `gender_id`) and `sm_parents` uses `guardians_email`/`guardians_name`. | Corrected in `scan-facts.ts`; gender currently persists as the numeric id string. |
| 2026-11-25 | **Duplicate-send is not latent — it blocks the first publish.** `upsertMarksheet` writes `exam-<id>` (`visible_to_student = 0`); `isEmailAlreadySent` matches `startsWith("exam-<id>")`, so every committed student reads as "already sent". Verified live: 3,542 bare rows exist. | Plan §5 prescribed changing the shared matcher to `exam-<id>-` + `visible=1`. **Not done** — that would alter legacy publish behaviour for every existing flow, and the owner's rule is additive-only. Instead `scan-publish.ts` calls the publisher with `resend: true` and enforces idempotency itself: publish only from `committed`, move to `published` immediately after send. No shared code touched. **Flagged for the owner** as a real (pre-existing) bug worth fixing separately. |
| 2026-11-25 | Plan §3 said `scan-publish.ts` would be a ~300-line copy of the publisher. | Reused `AssessmentPublisherService.publishResults` instead — it already takes `studentIds[]`, handles concurrency and writes the `exam-<id>-<messageId>` timeline row. Removes risk 11 (duplicate code drifting) entirely. |
| 2026-11-25 | **Gender stored as the numeric id string** (`"1"`) in the envelope. Not visible in the PDF (the template never renders gender), but it disagreed with `getStudentResult`, which stores `genderName`. | Resolved via `sm_base_setups` in `scan-facts.ts` → `"Male"`. Both paths now produce the same value, so a draft rendered from the envelope cannot diverge from a committed render. |
| 2026-11-25 | `ResultTemplate` renders the **DB** student name, not the paper's (`SHINDARA…` not `AMIRA…`), because `upsertMarksheet` only overwrites `full_name` when the marksheet name differs — and my mapper uses the DB name. | Correct as-is: the paper's name lands in `teacherRemark` only. Confirmed the PDF shows the DB name and the scanned marks together. |
| 2026-11-25 | **Grade was computed on the raw total, not the percentage.** `doProcessMarks` grades `subjectPercentageMark(total, fullTotal)`; the mapper graded `totalScore`. | Fixed to grade the percentage. Latent while every column is present (each category's maximums sum to exactly 100), but real when a column is missing: 85/90 is 94% → A, versus a raw-total grade of C. Tests pin both the missing-column and full-page cases. Note the **persisted** grade is still computed by the pipeline, so this only affected the review grid and the stored envelope. |
| 2026-11-25 | `AssessmentPublisherService.publishResults({ examId })` is really the **term** id, despite the name — it flows into `getStudentResult` → `queryResultData` → `sm_result_stores.exam_type_id`. | My call was already correct (`examId: input.examTypeId`), but only because I read the chain. Added a comment at the call site documenting the trap: `sm_exam_types.id` and `sm_exams.id` overlap, so an `sm_exams.id` would silently publish the wrong term instead of failing. |
| 2026-11-25 | Mapper hit 409 lines (cap is 400). | Split pure subject matching into `scan-subject-match.ts` (69); mapper is 344. |
| 2026-11-25 | **Single-token name scored 1.000 and passed silently** — a paper reading only the surname matched any pupil sharing it. Found while verifying the identity method. | One-token papers are now capped at `uncertain` with an explicit "only one name was read" warning. |
| 2026-11-25 | `PeopleSelect` has no `label` prop (used `ariaLabel`), and `+page.svelte` never imported `StudentRosterRow`. | Both fixed; check back to 0 errors. |
| 2026-11-25 | `marks-cell-editor` resynced `raw` from `value` unconditionally, which would clobber a teacher's in-progress typing. | Effects now resync only when the incoming value parses differently from the current input. |
| 2026-11-25 | `marksheetSchema.remark` is optional, so `bind:value={draft.remark.remark}` failed typecheck. | Switched to a guarded `value`/`oninput` pair that writes `{ remark }` and tolerates `undefined`. |
| 2026-11-25 | **The paper's own name is not persisted in the envelope** (identity always comes from the DB), so the review grid cannot show a paper-vs-DB mismatch after the fact. | `composeMarksheet` returns `paperIdentity`, but the envelope has nowhere to keep it without widening the schema. The grid warns only from live extraction. **Open gap** — options: store `paperIdentity` in `validation`, or surface it at extract time only. |
| 2026-11-25 | Review sheet was wired to a `/api/people/marks/draft` route that did not exist. | Added the route; it reads the envelope, refuses via `assertScanScope`, and returns the image URL only once the capture is past `queued`. |
| 2026-11-25 | **Initial blur threshold of 90 would have admitted 4 px blur** — measured at 107, which already costs accuracy. Caught by running the metric against the real scans in Chrome before shipping it. | Raised to 900: above the worst blurred frame, far below the softest real scan (5,909). Test asserts the threshold sits between the two measured populations. |
| 2026-11-25 | **The camera could never start.** `scan-viewfinder` bound `<video>` to its own private `videoEl` prop and never returned it; the parent's `video` stayed `null` forever, so `getUserMedia` attached the stream to nothing and every quality check bailed out early. | `video` is now a `$bindable` prop bound with `bind:this`, the stream is passed down, and the child attaches it. Found by review, not by a test — this is exactly the class of bug only a device run would otherwise catch. |
| 2026-11-25 | **Batch publish padded every row with the first student's class.** `publishScans` built one publisher from `loadScanFacts(eligible[0])` and reused it for the whole batch; the publisher reads `tenant.classId`/`sectionId` when looking up assigned subjects. | Now groups eligible students by class/section and builds one publisher per class. |
| 2026-11-25 | **Offline queue stored the raw 12 MP frame** (~1–2 MB) instead of the compressed ~220 KB JPEG, which would exhaust the IndexedDB budget after a handful of pages. | `compressScan` now runs before `enqueueCapture`. |
| 2026-11-25 | `GET /api/people/marks/pdf/[studentId]` called `resolveScanRequest`/`requireNumber` outside `guard()`, so a bad query param produced an unhandled 500 rather than a clean 4xx. | Wrapped in `guard`, matching every other marks route. |
| 2026-11-25 | **`extract` would overwrite a verified marksheet.** It had no status guard, so calling it on a `committed` row replaced `committed` with an unreviewed `draft`. **`capture` likewise reset `committed`/`published` rows to `queued`.** | Both now return 409 on a terminal state. Re-extraction is a draft operation; `Re-scan` is the intended redo path. |
| 2026-11-25 | Dead code: `rejectHttp`, `formatScanBytes`, `isPublishable`, `writeScanStatus`, and a `ScanAttempt.cellDiffs` field that was always `0`. | All removed. |
| 2026-11-25 | **Leaving the scanner forgot the selected class** (reported on a real device). `onclose` navigated to `/people?tab=students` with no `classId`/`sectionId`. `resolveSelectedClass` needs a requested class when an admin has more than one, so it returned `null` and the roster showed the class picker instead of the roster the teacher came from. | Added `backToRoster()`, which rebuilds the URL from the **server-loaded** `data.student.classId/sectionId` plus the exam — so even opening a scanner URL directly returns somewhere sensible. Three regression tests pin it. |
| 2026-11-25 | The two status guards lived inline in the route files, so the regression could not be unit-tested. | Extracted `isVerified` / `canReExtract` / `canRecapture` into `scan-status.ts` as pure predicates; routes call them. 16 regression tests now pin all five review findings. |
| 2026-11-25 | **Undo could not actually undo a capture in the normal flow.** Auto-advance fires *after* `extract` is dispatched, so by the time the toast was tappable the envelope was already `extracting` or `draft`. | **Owner chose option B: drop Undo, keep extraction immediate.** Replaced with a plain confirmation toast — “Sent Adaobi — Re-scan if wrong”. Rationale: a fake affordance is worse than none, and `Re-scan` is the real recovery path. All undo code deleted rather than left dormant. **This deviates from spec §2C**, which specified a 3-second Undo; recorded in the Decision log. |
| 2026-11-25 | `torch` does not exist in TypeScript's DOM lib, so `MediaTrackCapabilities`/`MediaTrackConstraintSet` reject it. | Added `torch.ts` with an `in`-guard for the capability and an intersection type for the constraint — no `any`, no `as` cast. |
| 2026-11-25 | **18 pre-existing raw `<button>` elements across `components/people/`** (staff-tab, parents-tab, pager, tabs, table sort, filter menu, stepper, sibling picker, header, conflict panel, unassigned state) bypassed the design system — each carried a bespoke class string duplicating what `Button` variants already provide. | Migrated all of them to `Button` with `variant`/`size`. Removed the three duplicated style constants. Mobile touch targets preserved at `size-11 ... sm:size-9` (44 px → 36 px). |
| 2026-11-25 | **First pass of scan components hardcoded palette colours** (`amber`, `sky`, `emerald`) for status tones, and used raw `<button>`/`<textarea>` instead of primitives — against the non-negotiable UI rules. | Rewrote all four: `Badge` variants + tokens for status, `Button`/`Input`/`Textarea`/`Label`/`Alert`/`Spinner` for controls, `ring-destructive` / `ring-ring` for cell state. Added the audit commands above so it cannot regress silently. |
| 2026-11-25 | **Commit is `upsertMarksheet`, which also *computes* and persists.** It is not a plain write of posted numbers: `cleanMarks` wipes the term, `doProcessMarks` recomputes per-subject totals from `marks[]`, resolves/creates `sm_exams` via `createExamIfNotExist`, upserts `sm_exam_setups` for unknown titles, derives `subjectPercentageMark` and the grade, then batch-writes `sm_mark_stores` + `sm_result_stores`. | `scan-commit.ts` delegates entirely to `upsertMarksheet` — it computes nothing itself. The mapper's `totalScore`/`grade` exist only for display and are never the persisted values. |

## Verification log

| Date | Check | Plan ref | Result |
| --- | --- | --- | --- |
| 2026-11-25 | `pnpm check` baseline | §9.1 | 0 errors / 36 warnings |
| 2026-11-25 | Provider A/B, 4 docs / 114 cells | §3a | DeepSeek 112/114; Gemini 503s |
| 2026-11-25 | Degradation sweep, 1 doc / 32 cells | §3b | 30° skew 1/32; 16 px blur 32/32 |
| 2026-11-25 | Browser `OffscreenCanvas` 1600/q80 | §3c | 209–224 KB; 2/114 cells wrong |
| 2026-11-25 | Migration SQL written | §4 | `scripts/sql/2026_11_24_teacher_remarks_metadata.sql` (applied later, see below) |
| 2026-11-25 | `metadata` declared in `sms-schema.ts` | §4 | Types only; additive |
| 2026-11-25 | Migration applied to dev | §4 | `metadata` longtext/Y YES appended last; 3,699 rows intact; ledger 1 row batch 2 |
| 2026-11-25 | Migration re-run (idempotency) | §4 | No-op; ledger still 1 row / 350 total |
| 2026-11-25 | `scan-types.test.ts` | §9.2 | 15/15 pass |
| 2026-11-25 | `scan-extraction-schema.test.ts` | §9.2 | 19/19 pass; JSON Schema flat, no `$ref`, 9 required, `additionalProperties:false`, no `category` |
| 2026-11-25 | `scan-status.test.ts` | §9.2 | 14/14 pass |
| 2026-11-25 | `scan-access.test.ts` | §9.2 | 13/13 pass |
| 2026-11-25 | `scan-store.test.ts` | §9.2 | 18/18 pass; temp-dir isolated, no writes to real `storage/` |
| 2026-11-25 | `pnpm test` scan suite | §9.2 | 79/79 pass across 5 files |
| 2026-11-25 | `pnpm run check` | §9.1 | 0 errors / 36 warnings — matches baseline exactly |
| 2026-11-25 | `scan-mapper.test.ts` | §9.10 | 29/29 pass — CLL/JP≡JP/CLL, duplicate PSRN refused, CRECHE→NURSERY, CA>10 rejected |
| 2026-11-25 | `pnpm test` scan suite | §9.2 | **108/108** pass across 6 files |
| 2026-11-25 | Live DeepSeek extraction via production code | §9.3 | amira: 3,348 ms, 8 subjects, positional OK, `CCA 45→46` reproduced, remark captured |
| 2026-11-25 | DB facts behind the mapper traps | §5a | CRECHE-class students are all NURSERY (53); `PSRN` exists 2× (ids 15,30); `CLL/JP` (34) and `JP/CLL` (14) are separate rows |
| 2026-11-25 | `scan-capture.test.ts` | §9.5 | 15/15 — magic-byte sniffing, APP1 strip idempotent, PNG chunk strip, SOF dimensions, `wx` no-overwrite |
| 2026-11-25 | Live facts+mapper vs dev DB (student 92, exam 5) | §5a | category LOWERBASIC; parent email/name resolved; token built; 8 records |
| 2026-11-25 | **Live end-to-end `marksheetSchema` pass** | §9.4 | 8 records × 4 titles, totals 84–95, grades A–C, **0 schema issues**, 0 errors |
| 2026-11-25 | `pnpm test` scan suite | §9.2 | **124/124** pass across 7 files |
| 2026-11-25 | `scan-commit.test.ts` | §9.4 | 8/8 — over-max, unassigned subject, length mismatch, boundary accepted |
| 2026-11-25 | **Live commit (student 148, exam 5)** | §9.4, risk 7 | 32 mark rows, 8 result rows, remark kept as text, `metadata.status=committed` **survived `cleanMarks`**, captureId intact |
| 2026-11-25 | Fixture restore after live commit | §9.4 | marks −32, results −8, remarks −1, timelines −1 — exactly the rows created; totals back to 119,484 / 30,775 / 3,700 / 7,452 |
| 2026-11-25 | `pnpm test` scan suite | §9.2 | **132/132** pass across 8 files |
| 2026-11-25 | **PDF render from scanner-built marksheet** | §9.9 | 27,259-byte `%PDF-`; DB name, `0178` admin no, class, remark, MATH all present |
| 2026-11-25 | Gender not rendered by the report | §9.9 | `StudentInfo` uses only name/term/class/section/sessionYear/adminNo/days*/photo; gender absent from all `components/template/*` |
| 2026-11-25 | Gender value stored in the envelope | §5a | Was the numeric id string `"1"`; now resolved to `"Male"` via `sm_base_setups`, matching `getStudentResult` |
| 2026-11-25 | **Grade parity with the pipeline** | §5a | All 8 subjects match `subjectPercentageMark` + `getGrade`: 86/100→B, 95/100→A, 84/100→C, etc. |
| 2026-11-25 | Exam id space audit | §5 | Every binding in `people/scan/*` resolves the value to a term column (`teacher_remarks.exam_type_id`, `sm_result_stores.exam_type_id`, `sm_exam_setups.exam_term_id`, `sm_exam_types.id`). No `sm_exams.id` / `exam_id` use anywhere |
| 2026-11-25 | **Draft now carries a real Marksheet** | §5a | Was `marksheet: null`; `composeMarksheet` runs re-key + DB-fact injection + category resolution, then validates the result with `marksheetSchema` |
| 2026-11-25 | **Identity-overwrite safety proven live** | §5a | Paper `AMIRA KANYITOR`/521/2B vs DB student 148 → marksheet kept `SHINDARA EMMANUEL OLANREWAJU`/178; paper values returned separately as `paperIdentity` for the grid |
| 2026-11-25 | Contains-match removed | §5a | `CL/VR`+`JP/LIT` (classes 15/5–7) and `PSRN`+`PSRN/QR` would go ambiguous; all active-year codes match papers verbatim, so the fuzzy layer could only break a clean match |
| 2026-11-25 | `pnpm test` scan suite | §9.2 | **141/141** across 8 files |
| 2026-11-25 | Identity method: token-coverage fuzzy (`scan-identity.ts`) | §5a | `AMIRA KANYTTO`→0.875 match · `KANYITOR AMIRA`→1.0 · `AM1RA`→1.0 (digit fold) · sibling 0.5 mismatch · single-token capped to uncertain |
| 2026-11-25 | Admission number demoted to weak corroboration | §5a | Wrong/blank admission no. with a good name → no warning; never warns alone |
| 2026-11-25 | `scan-identity.test.ts` | §9.2 | 22/22 pass |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **237/237** across 14 files |
| 2026-11-25 | `pnpm run check` | §9.1 | 0 errors / 36 warnings — baseline restored |
| 2026-11-25 | `pnpm run build` | §9.1 | Passes (needs absolute `MASTRA_DB_URL` — pre-existing) |
| 2026-11-25 | Review grid components | §6 Gate 1.4 | `marks-review-sheet` 252, `marks-cell-editor` 67, `scan-row-actions` 144, `scan-status-badge` 53 — all ≤400 |
| 2026-11-25 | `pnpm run check` after UI | §9.1 | 0 errors / 36 warnings |
| 2026-11-25 | `pnpm test` people suite | §9.2 | 237/237 across 14 files |
| 2026-11-25 | **Blur gate measured on real log books** (Chrome, 320 px) | §6 Gate 2.2 | Sharp: **13,953** (amira) / **5,909** (adakole). Blurred: **107** (4 px) / **7** (8 px) / **2** (16 px). Threshold set to **900**, between the two populations |
| 2026-11-25 | `capture-quality.test.ts` | §9.2 | 19/19 pass |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **256/256** across 15 files |
| 2026-11-25 | `pnpm run check` / `pnpm run build` | §9.1 | 0 errors / 36 warnings; build passes |
| 2026-11-25 | **Offline + PDF + bulk publish built** | §6 Gate 3/4 | `scan-queue.ts`, `scan-offline-banner`, `pdf-preview-sheet`, `GET /api/people/marks/pdf/[studentId]` |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **264/264** across 16 files |
| 2026-11-25 | UI audit — new Chunk 6 components | AGENTS.md | Palette classes: 0. Raw `<button>/<input>/<textarea>`: 0 across `components/people/` |
| 2026-11-25 | Pre-existing avatar palette re-checked | — | `person-cell.svelte` still uses 8 palette hues for deterministic initials; this is the **owner-approved deviation from 2026-11-24**, not new code |
| 2026-11-25 | **Full review pass** | all | 5 defects found and fixed (see Issues). DB restored to 3700 remarks / 0 with metadata / 119,484 marks / 30,775 results |
| 2026-11-25 | `scan-regressions.test.ts` | §9.2 | **16/16** — re-extract refused on `committed`/`published`; recapture refused on verified rows; publish groups by class; offline compresses before enqueue; viewfinder binds the element to the parent |
| 2026-11-25 | Regression tests verified to actually fail | §9.2 | Reverting `canReExtract` broke 3 of them; restoring the fix passed all 16 — the tests are not vacuous |
| 2026-11-25 | **Device report — class lost on scanner close** | §9.5 | Closing the camera returned to `/people?tab=students`, dropping `classId`/`sectionId`; with >1 allowed class the loader policy is `"single"`, which cannot resolve → "Choose a class" again. Fixed by returning with class/section/exam preserved |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **283/283** across 17 files |
| 2026-11-25 | `pnpm run check` / `pnpm run build` | §9.1 | 0 errors / 36 warnings; build passes |
| 2026-11-25 | UI audit — scanner components | AGENTS.md | Palette classes: 0. Raw `<button>/<input>/<textarea>`: 0 (`Input type="file"` used for the gallery picker) |
| 2026-11-25 | Undo removed cleanly | spec §2C | `scan-undo.ts`, `POST /api/people/marks/undo`, `deleteScanFile`, `clearScanEnvelope` and the 8 undo tests all deleted; no dead code left |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **256/256** across 15 files |
| 2026-11-25 | `pnpm run check` / `pnpm run build` | §9.1 | 0 errors / 36 warnings; build passes |
| 2026-11-25 | **Offline + PDF + bulk publish built** | §6 Gate 3/4 | `scan-queue.ts`, `scan-offline-banner`, `pdf-preview-sheet`, `GET /api/people/marks/pdf/[studentId]` |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **264/264** across 16 files |
| 2026-11-25 | UI audit — new Chunk 6 components | AGENTS.md | Palette classes: 0. Raw `<button>/<input>/<textarea>`: 0 across `components/people/` |
| 2026-11-25 | Pre-existing avatar palette re-checked | — | `person-cell.svelte` still uses 8 palette hues for deterministic initials; this is the **owner-approved deviation from 2026-11-24**, not new code |
| 2026-11-25 | **Full review pass** | all | 5 defects found and fixed (see Issues). DB restored to 3700 remarks / 0 with metadata / 119,484 marks / 30,775 results |
| 2026-11-25 | `scan-regressions.test.ts` | §9.2 | **16/16** — re-extract refused on `committed`/`published`; recapture refused on verified rows; publish groups by class; offline compresses before enqueue; viewfinder binds the element to the parent |
| 2026-11-25 | Regression tests verified to actually fail | §9.2 | Reverting `canReExtract` broke 3 of them; restoring the fix passed all 16 — the tests are not vacuous |
| 2026-11-25 | **Device report — class lost on scanner close** | §9.5 | Closing the camera returned to `/people?tab=students`, dropping `classId`/`sectionId`; with >1 allowed class the loader policy is `"single"`, which cannot resolve → "Choose a class" again. Fixed by returning with class/section/exam preserved |
| 2026-11-25 | `pnpm test` people suite | §9.2 | **283/283** across 17 files |
| 2026-11-25 | `pnpm run check` / `pnpm run build` | §9.1 | 0 errors / 36 warnings; build passes |
| 2026-11-25 | **UI design-system audit — scan components** | AGENTS.md / `layout.css` | Palette classes: 0. Raw hex/rgb/oklch: 0. Raw `<button>/<input>/<textarea>`: 0 |
| 2026-11-25 | **UI design-system audit — all of `components/people/`** | AGENTS.md / `layout.css` | Raw `<button>`: **0** across 20 components (was 18). Dead style constants (`menuButtonClass`, `controlClass`, `toolbarButton`) removed. `pnpm check` 0 errors / 36 warnings, 237/237 tests |
