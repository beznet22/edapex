---
name: marksheet
description: Process a marksheet from extracted JSON to validated, committed student result. Re-validate after edits.
tools:
  - get-active-marksheet
  - format-marksheet-document
  - validate-marksheet
  - auto-fix-marksheet
  - commit-marksheet
  - search-school-directory
  - get-academic-context
  - choose-document
config:
  locked: false
---

# Marksheet Processing

The teacher types `/marksheet` or `/validate` to invoke you.

## 1. Identify the document

Read `requestContext.get('fileReferences')`. If exactly 1 file with a `documentId`, the `defaultDocumentId` is already set on the request context by the chat composer. If multiple, call `choose-document` after asking the teacher which one. If zero, ask the teacher to upload a marksheet first.

## 2. Call format-marksheet-document

Call `format-marksheet-document` with `{ documentId: <id> }`. The tool emits `data-createDocument` parts to the stream (processing → streaming → success). The editor panel opens automatically on the first streaming chunk.

After the tool returns, say: "I've prepared the marksheet. Review in the editor and click **Validate** when ready."

## 3. Wait for the user to click Validate

The Validate FAB is in the editor. When the teacher clicks it, a new chat turn is sent via the chat composer (text: `/validate` or empty). You will see the next user message. Proceed to step 4.

## 4. Call validate-marksheet

Call `validate-marksheet` with `{ documentId: <id>, correctedMarkdown: <read the markdown from the workspace> }`.

To get the markdown path: it's at `exams/examType-<tenant.examTypeId>/<safeTitle>.md` where `safeTitle` is the teacher's name with non-alphanumeric chars replaced by `_`. Use `readActiveMarksheet` (or `get-academic-context` + a DB query) to resolve the title.

The tool:
- ALWAYS re-derives the JSON from the markdown via the document agent (Model B, 1-2s)
- Writes the re-derived JSON to `extracted/<documentId>.json`
  - Runs `marksheetSchema.safeParse`
- Returns `{ ok: true }` or `{ ok: false, errors }`

## 5. Handle the result

- **ok: true**: go to step 7.
- **ok: false**: call `auto-fix-marksheet` with `{ documentId, errors, currentMarkdown }`. The tool:
  - Patches the JSON at ≥80% confidence via the document agent
  - Writes the patched JSON to `extracted/<documentId>.json`
  - Re-renders the markdown from the patched JSON and re-emits `data-createDocument` (so the editor shows the new content)
  - The auto-applied regions briefly highlight in the editor (yellow, 3s fade)
  - Returns `{ appliedFixes, unresolvedErrors, reStreamedArtifactId }`

Tell the teacher: "I auto-fixed N issues. Re-review the editor and click **Validate** when ready, or edit and re-validate." If `unresolvedErrors.length > 0`, list them for the teacher.

## 6. (Loop) If the user re-edits, repeat from step 3.

## 7. Call commit-marksheet

Call `commit-marksheet` with `{ documentId }`. The tool:
- Reads the latest JSON from `extracted/<documentId>.json`
  - Calls `AssessmentService.upsertMarksheet(marksheet)`
- Removes the document from the manifest
- Emits `data-committed { artifactId, recordId, studentName }`

After the tool returns, the editor stays open and is editable. Say: "Saved {studentName} (record #{recordId}). You can edit further — any new edits show a Re-validate FAB. Or type `/generate <student>` to create a PDF, or `/publish <student>` to send to parents."

## 8. End of turn

After step 7, the turn is over. Do NOT chain into `/generate` or `/publish` unless the teacher explicitly says so in the same message.
