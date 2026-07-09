# Demo editor page: pure WysiwygEditor rendering isolation

- **Date:** 2026-07-08
- **Author:** Kimchi (brainstorm session)
- **Status:** Draft, pending user review
- **Parent problem:** After streaming finishes, `<Markdown>` (streamdown) in `src/lib/components/workspace/ArtifactViewer.svelte` does not switch to the editor canvas, and the streamed markdown is corrupted (`/home/beznet/Workspace/edapex/.workspaces/1/AY4-2025/2026/12-c_5-a/marksheets/adakole_jpg-0adbef75.md`).

## Goal

Determine whether the corruption reproduces *inside* the `WysiwygEditor` (Tiptap / tiptap-markdown parsing) or only in the streaming → `<EditorCanvas>` switch path in `ArtifactViewer.svelte`.

The demo page is **read-only** rendering isolation. No streaming, no chat context, no inspector, no auto-save.

## Non-goals

- No fix to `ArtifactViewer.svelte` in this spec. That comes after the demo confirms which half of the system breaks.
- No comparison with the `<Markdown>` streamdown render (out of scope; we only test the editor).
- No PUT / auto-save wiring (the demo is pure render).
- No Novel.sh parity validation (the `novel/` reference is gitignored).

## Route

- **Path:** `/demo/editor`
- **Files:**
  - `src/routes/demo/editor/+page.svelte`
  - `src/routes/demo/editor/+page.ts`
- **Access:** Public (any logged-in user). No gating.
- **SSR:** `ssr = false`, `prerender = false`. Keeps the demo out of pre-rendering and out of the static build manifest.

## Layout

Responsive split pane. On screens narrower than 768 px, the panes stack vertically (raw on top, editor below). On wider screens, side-by-side.

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar                                                         │
│ [path input] [Load] [Reload] [editable⇄] [Show JSON ▾]          │
├──────────────────────────────────┬──────────────────────────────┤
│ RAW (left)                       │ RENDERED (right)             │
│ <pre class="font-mono">{md}</pre> │ <WysiwygEditor content={md}/>│
│                                  │                              │
├──────────────────────────────────┴──────────────────────────────┤
│ Diagnostics strip (collapsible)                                 │
│ bytes: 1,234 | lines: 56 | table rows: 7 | nodes: 42 | ⓘ        │
└─────────────────────────────────────────────────────────────────┘
```

## Data flow

1. Page mounts.
2. Read `?file=<path>` from the URL. If present, treat as initial file path.
3. `loadFile(path)`:
   - `fetch('/api/file/${encodeURIComponent(path)}')` — uses the existing `GET` handler at `src/routes/api/file/[...path]/+server.ts`, which returns `Cache-Control: no-store`.
   - On 2xx: store response text in `rawMarkdown` `$state`. Clear any prior error.
   - On non-2xx: store response status + body in `loadError` `$state`. Keep prior `rawMarkdown` (don't blank the page on a refresh failure).
   - On `AbortError` (timeout): set `loadError = 'Request timed out after 10 s'`.
4. `<WysiwygEditor content={rawMarkdown} onUpdate={handleEditorUpdate} editable={editable} />`.
5. `handleEditorUpdate(markdown)`: updates `editorMarkdown` `$state`. The diagnostics strip re-renders derived counts.
6. Toolbar `[Load]` re-runs `loadFile(pathInput)` with the typed path. `pathInput` is a `$state` mirror of the input element's value; pressing Enter submits.

## Components and reuse

| Source | Reused as | Notes |
|---|---|---|
| `src/lib/components/editor/WysiwygEditor.svelte` | Direct import | Same component used by `editor-canvas.svelte`. No changes. |
| `src/lib/components/editor/markdown-normalize.ts` | Indirect (via editor controller) | Already wired into `controller.syncExternalContent`. |
| `src/routes/api/file/[...path]/+server.ts` (GET) | Direct fetch | Existing endpoint; no changes. |
| `$lib/components/ui/*` (button, input, tooltip, scroll-area) | Direct import | Existing shadcn-svelte components. |
| `@lucide/svelte/icons/*` (file-text, refresh-cw, alert-circle) | Direct import | Existing icon set. |

No new dependencies. No new server endpoints. No changes to `WysiwygEditor`, `editor-canvas`, `thread-data.svelte.ts`, `chat-context.svelte.ts`, `inspector-context.svelte.ts`, or the API routes.

## Diagnostics

A collapsible strip at the bottom of the page surfaces:

- `bytes` — `new Blob([rawMarkdown]).size`
- `lines` — `rawMarkdown.split('\n').length`
- `tableRows` — `rawMarkdown.split('\n').filter(l => /^\s*\|/.test(l)).length`
- `editorNodes` — `$editor?.state.doc.childCount` (read via `editor.getJSON().content.length` for stability across schema versions)
- `normalizedEqual` — boolean from `normalizeMarkdown(rawMarkdown) === normalizeMarkdown(editorMarkdown)` to confirm the parse/serialize round-trip is stable
- `[Show JSON ▾]` — collapsible `<pre>` dump of `editor.getJSON()` (the parsed Tiptap document)

A `[Copy as markdown]` button next to `[Show JSON]` copies `editorMarkdown` to clipboard so we can paste the editor's serialized output back into a file for round-trip analysis.

## Error handling

| Failure | Surface |
|---|---|
| `/api/file/...` returns 401 / 403 / 404 / 500 | Inline banner above the panes: `Failed to load <path>: HTTP <status> — <body>` |
| Network error / `fetch` throws | Banner: `Network error: <message>` |
| 10 s timeout (manual `AbortController` + `setTimeout`) | Banner: `Request timed out after 10 s` |
| Empty file (200 with empty body) | Editor renders the placeholder; no error |
| Tiptap `setContent` throws | Banner: `Editor parse error: <message>`; raw view still shown |

Errors are non-blocking: the raw view stays visible so we can still inspect the file even when the editor fails to parse it.

## Responsive design

Follows `docs/responsive_design.md`:

- ≥ 1280 px: side-by-side, 50 / 50 split
- 768–1279 px: side-by-side, 40 / 60 (editor wider, raw collapses to a toggle)
- < 768 px: stacked (raw on top, editor below); both panes full-width

Plain CSS grid with `grid-template-columns: 1fr 1fr` plus a `@media (max-width: 767px)` rule that flips to a single column. No JS breakpoint helper — keeps the demo deterministic and dependency-free.

## Files to create

```
src/routes/demo/editor/+page.svelte   # the page (~200 lines)
src/routes/demo/editor/+page.ts       # ssr=false, prerender=false
```

Total: 2 new files, 0 modified files.

## Acceptance criteria

1. `pnpm run dev` boots without errors.
2. Navigating to `/demo/editor?file=marksheets/adakole_jpg-0adbef75.md`:
   - Left pane shows the raw markdown byte-for-byte.
   - Right pane shows `WysiwygEditor` rendering that markdown.
   - No console errors on mount or after load.
3. If the table corruption reproduces inside `WysiwygEditor`, the bug is in Tiptap / tiptap-markdown parsing. If the table renders correctly here but is broken in production, the bug is in the `ArtifactViewer` switch path.
4. Typing a new path in the input + clicking `[Load]` fetches and re-renders without a full page reload.
5. `[Reload]` re-fetches the current path.
6. `[editable⇄]` toggle disables / enables the editor; the visual state reflects `editable`.
7. `[Show JSON ▾]` reveals the Tiptap document JSON.
8. `[Copy as markdown]` copies `editorMarkdown` to the clipboard.
9. The page is keyboard-navigable (tab order: path input → Load → Reload → editable → Show JSON → Copy).
10. At 320 px, 768 px, and 1280 px viewport widths the layout adapts without horizontal scroll.
11. `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte` exits 0.
12. `pnpm run lint src/routes/demo/editor/+page.svelte` exits 0.

## Out of scope (re-stated)

- No streaming, no `InspectorContext`, no `ChatContext`, no `documentStreams`, no `ShimmerArtifactCard`, no `WorkspaceSidebar`.
- No PUT / save wiring.
- No fixes to `ArtifactViewer.svelte` or the streaming chain. Those land in a follow-up spec after this demo confirms which half of the system breaks.

## Followup (post-demo)

After the demo confirms whether the corruption reproduces inside the editor or only in the switch path:

- If **inside the editor**: spec a fix in `WysiwygEditor.svelte` (likely a markdown-preprocessing step in `controller.syncExternalContent` or a tiptap-markdown config tweak).
- If **only in the switch**: spec a fix in `ArtifactViewer.svelte` — likely a fallback that derives `initialMarkdownPath` from `entry.fileName` + the documentId hash (using `deriveInitialFilename` from the server tool, mirrored on the client) so the switch happens even when `toolPart.state` never transitions to `"output-available"`.

Both followups get their own brainstorm → spec → plan → implementation cycle.
