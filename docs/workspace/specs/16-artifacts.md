# 16 — Artifacts: Inline Card, Side Panel and Renditions

**Draft.** Defines artifact UI and streaming behavior. Implementation belongs to Phase 10. The document engine is in `22-documents-and-artifacts.md`.

## Artifact model

```ts
type ArtifactKind =
  | "document"
  | "report"
  | "page"
  | "slides"
  | "dashboard"
  | "design"
  | "design-system"
  | "data"
  | "pdf"
  | "docx"
  | "image"
  | "code"
  | "react"
  | "html";

type ArtifactStatus =
  | "streaming"
  | "ready"
  | "editing"
  | "saving"
  | "error"
  | "archived";

interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  status: ArtifactStatus;
  version: number;
  sourceFormat: "markdown" | "page-json" | "report" | "csv" | "pdf" | "docx" | "html";
  sourceMessageId: string | null;
  dataClass: "workspace" | "edapex" | "edapex-ephemeral";
  createdAt: number;
  updatedAt: number;
}
```

Artifacts own:

- **versions** — immutable source content;
- **imports** — source file, parser, parser version, warnings;
- **renditions** — derived PDF/DOCX/CSV/HTML/PNG, tied to a version.

Renditions are replaceable; source versions are not.

## Artifact kinds and actions

| Kind | Source | Inline edit | Downloads |
|---|---|---|---|
| `document` | Markdown / Tiptap | Yes | MD, DOCX, PDF |
| `report` | Marksheet/transcript data | No; fixed panel | PDF, DOCX |
| `page` / `slides` / `dashboard` | OpenDuet page JSON | No; page viewer | PDF |
| `data` | CSV | Table editor only | CSV, PDF |
| `pdf` | Uploaded/generated PDF | No | PDF |
| `docx` | Uploaded DOCX | No | DOCX |
| `image` | Uploaded image | No | Original |
| `code` / `react` / `html` | Source | Sandboxed preview | Source/HTML |

Reports and pages do not become Tiptap documents. Parsing an uploaded PDF/DOCX creates a new `document`; the original remains read-only.

## Inline card

The inline card belongs to the message/turn that produced it.

- Shows title/type, status, version and a 2–4 line preview/thumbnail.
- “Writing” is the generation/editing label; save state belongs in the panel.
- While streaming: progress/caret, no editing.
- When ready: **Open**, **Copy**, **Download**, **Open side panel**.
- Double-diagonal-arrow opens the side panel.
- Quick inline editing is available for `document` only; it uses the same minimal Tiptap as the side panel.
- A card never becomes a report/page/CSV editor inside the transcript.
- Cards are ordered at the end of their turn.

## Side panel

| Surface | Presentation |
|---|---|
| Desktop | Resizable split view: chat left, artifact right; default 38/62; min chat 360px, artifact 480px |
| Tablet | 50/50 or overlay panel depending width |
| Tauri mobile | Full-screen sheet with back/close |
| v2 | Native sheet/panel; same contract |

Panel requirements:

- Header: **Document** dropdown, copy, undo, redo, download, expand, close.
- No persistent formatting toolbar. The editor is contextual: slash menu, selection bubble, table focus menu.
- Body: minimal Tiptap for documents; PDF.js for PDFs; table for CSV; fixed report/page viewer for those kinds.
- Download menu is separate from the Document dropdown.
- Dirty-state close confirmation; focus restoration to the inline card.
- Optional “Ask about this artifact” composer/action; it sends an artifact-scoped turn.
- Version/rendition history without losing the current editor state.
- Comments/mentions open a side thread or mobile sheet; no inline comment cards.

### Side-panel expand

- Inline double-diagonal-arrow → open side panel.
- Side-panel double-diagonal-arrow → full-screen focus.
- Close (X) → return to split view/chat; inline card remains.
- Escape/back behavior follows the platform.

## Minimal Tiptap surface

Both inline and side panel use the same minimal Tiptap instance.

- “Start writing” placeholder.
- Slash menu: Generate text, Divider, Emoji, Table, Checklist, Text, Heading 1–3, Numbered list, Bulleted list.
- Selection bubble: Ask for changes, link, bold, italic, text style.
- AI prompt: “Tell xcodex what to write.”
- AI draft: Undo / Accept all.
- Contextual table toolbar: add/remove row/column, header row, alignment.
- Block drag: reorder, duplicate, delete, turn into.
- Outline/find: header/overflow; mobile sheet.
- Word count/reading time: panel footer only.
- Callouts: info/success/warning/risk.
- Template picker: memo, letter, meeting notes, lesson plan, report outline, school notice.
- Checklist: optional staff assignee and due date; optional OpenDuet task link.
- Sign-off block: visual name/role/date/status; real approval through approvals.
- Comments/mentions: staff-only mentions; side thread; unresolved count.

No persistent formatting toolbar. Only one sheet/popover open at a time. Page break/print preview is template-owned, not an editor feature.

## Editor content model

- Canonical document source: Markdown; Tiptap is the editor.
- Tiptap JSON may be used as an internal working representation, but persistence and export use Markdown.
- Novel is **not** the editor dependency; it is a visual reference only. No `novel` package, source copy or AI SDK completion path. See `44-reference-app-audits.md`.
- Streamdown renders chat/artifact Markdown; it is not the editor.
- Reports/pages use their structured models, not Markdown/Tiptap.

## Streaming contract

Use artifact-scoped events/deltas, not one transcript message per token:

```text
artifact_start  { artifactId, kind, title, version, dataClass }
artifact_delta  { artifactId, version, delta }
artifact_finish { artifactId, version, contentRef, checksum }
artifact_error  { artifactId, version, code, message }
```

- Inline card shows progress from the event stream.
- Panel may open during streaming; editor read-only until `finish`.
- A single artifact stream must not create a new chat message per token.
- Persist only after `finish`/explicit save; version on every save.
- On error, keep the last valid version and show retry/regenerate.

## Renditions

- A rendition is generated from a specific artifact version.
- UI lists format, version, size, checksum, status and created time.
- Generation is idempotent by `(artifact_id, version, format, template_version)`.
- Regenerate creates a new rendition; delete is explicit.
- `workspace` renditions may be local; `edapex` renditions live in Worker/R2; `edapex-ephemeral` renditions are memory/download only.
- No school-data rendition is written to iroh/Yjs/local durable storage.

## Imports

- Drop/upload DOCX, PDF, CSV or Markdown.
- Preview the parsed result and warnings before creating a document.
- DOCX → Mammoth → sanitized HTML → Turndown GFM → Markdown.
- PDF → PDF.js text extraction → Markdown draft; tables/images may be lost; no OCR.
- CSV → PapaParse preview; small files may create a Markdown table; large files stay data artifacts.
- Imported content never writes authoritative marksheets, transcripts, enrollment or fees.
- Original file remains read-only; the parsed document is a separate artifact.

## Security

- Sanitize Markdown/HTML; block unsafe links/images.
- PDF/DOCX/CSV parsing runs in workers with size/time caps.
- No macros, scripts, iframes or `javascript:` links.
- PDF/HTML artifacts are sandboxed; no main-origin DOM/credentials.
- Export and code execution require approval where the data class requires it.
- CSV formula injection is neutralized on export.
- Artifact content derived from school data never enters P2P sync.
- No secrets in artifact metadata, previews or titles.

## Acceptance

- Inline and panel states match for the same artifact.
- Streaming, ready, editing, saving and error are distinct.
- A card opens the side panel; closing restores focus and preserves unsaved-state confirmation.
- The side panel uses the same minimal Tiptap as inline; no full toolbar.
- Documents export to Markdown/DOCX/PDF; reports to PDF/DOCX; data to CSV/PDF; pages to PDF.
- DOCX/PDF/CSV imports show warnings and never create authoritative records.
- No token-per-message transcript spam.
- No `novel` package or copied Novel source; the editor is Tiptap.
- No school data or session token is persisted/synced.
