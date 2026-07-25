Here is the complete report on the marksheet PDF generation flow.

---

## Complete Marksheet PDF Generation Pipeline

### 1. DEFINITIONS AND ALL CALL SITES

#### `getResultData()`
**There is no function literally named `getResultData()`** anywhere in the codebase. The closest equivalent is:
- **`queryResultData()`** in `ResultsRepository` — fetches raw MySQL data
  - **Defined:** `/home/beznet/Workspace/edapex/src/lib/server/repository/result.repo.ts` **line 366**
  - **Called:** `/home/beznet/Workspace/edapex/src/lib/server/service/assessment.service.ts` **line 545** — inside `getStudentResult()`
- **`getStudentResult()`** in `AssessmentService` — builds the full `Marksheet` object from the raw data
  - **Defined:** `/home/beznet/Workspace/edapex/src/lib/server/service/assessment.service.ts` **line 533**
  - **Called from 3 places:**
    1. `/home/beznet/Workspace/edapex/src/lib/server/mastra/tools/operations/reporting/generate-result-pdf.ts` **line 159** — the Mastra PDF generation tool
    2. `/home/beznet/Workspace/edapex/src/lib/api/assessment.remote.ts` **line 29** — the client-side `generateResultPdf` command
    3. `/home/beznet/Workspace/edapex/src/routes/api/results/[token]/+server.ts` **line 54** — the public PDF download endpoint
- The local variable `resultData` (lowercase) appears at:
  - `assessment.service.ts` **line 545** — stores raw `QueryResultData`
  - `assessment.remote.ts` **line 29** — stores the full `Marksheet`
  - `routes/api/results/[token]/+server.ts` **line 54** — stores the full `Marksheet`

---

#### `upsertStudentResult()`
- **Defined:** `/home/beznet/Workspace/edapex/src/lib/server/service/assessment.service.ts` **line 244**
- **Accepts:** `ResultInput` (legacy format from `result-input.ts` schema)
- **CALLED BY: NO CALLERS.** The search across all `.ts` files found zero invocations. This is dead code -- the legacy write path has been fully superseded by `upsertMarksheet()`.

---

#### `upsertMarksheet()` — the active commit path
- **Defined:** `/home/beznet/Workspace/edapex/src/lib/server/service/assessment.service.ts` **line 360**
- **Accepts:** `Marksheet` (the canonical schema from `marksheet.ts`)
- **Called from:** `/home/beznet/Workspace/edapex/src/lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet.ts` **line 197** — inside `commitMarksheetLogic()`

#### `commitMarksheetLogic()` — orchestrates the full commit
- **Defined:** `/home/beznet/Workspace/edapex/src/lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet.ts` **line 72**
- **Called from 3 places:**
  1. `/home/beznet/Workspace/edapex/src/lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet.ts` **line 293** — the `commitMarksheetTool` Mastra tool
  2. `/home/beznet/Workspace/edapex/src/lib/server/mastra/tools/operations/reporting/marksheet/ensure-committed.ts` **line 227** — `ensureMarksheetCommitted()` helper
  3. `/home/beznet/Workspace/edapex/src/routes/api/commit/+server.ts` **line 150** — the auto-commit POST endpoint

---

#### PDF Generation Functions

| Function | File | Line | Mechanism |
|---|---|---|---|
| `generate` (the html2pdf wrapper) | `src/lib/server/helpers/pdf-generator.ts` | **78** | Spawns `bin/html2pf` binary |
| `generateResultPdfTool` | `src/lib/server/mastra/tools/operations/reporting/generate-result-pdf.ts` | **255** | Mastra tool, full pipeline |
| `renderAndWriteResultPdf` | same file | **73** | Core logic for tool path |
| `generateResultPdf` (command) | `src/lib/api/assessment.remote.ts` | **18** | Client-side `command` |
| `GET /api/results/[token]` | `src/routes/api/results/[token]/+server.ts` | **11** | Public API endpoint |
| `publishResultPdfTool` | `src/lib/server/mastra/tools/operations/reporting/publish-result-pdf.ts` | — | Publish + notify parent |

---

### 2. THE FULL DATA PIPELINE

```
                        ┌──────────────────────────┐
                        │   OCR Upload / File Drop   │
                        │ (assessment-ocr.service)   │
                        └────────────┬─────────────┘
                                     │ raw markdown
                                     ▼
                        ┌──────────────────────────┐
                        │    Format Agent (Groq)    │
                        │  (format-document route)  │
                        │  markdown → structured    │
                        └────────────┬─────────────┘
                                     │ marksheet markdown
                                     ▼
                        ┌──────────────────────────┐
                        │   Editor (editor-canvas)  │
                        │  8s debounce → auto-save  │
                        └────────────┬─────────────┘
                                     │ marksheet .md
                                     ▼
               ┌─────────────────────────────────────┐
               │  commitMarksheetLogic()              │
               │  commit-marksheet.ts:72              │
               │  1. Validate via marksheetSchema     │
               │  2. Call upsertMarksheet()           │
               │  3. Write to manifest                │
               └────────────────┬────────────────────┘
                                │ Marksheet object
                                ▼
               ┌─────────────────────────────────────┐
               │  upsertMarksheet()                   │
               │  assessment.service.ts:360           │
               │  1. getStudentById → recordId        │
               │  2. cleanMarks (delete old)          │
               │  3. doProcessMarks → batch upsert    │
               │  4. Upsert ratings, remark, attend.  │
               │  5. Create timeline audit entry      │
               └────────────────┬────────────────────┘
                                │ writes to MySQL tables:
                                │ smMarkStores, smResultStores,
                                │ studentRatings, teacherRemarks,
                                │ classAttendances, smStudentTimelines
                                ▼
               ┌─────────────────────────────────────┐
               │  generateResultPdfTool / PDF Route   │
               │                                      │
               │  1. resolveStudent                   │
               │  2. createAssessmentService          │
               │  3. getStudentResult()               │
               │     ├─ getStudentById (roster)       │
               │     └─ queryResultData (MySQL reads) │
               │        ├─ smResultStores (subjects)  │
               │        ├─ smMarkStores (individual)  │
               │        └─ classAttendances           │
               │  4. buildMarksRecords() → records[]  │
               │  5. padMissingRecords() (optional)   │
               │  6. marksheetSchema.parseAsync()     │
               │  7. render(ResultTemplate)           │
               │  8. pageToHtml()                     │
               │  9. generatePdf() (html2pdf binary)  │
               │  10. Write PDF to workspace          │
               │  11. Add entry to manifest           │
               └─────────────────────────────────────┘
```

### 3. FILE-BY-FILE LOCATIONS

| Component | File Path | Key Lines |
|---|---|---|
| **marksheetSchema definition** | `src/lib/schema/marksheet.ts` | 205-234 |
| **MarksRecord type** | `src/lib/schema/marksheet.ts` | 56-150 |
| **AssessmentService** | `src/lib/server/service/assessment.service.ts` | 66-1179 |
| — `upsertStudentResult` (dead) | same file | 244-349 |
| — `upsertMarksheet` (active) | same file | 360-523 |
| — `getStudentResult` | same file | 533-613 |
| — `buildMarksRecords` | same file | 775-847 |
| — `createAssessmentServiceForRequest` | same file | 1173-1178 |
| **queryResultData** (MySQL read) | `src/lib/server/repository/result.repo.ts` | 366-453 |
| **commitMarksheetLogic** | `src/lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet.ts` | 72-261 |
| **commitMarksheetTool** | same file | 263-295 |
| **ensureMarksheetCommitted** | `src/lib/server/mastra/tools/operations/reporting/marksheet/ensure-committed.ts` | 128-242 |
| **padMissingRecords** | `src/lib/server/mastra/tools/operations/reporting/marksheet/validate-cross-ref.ts` | 38-97 |
| **crossReferenceSubjects** | same file | 12-36 |
| **generateResultPdfTool** | `src/lib/server/mastra/tools/operations/reporting/generate-result-pdf.ts` | 255-315 |
| **renderAndWriteResultPdf** | same file | 73-253 |
| **generatePdf (html2pdf)** | `src/lib/server/helpers/pdf-generator.ts` | 78-195 |
| **PDF token route** | `src/routes/api/results/[token]/+server.ts` | 11-77 |
| **Remote generateResultPdf** | `src/lib/api/assessment.remote.ts` | 18-51 |
| **Auto-commit endpoint** | `src/routes/api/commit/+server.ts` | 43-167 |
| **Format document endpoint** | `src/routes/api/format-document/+server.ts` | 20-415 |
| **ResultTemplate (Svelte)** | `src/lib/components/template/ResultTemplate.svelte` | 1-44 |
| **RecordsTable (template)** | `src/lib/components/template/RecordsTable.svelte` | 1-133 |
| **ScoreSummary (template)** | `src/lib/components/template/ScoreSummary.svelte` | 1-85 |
| **marksheetPdfPath** | `src/lib/server/workspace/paths.ts` | 117-128 |

---

### 4. WHERE DATA COULD BE LOST OR BECOME EMPTY

#### **Critical Point #1: `queryResultData` returning empty arrays (result.repo.ts:366-453)**
The function runs three parallel MySQL queries. If any returns empty:
- **Empty `resultRecords`** → `buildMarksRecords` at `assessment.service.ts:819` iterates over `Object.entries(bySubject)` — if `marks` is also empty but `resultRecords` has records, the DAYCARE branch at line 789 fires. For non-DAYCARE with empty marks and no resultRecords, the `records` array will be **empty**, which fails `marksheetSchema`'s `.nonempty()` on `records` (marksheet.ts:210).
- **Empty `marks`** → `bySubject` is empty → `buildMarksRecords` returns `{ records: [], overAll: 0 }` → Zod rejection.
- **Empty `attendance`** → defaults to zeros at `assessment.service.ts:566-568` (graceful fallback, no loss).

#### **Critical Point #2: `assignedSubjects` drives the record/subject count mismatch (assessment.service.ts:601)**
`getStudentResult` fetches currently-assigned subjects via `getAssignedSubjects` at **line 601** and includes them in the returned Marksheet. The `marksheetSchema` superRefine (marksheet.ts:219) requires `records.length === subjects.length` for non-DAYCARE. If `buildMarksRecords` produces fewer records than there are assigned subjects (e.g., a subject was recently added but the student has no marks for it), Zod validation **will add an issue**. The schema uses `.continue: true` (marksheet.ts:231), so it doesn't throw but the issue propagates.

#### **Critical Point #3: `padMissingRecords` blanks have `totalScore: undefined` (validate-cross-ref.ts:69)**
When `padMissingRecords` adds a blank record for a missing subject, `totalScore` is set to `undefined`:
```typescript
totalScore: undefined,   // line 69
```
In `RecordsTable.svelte` **line 99**, `record.totalScore` renders as the text "undefined" in the PDF table cell. This is a visual data loss -- the subject shows up but with no numeric score.

#### **Critical Point #4: Fallback when `padMissingRecords` throws (generate-result-pdf.ts:192-196)**
```typescript
try {
  const padded = padMissingRecords(fullResult as Marksheet, assigned, omitSet);
  validated = await marksheetSchema.parseAsync(padded);
} catch {
  validated = await marksheetSchema.parseAsync(fullResult);  // line 193 or 196
}
```
If `padMissingRecords` succeeds but Zod validation of the padded result fails, the code falls back to validating the **un-padded** raw data which is **guaranteed to fail** if the record count doesn't match. The `catch` block catches errors from both `padMissingRecords` and `marksheetSchema.parseAsync`, silently swallowing them. The variable `validated` from the catch block is used at **line 198** for template rendering -- if `marksheetSchema.parseAsync(fullResult)` threw, `validated` would be undefined, causing a runtime crash during `render(ResultTemplate, { props: { data: validated } })`.

#### **Critical Point #5: `getStudentResult` returns null if no `classResults` (assessment.service.ts:546)**
```typescript
if (!resultData?.classResults?.length) return null;
```
If the student's class/section has no other students with committed result records (i.e., they are the first/only student with data for this exam in this class/section), `classResults` will be empty, and `getStudentResult` returns `null`. This causes the PDF generation to throw `MARKSHEET_NOT_FOUND` at `generate-result-pdf.ts:168`, even though the student's own marks exist.

#### **Critical Point #6: Hardcoded `schoolId: 1` in PDF routes (assessment.remote.ts:27, [token]/+server.ts:29)**
Both the remote command path and the public PDF token endpoint construct their tenant context with `schoolId: 1, userId: 0` instead of deriving it from the authenticated user. This means multi-tenant schools will read/write from the wrong tenant's database.

#### **Critical Point #7: `upsertMarksheet` swallows `doProcessMarks` failures (commit-marksheet.ts:199-211)**
If `doProcessMarks` in `upsertMarksheet` returns `null` (which happens at `assessment.service.ts:916` when `classId/sectionId/studentId/examTypeId` are missing), the error `"Failed to process marks."` is thrown and caught at `commit-marksheet.ts:199` and returned as `{ ok: false, errors: [...] }`. The error mapping at lines 201-206 maps specific messages to error codes but any **unexpected** error message falls through as a generic `UPSERT_FAILED` code. The commit caller then sees a non-specific failure.

#### **Critical Point #8: `ensureMarksheetCommitted` uses best-effort manifest reads (ensure-committed.ts:171-177)**
```typescript
try {
  const m = await readManifest(tenant, tenant.examTypeId);
  // ...
} catch { /* best-effort */ }
```
If the manifest read fails, `omitSet` and `allowSet` remain undefined, meaning omitted/allowed subject preferences are silently ignored and no padding/omission occurs. The marksheet may then fail cross-reference validation at line 186 or produce an incorrect padded result.

#### **Critical Point #9: Template renders `undefined` for null/empty scores (RecordsTable.svelte:99)**
`{record.totalScore}` at line 99 renders as the string "undefined" when `totalScore` is `undefined` (from padMissingRecords) or `null`. The HTML output contains "undefined" in the PDF cell for blank subjects.
