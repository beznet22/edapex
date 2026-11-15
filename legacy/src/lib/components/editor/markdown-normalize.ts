/**
 * Markdown canonicalization for byte-equivalence comparisons.
 *
 * Trims, normalizes CRLF -> LF, and collapses 3+ consecutive blank lines to 2.
 * Used by /demo/editor to compute the round-trip stability indicator.
 */
export function normalizeMarkdown(input: string): string {
    return input.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
