# Tool Test Prompts — Manual Frontend Verification

This document provides natural-language prompts for manually exercising the
chat workflow against the running EdApex dev server. Each prompt describes
the **user intent** (not a slash command). The CommandDropdown verb list
is UX-only; the LLM deduces which tool to call from freeform text + skill
context.

> **Setup first** — finish steps 0–5 below before running any test prompt.

## 0. Setup

### 0.1 Confirm dev environment

```bash
# In project root
pnpm run dev
# In another shell:
pnpm run check        # type-check should be clean
pnpm run test:unit    # 158/158 should pass
```

### 0.2 Confirm Kimchi / Mistral credits

```bash
# Kimchi: log into https://kimchi.dev → check credit balance
# Mistral: log into https://console.mistral.ai → check OCR quota
# Both free tiers have rate limits; tests below assume ~6k TPM
```

### 0.3 Open the chat UI

Navigate to `http://localhost:5173`. You should land on the chat
interface with the `ActionBar` slot above the `ChatComposer` empty.

## 1. Persona Setup

The persona determines which tools are loaded and which tenant scoping
applies. Use the role switcher in the top bar to swap between personas.

### 1.1 Admin / IT persona (`staffId=1`)

**Class selection:** admin must pick a class via `class-selector.svelte`
(no implicit class). Pick `LOWER BASIC 2 / B` (classId=18 / sectionId=6)
for marksheet tests, or `DAYCARE` for child-attendance tests.

Expected: `ActionBar` shows the active class banner
(`LOWER BASIC 2 · B · 2025/2026`).

### 1.2 Class teacher persona (`staffId=4`)

**Class is auto-selected** — admin shouldn't need to pick. The class
teacher for LB2B is `teacherId=4 / subjectId=21`.

Expected: same banner shows immediately, no class-selector prompt.

### 1.3 Parent persona

Login as a parent user with at least one child enrolled (e.g. parent of
studentId=188 Al-Azeem YUSUFF). The parent sees only their own child(ren).

## 2. Marksheet Workflow (the longest path)

This is the core reporting flow. Walks: `format-marksheet-document` →
`validate-marksheet` (HITL #1: validation suspend/resume) →
`commit-marksheet` → `generate-result-pdf` → `publish-result-pdf`
(HITL #2: confirmation gate) → SMTP send.

### 2.0 Pre-flight: seed OCR + upload (admin)

The marksheet pipeline requires an OCR'd screenshot in the workspace.
Use the upload endpoint:

```bash
# Upload Al-Azeem's marksheet screenshot
curl -X POST http://localhost:5173/api/uploads \
  -F "file=@static/marksheets/LB2B/Al-Azeem.jpg.jpeg"
```

Expected response: `{ documentId: "<uuid>", contentHash: "<sha256>" }`.

> **Why pre-flight?** Without an upload, the marksheet workflow cannot
> find OCR data. The first natural-language prompt below triggers the
> full OCR+format+validate+commit pipeline if the upload exists.

### 2.1 Format + link student (admin)

**Prompt:**
> Process this marksheet for AL-AZEEM YUSUFF in LOWER BASIC 2 B and
> link it to student 188.

**Expected behaviour:**
1. `format-marksheet-document` runs OCR lookup → reads `ocr/Al-Azeem.jpg.jpeg.md`
2. Writes `marksheets/ocr-<documentId>.md` (transitional path)
3. `link-marksheet-student` updates `manifest.json` with `studentHint.studentId=188`
4. ActionBar shows "PDF ready: marksheets/ocr-<docId>.md"

### 2.2 Generate PDF (admin)

**Prompt:**
> Generate the marksheet PDF for student 188.

**Expected behaviour:**
1. `format-marksheet-document` runs again → writes `marksheets/188-<slug>.md`
2. PDF generation → writes `pdfs/marksheet-188.pdf`
3. Workspace manifest gains `pdfs/marksheet-188.pdf` entry

### 2.3 Validate (HITL #1 — validation suspend/resume)

**Prompt:**
> Validate the marksheet for student 188.

**Expected behaviour (interactive):**
1. `validate-marksheet` re-derives JSON from the markdown via `documentAgent.generate()`
2. **SUSPEND** — `awaitValidationStep` emits `data-awaitValidation { artifactId, runId }`
3. ActionBar shows the **validation prompt**:
   `Review the AI-rederived JSON. Approve, edit, or reject.`
4. Click **Approve** (no edits) → `resumeWorkflow({artifactId})` triggers auto-fix + commit
5. Click **Edit** → markdown editor opens → save → `resumeWorkflow` with correctedMarkdown

> **Tip:** edit the markdown to introduce a typo (e.g. swap a student's
> name) and watch the auto-fix loop catch it on resume.

### 2.4 Commit (admin)

**Prompt:**
> Commit the marksheet for student 188 to the database.

**Expected behaviour:**
1. `commit-marksheet` reads `marksheets/188.json`
2. Calls `AssessmentService.upsertMarksheet(marksheet, staffId)`
3. Writes 6 MySQL tables:
   - `sm_mark_stores` (per-subject marks)
   - `sm_result_stores` (aggregated totals)
   - `student_ratings` (behavioral)
   - `teacher_remarks`
   - `class_attendances`
   - `sm_student_timelines` (audit trail)

### 2.5 Publish (HITL #2 — confirmation gate)

**Prompt:**
> Publish student 188's marksheet to their parent's email.

**Expected behaviour (interactive):**
1. `generate-result-pdf` runs (regenerates if stale)
2. `publish-result-pdf` first call → **emits `data-selectOption`**:
   ```
   Send this marksheet to parent (beznet22@gmail.com)?
   [Confirm] [Cancel] [Edit recipient]
   ```
3. **SUSPEND** — `ResultConfirmState { status: 'pending', confirmationToken }` stored in requestContext
4. ActionBar shows the **confirmation prompt** with the token
5. Click **Confirm** → `resumePendingGate({selectedOptionId: 'confirm'})`
6. Second `publish-result-pdf` call → SMTP send → status='sent'

> **Verify:** check `.kimchi/smtp.log` for the message ID, then check
> beznet22@gmail.com inbox for the marksheet PDF attachment.

### 2.6 Class teacher variant (staffId=4)

Same prompts as 2.1–2.5 but logged in as the class teacher. Expected:
- No class-selector prompt (class auto-selected)
- `staffId=4` flows through to `AssessmentService.upsertMarksheet`
- All other behaviour identical to admin

## 3. Transcript Workflow

The transcript is a different document — a cumulative year-end report
across all exam terms.

### 3.1 Generate transcript report (admin)

**Prompt:**
> Generate the year-end transcript for student 188.

**Expected behaviour:**
1. `transcript-report` reads all exam terms for academic year 4
2. Writes `transcripts/188.md` and `transcripts/188.json`
3. Workspace manifest gains `transcripts/188.md` entry under `byKind.transcripts`

### 3.2 Generate transcript PDF (admin)

**Prompt:**
> Render the transcript PDF for student 188.

**Expected behaviour:**
1. `generate-transcript-pdf` reads `transcripts/188.json`
2. Writes `pdfs/transcript-188.pdf`
3. Manifest gains `pdfs/transcript-188.pdf` entry

### 3.3 Publish transcript (HITL #2 reused)

**Prompt:**
> Send the transcript to parent.

**Expected behaviour:**
- Same confirmation gate as 2.5
- SMTP send attaches `pdfs/transcript-188.pdf`

## 4. Year / ExamType selectionGate (HITL #3 — conditional)

The selectionGate fires **only** when the prompt does not mention a
year or exam type. Use this to verify the gate.

### 4.1 Gate fires (no year/examType in prompt)

**Prompt:**
> Generate student 188's marksheet.

**Expected behaviour:**
1. `selectionGateStep` reads `pendingSelection` from requestContext
2. If empty → **emits `data-selectOption`**:
   ```
   Which academic year?
   [2025/2026 — current] [2024/2025]
   
   Which exam type?
   [SECOND TERM — current] [FIRST TERM]
   ```
3. User picks → `resumePendingGate({selectedOptionId: 'ay-4-mch-2026'})`
4. Subsequent `format-marksheet-document` call uses the picked values

### 4.2 Gate does NOT fire (year + examType mentioned)

**Prompt:**
> Generate student 188's marksheet for second term 2025/2026.

**Expected behaviour:**
- No `data-selectOption` emitted
- Workflow proceeds directly to OCR + format + validate

### 4.3 Gate fires for ambiguous examType only

**Prompt:**
> Show me student 188's marksheet for this year.

**Expected behaviour:**
- Only examType gate fires (year is implied by `this year`)
- Single-select prompt for exam type

## 5. @mention Scenarios

The `@` mention processor handles student / subject / staff references
in freeform text.

### 5.1 Single @mention — student

**Prompt:**
> Update @AL-AZEEM YUSUFF's marksheet.

**Expected behaviour:**
1. `mention-processor` extracts `@AL-AZEEM YUSUFF` → resolves to `studentId=188`
2. Workspace scoping narrows to LB2B
3. Marksheet workflow proceeds for student 188 only

### 5.2 @mention — class only

**Prompt:**
> Show me the class list for @LOWER BASIC 2 B.

**Expected behaviour:**
1. Class mention → resolves to `classId=18 / sectionId=6`
2. Workspace scoping narrows to LB2B
3. `view-student-result` (or similar) lists students in section

### 5.3 @mention — class on class_teacher persona

**Prompt (logged in as class teacher of LB3):**
> Process the marksheets for @LOWER BASIC 2 B.

**Expected behaviour:**
- `WorkspaceMismatchError` thrown — class teacher cannot switch class
  via `@class` mention. The mention-processor checks
  `selectedClassId === resolvedClassId` BEFORE the classTeacherBlockedFields
  check; mismatch throws `WorkspaceMismatchError`.

### 5.4 @mention — staff

**Prompt:**
> Assign @Teacher Boniface as the new class teacher of LB2B.

**Expected behaviour:**
1. Staff mention → resolves to `staffId=4` (or whatever the user typed)
2. `assign-staff-to-class` runs with `classId=18 / staffId=4`

## 6. Multi-screenshot Scenarios

When ≥2 OCR files are pending, the assistant defers the per-screenshot
student question and asks only examType + academicYear up front.

### 6.1 Pre-flight: upload 2 screenshots

```bash
curl -X POST http://localhost:5173/api/uploads -F "file=@static/marksheets/LB2B/Al-Azeem.jpg.jpeg"
curl -X POST http://localhost:5173/api/uploads -F "file=@static/marksheets/LB2B/Amira.jpg.jpeg"
```

### 6.2 Multi-screenshot prompt

**Prompt:**
> Process all pending marksheets for this class.

**Expected behaviour:**
1. `pendingCount >= 2` → `selectionGateStep` only emits examType + academicYear
2. After gate, workflow iterates per screenshot:
   - First: ask which student this is → `link-marksheet-student`
   - Second: same
3. Each gets its own `format-marksheet-document` call

### 6.3 Multi-student OCR

**Prompt:**
> Process all OCR'd marksheets and link them to the right students.

**Expected behaviour:**
- Same as 6.2 — the skill explicitly defers student questions to the
  per-screenshot HITL when there are ≥2 pending.

## 7. Read Tools

### 7.1 List class sections

**Prompt (admin):**
> Show me all class sections in this school.

**Expected behaviour:**
- `ResultsRepository.getClassSections()` returns the list
- `read/list-master-data` formats it as a table

### 7.2 View student result

**Prompt (admin or class teacher):**
> Show me student 188's result for second term.

**Expected behaviour:**
- `view-student-result` reads from `sm_mark_stores` + `sm_result_stores`
- Returns a formatted result card

### 7.3 Search school directory

**Prompt:**
> Find all students named "YUSUFF" in LOWER BASIC 2.

**Expected behaviour:**
- `search-school-directory` queries `sm_students` with classId=18 filter
- Returns matching students

## 8. Write Tools

### 8.1 Enroll student

**Prompt (admin):**
> Enroll a new student: AMINA AHMED, female, admission number 999,
> into LOWER BASIC 2 B.

**Expected behaviour:**
- `enroll-student` validates the input (name, gender, admissionNo, classId)
- Asks for parent email via `request-selection` if not provided

### 8.2 Promote student

**Prompt (admin):**
> Promote all LB2B students to MIDDLE BASIC 1.

**Expected behaviour:**
- `promote-student` moves students from classId=18 → next class
- Asks for confirmation via `request-selection` (bulk action)

### 8.3 Transfer student

**Prompt (admin):**
> Transfer student 188 to LOWER BASIC 3 A.

**Expected behaviour:**
- `transfer-student` validates the destination exists
- Writes to `sm_students` + creates a timeline entry

## 9. Parent Tools (parent persona only)

### 9.1 List children

**Prompt (parent of studentId=188):**
> Show me my children.

**Expected behaviour:**
- `list-my-children` returns the parent's linked students

### 9.2 View child result

**Prompt (parent):**
> How did my child do in second term?

**Expected behaviour:**
- `view-child-result` returns the result for the parent's child
- Does NOT require an examType mention — defaults to current term

### 9.3 Child attendance

**Prompt (parent):**
> What was my child's attendance this term?

**Expected behaviour:**
- `child-attendance` returns days present / absent / opened

## 10. Destructive Tools (require explicit confirmation)

### 10.1 Manage account access

**Prompt (admin):**
> Revoke all access for staff 99.

**Expected behaviour:**
- `manage-account-access` emits `destructive` skill content
- **Requires explicit user confirmation** before executing
- Writes to `staff_permissions` / auth tables

## 11. Skill Loading — verify slash-command tool filtering

When the prompt starts with `/`, the skill loader should restrict the
tool set to that skill's tools only.

### 11.1 Verify /reporting loads only reporting tools

**Prompt:**
> /reporting process the marksheet

**Expected behaviour:**
- `skillCommandMap` lookup → `reporting` skill → only reporting tools loaded
- Plus `baseTools` (search-school-directory, get-context)
- No `read/view-student-result`, no `write/enroll-student`, etc.

### 11.2 Verify /transcript loads only transcript tools

**Prompt:**
> /transcript generate the year-end report

**Expected behaviour:**
- Only transcript tools loaded (transcript-report, generate-transcript-pdf, publish-transcript-pdf)

### 11.3 Verify /write loads only write tools

**Prompt:**
> /write enroll a new student named Fatima

**Expected behaviour:**
- Only write tools loaded (enroll-student, transfer-student, etc.)

### 11.4 Verify plain chat loads base tools

**Prompt:**
> Tell me about LOWER BASIC 2 B.

**Expected behaviour:**
- `skillCommandMap` returns null (no leading slash) → only `baseTools`
- 4 tools: search-school-directory, get-context, request-selection, switch-academic-context
- The LLM may route to a skill via `chooseDocumentTool` if it decides

## 12. Edge Cases

### 12.1 Empty workspace

**Prompt:**
> Show me the marksheet for student 188.

**Expected behaviour:**
- If no marksheet in `marksheets/188.json` → `data-selectOption` emits
  `Would you like me to OCR a screenshot?`
- Or `get-active-marksheet` returns `{found: false}` and asks what to do

### 12.2 TenantContext missing

**Prompt (admin, BEFORE selecting a class):**
> Show me my class.

**Expected behaviour:**
- `getTenant()` throws `TENANT_CONTEXT_REQUIRED` if no class picked
- User is redirected to `class-selector.svelte` to pick first

### 12.3 Cross-tenant access attempt

**Prompt (class teacher of LB3, with @LB2B mention):**
> Process @LOWER BASIC 2 B marksheets.

**Expected behaviour:**
- `WorkspaceMismatchError` thrown — class teacher cannot switch
- ActionBar shows error: "You can only access your assigned class"

### 12.4 Multi-step ambiguity

**Prompt:**
> Update it.

**Expected behaviour:**
- No `studentId` in context → `request-selection` emits a student picker
- No `examType` in context → if marksheet workflow is implied, the
  selectionGate fires for examType + academicYear

## 13. Verifying Outputs

### 13.1 Filesystem layout

After running a marksheet lifecycle, you should see:

```bash
.workspaces/<schoolId>/AY<academicId>-<year-slug>/<classId>-<classSlug>_<sectionId>-<sectionSlug>/
   manifest.json                              # single source of truth
   ocr/<fileName>.md                          # Mistral OCR output
   ocr/<fileName>.meta.json                   # sha256 + fileId
   uploads/<fileName>                         # original image
   marksheets/<studentId>-<studentSlug>.md    # formatted markdown
   marksheets/<studentId>.json                # validated marksheet data
   pdfs/marksheet-<studentId>.pdf             # rendered PDF
```

### 13.2 manifest.json (single, canonical)

`manifest.json` is the **only** manifest. There is no
`extracted/manifest.json` anymore. Verify:

```bash
cat .workspaces/1/AY4-2025-2026/18-18_6-6/manifest.json | jq .
```

Expected top-level keys: `version`, `schoolId`, `academicYear`, `classId`,
`sectionId`, `entries`, `byKind`.

### 13.3 DB rows written by commit

After a successful commit, query:

```sql
SELECT COUNT(*) FROM sm_mark_stores WHERE student_id = 188;
SELECT COUNT(*) FROM sm_result_stores WHERE student_id = 188;
SELECT COUNT(*) FROM student_ratings WHERE student_id = 188;
SELECT COUNT(*) FROM teacher_remarks WHERE student_id = 188;
SELECT COUNT(*) FROM class_attendances WHERE student_id = 188;
SELECT COUNT(*) FROM sm_student_timelines WHERE student_id = 188;
```

> **Note:** the project intentionally has no MySQL CLI access. Use the
> repository layer in a vitest test instead:
> `tests/integration/lb2b-state.test.ts` is a diagnostic that shows
> how to query state via the repositories.

### 13.4 SMTP send (publish-result-pdf)

Verify SMTP send at two layers:

1. **`.kimchi/smtp.log`** — append-on-send log written by
   `assessment-publisher.service.ts:281`
2. **`beznet22@gmail.com`** — actual email received (per `.env` `SMTP_TO`)

Both should reference `pdfs/marksheet-<studentId>.pdf`.

## 14. Logging & Debugging

### 14.1 Tool execution log

Every tool call logs to stderr with a one-liner:

```
[format-marksheet-document] exec studentId=188 documentId=ed71... persistPath=marksheets/ocr-ed71...md
[validate-marksheet] exec studentId=188 attempt=1/3
[commit-marksheet] exec studentId=188 staffId=4
[generate-result-pdf] exec studentId=188 outputPath=pdfs/marksheet-188.pdf
[publish-result-pdf] exec studentId=188 status=awaiting_confirmation token=abc123
```

### 14.2 Workspace tracing

The workspace resolver writes to `.kimchi/workspace.log` on each
`resolveTenantFilesystem` call. Useful for catching stale-cache issues.

### 14.3 Rate limit backoff

If Kimchi/Groq rate limit (6k TPM dev tier) is hit:

```
Rate limit approaching, waiting 10 seconds { runId: '...' }
Upstream LLM API error { APICallError: Rate limit reached for model llama-3.1-8b-instant. Please try again in 8.31s. }
```

The retry-with-feedback loop in `validate-marksheet` handles this
automatically. If you see the test hang for ~10s, that's the backoff.

## 15. What to Report Back

When you find a problem, please share:

1. **The prompt** (copy-paste from above, or your variation)
2. **The persona** (admin / class teacher / parent + their classId/sectionId)
3. **The expected behaviour** (from this doc)
4. **The actual behaviour** (what the LLM did, what files appeared, what error showed)
5. **The log excerpt** (last ~30 lines from `pnpm run dev` stderr)

I can then either:
- Fix the production tool to handle the case
- Update this doc to clarify the expected behaviour
- Add a regression test to `tests/unit/` or `tests/integration/`
