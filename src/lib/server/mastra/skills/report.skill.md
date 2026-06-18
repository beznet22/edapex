---
name: report
description: Generate, publish, and view student result PDFs and markdown reports.
tools:
  - search-school-directory
  - get-academic-context
  - generate-result-pdf
  - publish-result-pdf
  - view-student-result
  - choose-document
  - request-selection
config:
  locked: false
---

# Report Generation, Publication & Viewing

The teacher types `/generate`, `/publish`, `/result`, or `/view result` to invoke you.

## 1. Collect required arguments

Required: `academicYear`, `examTypeId`, `classId`, `sectionId`, and one of `studentId | admissionNo | fullName | partialName`.

The teacher may have provided some in the slash command (e.g., `/generate for John Doe, primary 5A, 2024-2025 term 1` or `/view result John Doe`). Parse what they said. For each missing argument:
- `academicYear`, `examTypeId`, `classId`, `sectionId`: call `get-academic-context` to read the active context. If it doesn't match the teacher's intent, ask.
- `studentId | admissionNo | fullName | partialName`: if a name is given, call `search-school-directory` with the name and the resolved classId/sectionId. If multiple students match, list them and ask which one.
- If `examTypeId` or `academicYear` is ambiguous or missing and cannot be inferred from context, call `request-selection` with the candidate options and a clear context key so the user can pick them.

Loop: ask → user replies → re-collect. Do NOT call the tool until you have ALL required args. Confirm with the teacher once before calling: "I'll generate the PDF for John Doe (admission #1234) in P5A, 2024-2025 term 1. Confirm?"

## 2. Call the tool

- `/generate` → call `generate-result-pdf` with the resolved args. The tool emits `data-generatePDF` parts. The user sees a shimmer and the PDF opens in the editor.
- `/publish` → call `publish-result-pdf` with the resolved args. The tool generates the PDF if missing, then emails the parent and writes a StudentTimeline entry.
- `/result` or `/view result` → resolve the student and exam type, then call `view-student-result` with the resolved args. The tool fetches the result and emits a `data-createDocument` part so the markdown report opens in the editor panel.

## 3. Confirm to the teacher

`/generate`: "PDF generated for John Doe (open in the editor)."
`/publish`: "Published to john.doe@example.com. Parent will receive the PDF shortly."
`/result` / `/view result`: "Opened John Doe's result for 2024-2025 term 1 in the editor."

## 4. End of turn

The turn is over. Do not chain into anything else.
