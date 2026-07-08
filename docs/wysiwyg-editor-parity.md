# WysiwygEditor × svelte-streamdown shadcnTheme — Parity Status

Tracking the gap between `src/lib/components/editor/WysiwygEditor.svelte` and the svelte-streamdown `shadcnTheme` markdown preview rendered by `src/lib/components/prompt-kit/markdown/Markdown.svelte`.

**Reference:** `node_modules/svelte-streamdown/dist/theme.js` lines 169–308 (`shadcnTheme`).
**Last updated:** 2026-07-07.

---

## 1. Original parity gaps (at session start)

Every issue identified before this session's work began.

| Category | Gap | shadcnTheme key |
|----------|-----|-----------------|
| **Layout** | Tables overflow the editor instead of horizontally scrolling inside a wrapper | `table.base` |
| **Layout** | `<tfoot>` cells are unstyled | `tfoot.base` |
| **Layout** | Editor inner padding too large on mobile (fixed `px-6 py-4`) | — |
| **Layout** | No iOS touch-momentum scroll on overflowing containers | — |
| **Visual** | Blockquote wrong border width (2px), wrong color (`primary/40`), wrong margins (`mt-1 mb-1`) | `blockquote.base` |
| **Visual** | Lists use `list-style-position: outside` + extra `padding-left: 1.5rem` (preview uses `list-inside`) | `ul.base` / `ol.base` |
| **Visual** | Table rows have no hover state | `tr.base` |
| **Visual** | Images left-aligned instead of centered | `image.base` |
| **Visual** | Callout colors hardcoded `oklch()` literals instead of theme tokens | `alert.{note,tip,warning,caution,important}` |
| **Feature** | `[text](url)` markdown links dropped on parse (no Link mark in schema) | `link.base` |
| **Feature** | Description lists (`<dl>/<dt>/<dd>`) unsupported — silently dropped | `descriptionList` / `descriptionTerm` / `descriptionDetail` |
| **Feature** | Code block has no header chrome — no language pill, no copy button | `code.header` / `code.language` / `code.buttons` + `components.button` |
| **Code org** | CSS bundled in a single ~700-line `<style>` block — hard to navigate | — |
| **Verified** | h2–h6 margins already correct (`mt-6 mb-2`) | `h1–h6.base` |
| **Verified** | Link `target="_blank"` parity — no issue (no Link mark, no `target` attr to strip) | — |

---

## 2. Shipped (this session)

Every fix landed in code with file references.

| # | Gap closed | Implementation |
|---|------------|----------------|
| 1 | Responsive table scroll | Moved `overflow-x: auto` + `border` + `border-radius` from `<table>` to Tiptap's `.tableWrapper` div (`<table>` is `display: table` and ignores `overflow`). See `styles/tables.css`. |
| 2 | `<tfoot>` styling | `bg-muted/50` background + `border-top` + muted-foreground cell text. See `styles/tables.css`. |
| 3 | Mobile padding | `px-4 py-3 sm:px-6 sm:py-4` on Tiptap `attributes.class`. |
| 4 | iOS touch momentum | `-webkit-overflow-scrolling: touch` on `.tableWrapper`. |
| 5 | Blockquote parity | Removed conflicting `StarterKit.blockquote.HTMLAttributes` (relied on global CSS for `border-l-4 border-muted-foreground/30 my-4 pl-4 italic`). |
| 6 | Lists parity | `list-style-position: inside`, removed extra `padding-left`. |
| 7 | Table row hover | `transition: background-color` on `tr`; `tbody tr:hover` → `bg-muted/50`. |
| 8 | Image centering | `display: block; my-4; mx-auto; width: fit-content` on `.tiptap img`. |
| 9 | Callout color tokens | Scoped vars `--callout-{note,tip,warning,important}-color` on `.wysiwyg-editor-wrapper`. `caution` keeps `--destructive`. |
| 10 | Link extension | New dep `@tiptap/extension-link@3.27.3` (peer-dep warning: wants `@tiptap/core@3.27.3`, project has `3.23.6` — same mismatch as `table`/`mention`, accepted). Configured with `openOnClick: false`, `autolink: true`, `linkOnPaste: true`, `rel="noopener noreferrer"`, `class="tiptap-link"`. |
| 11 | Description lists | New extension `extensions/description-list.ts` with three nodes (`descriptionList` / `Term` / `Detail`) + markdown-it parse rule for `Term\n:   Definition` syntax + serialize back. |
| 12 | Code block header | Custom NodeView in `extensions/code-block-lowlight.ts` wraps `<pre>` in `.code-block-wrapper` with `.code-block-header` (language label + copy button, 1.5s success feedback). |
| 13 | CSS organization | Extracted from one ~700-line `<style>` block into `styles/{editor,blocks,tables,code,media,chrome}.css` partials, imported via `import "./styles/editor.css";` in `WysiwygEditor.svelte`. |
| 14 | Link slash-menu item | `Link` entry in `extensions/slash-menu.ts` — prompts for URL (empty = remove; no selection = also prompts for link text). |
| 15 | Link CSS polish | `:focus-visible` ring + `.ProseMirror-selectednode` background tint on `<a>` in `styles/blocks.css`. |

**Verification:** `pnpm run check` clean — only the pre-existing `editable` closure warning at line 165 remains (unrelated to this session). CSS refactor verified zero rules dropped via selector diff: 80 original `:global(...)` selectors + 1 non-global (`.ai-prompt-anchor`) all found in the new partials (multi-line + comma-separated selectors were targeted with `grep -F` after initial awk diff gave 26 false positives).

---

## 3. Still missing — needs to be shipped

### 3.1 Open work (small scope, no new deps)

| Gap | Priority | Estimate | Notes |
|-----|----------|----------|-------|
| iOS Safari touch-scroll QA on `.tableWrapper` | P3 | 10 min | Manual test on real device. Checklist in §5. |
| Link click navigation (Cmd/Ctrl-click or middle-click to open) | P4 | ~¼ day | `openOnClick: false` is intentional to keep selection working. Polish only. |

### 3.2 Deferred (require larger scope or new paid deps)

| Gap | Why deferred | What's needed |
|-----|--------------|---------------|
| **Mermaid diagrams** | EdApex doesn't produce them | `@tiptap/extension-mermaid` + mermaid render pipeline (custom NodeView + async render). ~1–2 days. |
| **Math (KaTeX)** | Not used in current EdApex docs | `@tiptap/extension-mathematics` + paste/serialize path for `$...$` / `$$...$$`. ~1 day. |
| **Footnotes** | Not used in current EdApex docs | `@tiptap-pro/extension-footnote` — Tiptap Pro license required. ~1 day + license cost. |
| **Inline citations** | EdApex doesn't produce URL previews | Custom node + fetching view for `inlineCitation.preview`/`carousel`/`list`. ~1–2 days. |
| **Streaming code-block skeleton** | Editor doesn't stream code blocks | `code.skeleton` from preview; N/A in editor context. |

---

## 4. Reference

### 4.1 File structure

```
src/lib/components/editor/
├── WysiwygEditor.svelte              ← logic only (script + template)
├── extensions/
│   ├── code-block-lowlight.ts        ← CodeBlock + NodeView with header
│   ├── description-list.ts           ← dl/dt/dd nodes + markdown-it parse
│   ├── callout.ts                    ← aside[data-callout] block
│   └── slash-menu.ts                 ← / command items (now includes Link)
└── styles/
    ├── editor.css                    ← entry: @imports all partials
    ├── blocks.css                    ← h1–h6, p, ul/ol/li/task list, blockquote, hr, sup/sub, del, strong/em/a, callouts, description lists, links
    ├── tables.css                    ← table, thead, tbody, tfoot, tr, td, th, .tableWrapper
    ├── code.css                      ← pre, code, syntax highlighting (hljs-*), code-block NodeView chrome
    ├── media.css                     ← img, .img-placeholder
    └── chrome.css                    ← selection, mention, AI popover anchor, drag handle, dark mode variants, task list checked
```

### 4.2 shadcnTheme → editor partial mapping

| shadcnTheme group | Editor partial | Status |
|--------------------|----------------|--------|
| link, h1–h6, paragraph, ul, ol, li, blockquote, hr, sup, sub, del, strong, em, a, codespan | `styles/blocks.css` | ✅ |
| descriptionList, descriptionTerm, descriptionDetail | `styles/blocks.css` | ✅ |
| table, thead, tbody, tfoot, tr, td, th | `styles/tables.css` | ✅ |
| code (header, language, buttons, base, container, pre, line), hljs-* | `styles/code.css` | ✅ |
| image | `styles/media.css` | ✅ |
| selection, mention, drag handle, AI popover, task list checked | `styles/chrome.css` | ✅ |
| mermaid, math, br, footnoteRef, inlineCitation | — | ❌ deferred (see §3.2) |

---

## 5. iOS Safari QA checklist (pending)

When the `-webkit-overflow-scrolling: touch` change is verified on a real iOS device:

- [ ] Insert a wide table (e.g., 5 columns × 200px min-width) into the editor.
- [ ] Touch-drag the table horizontally inside `.tableWrapper`.
- [ ] Confirm momentum coast continues briefly after lift.
- [ ] Confirm the rounded corners stay clipped during scroll (no cell-content bleed).
- [ ] Resize the editor narrower than the table → wrapper scrolls horizontally while the table stays full-width.
- [ ] Confirm no scroll-induced layout shift or jank.

When all items are checked, remove this section and the P3 entry from §3.1.
