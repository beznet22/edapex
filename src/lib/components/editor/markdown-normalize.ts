/**
 * Markdown canonicalization for byte-equivalence comparisons.
 *
 * Used by both `WysiwygEditorController.syncExternalContent` (editor ←
 * external file) and the auto-save guard in `editor-canvas.svelte`
 * (editor → file) so that the editor's parse/serialize round-trip never
 * triggers a spurious write.
 *
 * The transforms are intentionally minimal: only whitespace forms that
 * the parser normalizes on parse (CRLF→LF, trim, collapse 3+ blank
 * lines to 2). Anything stricter risks hiding real edits — the helper
 * exists to absorb the editor's own canonicalization, not to compress
 * meaningful user changes.
 *
 * Order matters: trim first so a single trailing newline on disk does
 * not break the equality check; then CRLF before blank-line collapse so
 * the LF replacement sees the final line-break form.
 */
export function normalizeMarkdown(input: string): string {
    return input.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
