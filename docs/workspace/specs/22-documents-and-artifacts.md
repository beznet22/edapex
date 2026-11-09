# 22 — Documents, Artifacts and Renditions

**Draft.** Phase 9B decision. No dependency is installed by this document.

## Decision

Use a local-first document engine with a small, explicit library set:

| Need | Engine | License | Approx. cost |
|---|---|---|---|
| PDF generation | **IronPress** (`ironpress` Rust crate; `ironpress` WASM on web) | MIT | 6.4 MB gzip WASM; native Rust in Tauri |
| PDF preview and text extraction | **PDF.js** (`pdfjs-dist`) | Apache-2.0 | 133 KB gzip JS + worker/cmaps |
| DOCX generation | **`docx`** (`docx/html` for generic docs; direct builders for reports) | MIT | 83 KB gzip |
| DOCX preview/import | **Mammoth** → sanitized HTML | BSD-2-Clause | 93 KB gzip |
| HTML → Markdown | **Turndown** + **turndown-plugin-gfm** | MIT | 4.2 KB + 1 KB gzip |
| CSV parse/generate | **PapaParse** | MIT | 6.7 KB gzip |
| Markdown → HTML (export) | **marked** | MIT | 15 KB gzip |
| Editable documents | **Tiptap** (minimal surface; open-source extensions) | MIT core | Editor-sized |
| Markdown preview | **Streamdown** | MIT | Existing chat renderer |
| Sanitization | **DOMPurify** | Apache-2.0 / MPL-2.0 | Small |

No Novel dependency, source copy or AI SDK completion. No assistant-ui, CopilotKit, A2UI or MCP Apps in this engine. Reference enforcement: `44-reference-app-audits.md`.

## Why IronPress

IronPress renders HTML/CSS/Markdown to PDF bytes in-process:

- flexbox, grid, tables, multi-column, `@page`, headers/footers;
- custom TTF fonts with subsetting, SVG, math, images;
- PDF 1.4 with bookmarks, links and headers/footers;
- HTML sanitization and constrained resource access;
- Rust crate for Tauri and WebAssembly for the browser;
- no headless browser, no server subprocess.

It is younger than the rest of the stack (created 2026-03; 1.7.0; 606 stars; 815 commits; 3,200+ tests). It is accepted with guardrails:

- pin the version;
- use the Rust crate in Tauri, lazy-load WASM on web;
- run visual-parity tests on the report/transcript templates;
- cap HTML size, page count and conversion time;
- keep a fallback to browser print or a simpler PDF path only if a measured target fails.

IronPress generates PDFs; it does not parse them.

## Why PDF.js

PDF.js is the single library for:

- canvas preview with page navigation and zoom;
- text extraction for PDF → Markdown;
- text layer/selection where required.

It does not reconstruct tables or layout into Markdown. Scanned/image-only PDFs have no text layer; no OCR in v1.

## Why `docx`

`docx` is browser- and Node-capable, MIT, and supports tables, images, headers, footers and sections. It also ships `docx/html` for HTML → DOCX content.

- **Generic documents:** Markdown → sanitized HTML → `docx/html` → `Packer.toBlob`.
- **Reports/transcripts:** direct `docx` builders for precise tables, headers and page structure. HTML conversion is not the source of truth for these.

No `@turbodocx/html-to-docx`: it is much larger (~483 KB gzip), Node-oriented, and unnecessary.

## Why Mammoth + Turndown

Mammoth converts DOCX to semantic HTML (headings, lists, tables, images, links, notes). Its Markdown output is deprecated, so:

```text
DOCX → Mammoth HTML → DOMPurify → Turndown + GFM → Markdown
```

Mammoth does **not** sanitize; run it in a worker, disable external file access, cap time/size, and sanitize before rendering or converting.

Mammoth's semantic preview is the v1 DOCX preview. It is not page-perfect; label it accordingly. Add `docx-preview` only if page fidelity becomes a measured requirement.

## Why Tiptap, not Novel

The selector UI in the design reference is Novel-style, but the runtime is Tiptap:

- Tiptap is headless, MIT, ~39k stars, actively maintained, and already used by the legacy EdApex editor.
- Novel is ~16.5k stars, Apache-2.0, but is a Tiptap-based editor plus Vercel AI SDK completion and an opinionated UI. That conflicts with xcodex ownership and adds a second AI surface.
- Recreate the minimal Novel-style slash menu, bubble menu and AI prompt on Tiptap; do not copy Novel source or add its AI SDK.

Use only open-source Tiptap extensions. Do not use Pro/paid extensions for core v1 behaviour.

## Format pipelines

### PDF generation

```text
report data / Markdown / page JSON
  → host-owned HTML template (Gold on Slate, print CSS)
  → sanitize
  → IronPress:
       Tauri: Rust command
       web: lazy WASM HtmlConverter
  → PDF bytes
  → preview (PDF.js) / download / rendition
```

- A4/Letter, margins, headers/footers, page breaks, school logo, embedded fonts.
- Browser WASM does not read paths or fetch remote assets; images are data URLs, fonts are bytes.
- Native Tauri uses the Rust crate and avoids shipping the WASM blob.
- Batch generation (e.g. whole-class reports) prefers Tauri/Rust; web is capped.

### PDF preview and parsing

```text
PDF bytes
  → PDF.js document
  → canvas preview / text extraction
  → page breaks + headings heuristic → Markdown draft
  → warnings: tables/images/layout may be lost
```

- No OCR; no automatic authoritative-record writes.
- Import creates a new document artifact; the original PDF remains read-only.

### DOCX generation

```text
Document: Markdown/Tiptap HTML → sanitize → docx/html → Packer
Report: structured Marksheet/Transcript → direct docx builders → Packer
```

- Generic docs preserve headings, lists, tables, links, images and basic formatting.
- Reports get exact tables/headers/footers and school identity.
- DOCX and PDF layouts are siblings from the same data, not pixel-identical promises.

### DOCX import and preview

```text
DOCX → worker → Mammoth HTML → DOMPurify
  ├─ preview: sanitized HTML
  └─ Markdown: Turndown + GFM → new document artifact
```

- Images: extract as attachments or data URLs; do not inline huge base64 blobs into Markdown.
- Tables: semantic table conversion; borders/styling are not preserved.
- Reject `.docm`/macros and encrypted documents.
- Warnings are shown; no silent “perfect conversion” claim.

### CSV

```text
CSV file → PapaParse worker → rows/schema → preview table
  ├─ small file: optional Markdown table
  └─ large file: data artifact + schema/sample; agent queries via tools
```

- Generate with `Papa.unparse`.
- Escape formula-leading cells (`=`, `+`, `-`, `@`) to prevent CSV injection.
- UTF-8 BOM optional for Excel compatibility.
- Do not dump an entire large CSV into the model context.

### Markdown documents

- Canonical editable form: Markdown; Tiptap is the editing surface.
- Preview: Streamdown.
- PDF: Markdown → marked → sanitized HTML → IronPress.
- DOCX: Markdown → marked → sanitized HTML → `docx/html`.
- Imported DOCX/PDF creates a Markdown document plus warnings.

### OpenDuet pages

`openduet_pages` remains a structured page/slides/dashboard/doc/design/design-system JSON model.

- View with the OpenDuet page viewer.
- PDF export uses a host-owned page HTML serializer → IronPress.
- Do not convert pages to Tiptap or DOCX in v1.
- Not every page can be a DOCX; download menu exposes PDF only.

## Artifact model

An artifact has a source and derived renditions.

```text
artifact
  ├─ versions (source content)
  ├─ imports (source file → parsed document, warnings)
  └─ renditions (PDF/DOCX/CSV/HTML/PNG, tied to a version)
```

Source shapes:

- `markdown` document;
- `page-json` OpenDuet page/slides/dashboard;
- `report` structured marksheet/transcript data;
- `csv` data;
- `pdf` uploaded/read-only;
- `docx` uploaded/read-only;
- `image`/`code`/`html` existing types.

Renditions are derived and replaceable; source versions are immutable.

## Editor surface

The side panel and inline card use the **same minimal Tiptap instance**, not a full toolbar-rich editor.

- placeholder, slash menu, selection bubble menu;
- AI prompt and Undo/Accept-all proposal state;
- contextual table tools, block drag handle;
- outline/find, word count, comments/mentions in the panel shell;
- no persistent formatting toolbar;
- double-diagonal-arrow on the inline editor opens the side panel;
- side-panel double-arrow is full-screen; close returns to split view.

Editor features in v1:

- template picker (memo, letter, meeting notes, lesson plan, report outline, school notice);
- callouts (info/success/warning/risk);
- table mini-toolbar;
- block drag/reorder/duplicate/delete/turn-into;
- outline + find;
- smart paste from Word/Google Docs/web;
- AI actions: summarize, improve, translate, shorten, extract actions;
- checklist with staff assignee and due date;
- sign-off block (visual only; real approval through approvals);
- comments and staff-only mentions;
- word count/reading time.

Page break/print preview is not an editor feature; templates own pagination.

## Storage and data class

| Class | Source | Renditions |
|---|---|---|
| `workspace` | Local/SQLite/Yjs; sync via iroh | Local; optional cloud/R2 |
| `edapex` | Worker/R2 only | Worker/R2 only; versioned; audited |
| `edapex-ephemeral` | In memory/ephemeral | In memory/download only; never persisted or synced |

Rules:

- No school-data PDFs/DOCX/CSV in iroh/Yjs/local durable storage.
- Generated school-data files may be downloaded immediately; saving them as artifacts goes through the Worker/R2 path.
- Renditions are content-hashed and version-bound.
- Regeneration invalidates derived outputs but keeps the source version.
- Comments/mentions/sign-offs are metadata, not document content; they sync by policy.
- No P2P sync of school-data renditions.

## UI surfaces

- Inline artifact card in chat: “Writing” status, type, open side panel.
- Side panel: minimal editor, header Document dropdown, copy/undo/redo/download/expand/close.
- Download menu by type:
  - Document: Markdown, Word, PDF
  - Report/transcript: PDF, Word
  - Data/CSV: CSV, PDF
  - Page/slides: PDF
- Artifact browser: filters for documents, reports, data, pages, PDFs, images; grid/list.
- Renditions list: format, version, size, checksum, status, regenerate/delete.
- Import drop zone: DOCX/PDF/CSV/Markdown; preview warnings before creating a document.
- Comments/mentions: side thread/sheet; unresolved count in header; not inline cards.

## Limits and failure paths

Starting caps, configurable:

- DOCX/PDF upload: 20 MB.
- PDF: 200 pages for preview/extraction.
- CSV: 50 MB / 100,000 rows; preview first 200 rows.
- HTML input to IronPress: 2 MB.
- Worker timeout: 30 s.
- Markdown table conversion: 50 rows / 12 columns.
- DOCX images: extract, cap per image and total.

Failure states:

- encrypted/password PDF → refuse with a clear message;
- no text layer → “scanned PDF; OCR not available”;
- macro/encrypted DOCX → refuse;
- parse timeout → no partial authoritative artifact;
- IronPress conversion failure → keep source, show retry;
- unsupported download format → disabled/hidden, not a failed conversion.

## Security

- Treat all imported documents as untrusted.
- Run DOCX/PDF/CSV parsing in Web Workers with size/time caps.
- Mammoth: `externalFileAccess: false`; sanitize HTML.
- PDF.js: no remote fetch; page/size caps.
- IronPress: sanitize HTML; data-URL images; font bytes; no remote/local paths in WASM.
- No macros, scripts, iframes or `javascript:` links.
- CSV formula injection guard on export.
- Comments/mentions are staff-only in v1; student references use a permissioned picker, not free-text mention.
- Sign-off blocks are visual; approvals remain server-issued/validated.
- No OCR, PDF/A or tagged-PDF promise in v1.
- Exports of school-data artifacts are audited by the Worker.

## Acceptance

- A document exports to Markdown, DOCX and PDF; report/transcript exports to PDF and DOCX; CSV exports to CSV and PDF.
- PDF preview and text extraction work locally on web and Tauri.
- DOCX import produces Markdown with visible warnings; original DOCX remains read-only.
- CSV preview works on large files without freezing the UI; formula injection is neutralized.
- IronPress native and WASM produce visually matching report PDFs.
- No school-data rendition is written to local/P2P storage.
- The side panel remains the same minimal Tiptap surface as inline; no persistent formatting toolbar.
- Comments/mentions, checklists and sign-offs do not turn the editor into a project-management dashboard.
- No `novel` package, copied Novel source or `ai`/`@ai-sdk/*` completion path exists.

## Sources

- IronPress: <https://github.com/gastongouron/ironpress>
- IronPress browser guide: <https://gastongouron.github.io/ironpress/get-started/browser/>
- PDF.js: <https://github.com/mozilla/pdf.js>
- `docx`: <https://github.com/dolanmiu/docx>
- Mammoth: <https://github.com/mwilliamson/mammoth.js>
- Turndown: <https://github.com/mixmark-io/turndown>
- PapaParse: <https://github.com/mholt/PapaParse>
- Tiptap: <https://github.com/ueberdosis/tiptap>
- Novel (reference only): <https://github.com/steven-tey/novel>
