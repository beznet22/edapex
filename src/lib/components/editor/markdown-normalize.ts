/**
 * Markdown canonicalization for byte-equivalence comparisons.
 *
 * Used by both `WysiwygEditorController.syncExternalContent` (editor ←
 * external file) and the auto-save guard in `editor-canvas.svelte`
 * (editor → file) so that `tiptap-markdown@0.9.0`'s parse/serialize
 * round-trip never triggers a spurious write.
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

/**
 * Strips blank lines that fall INSIDE a markdown table.
 *
 * `tiptap-markdown@0.9.0` terminates a table at the first blank line after
 * the separator row — a behaviour stricter than GFM (GitHub, VSCode,
 * and every modern renderer accept blank lines inside tables). For a
 * document like a marksheet where the LLM's first draft puts a blank line
 * between the separator and the first data row, every data row falls
 * through as a literal `<p>` containing pipe characters instead of
 * becoming a `<tr>`.
 *
 * This preprocessor finds every "table opener" (a header line `|...|`
 * immediately followed by a separator line `| --- |`) and removes all
 * blank lines until the next non-table line. One pass, no regex on full
 * text, no allocations beyond the line array.
 */
export function stripBlankLinesInTables(input: string): string {
    const lines = input.split("\n");
    const out: string[] = [];
    const tableRowRe = /^\s*\|.*\|\s*$/;
    const separatorRe = /^\s*\|[\s\-:|]+\|\s*$/;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        out.push(line);
        const isTableHeader = tableRowRe.test(line);
        if (isTableHeader && i + 1 < lines.length && separatorRe.test(lines[i + 1])) {
            out.push(lines[i + 1]);
            i += 2;
            while (i < lines.length) {
                const next = lines[i];
                if (tableRowRe.test(next)) {
                    out.push(next);
                    i++;
                } else if (next.trim() === "") {
                    i++;
                } else {
                    break;
                }
            }
            continue;
        }
        i++;
    }
    return out.join("\n");
}
