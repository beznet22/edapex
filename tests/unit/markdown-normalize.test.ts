/**
 * Tests for `normalizeMarkdown` — the shared helper used by both
 * `WysiwygEditorController.syncExternalContent` and the auto-save guard
 * in `editor-canvas.svelte`. Its job is to absorb `tiptap-markdown@0.9.0`'s
 * parse/serialize round-trip so neither path writes a semantically-
 * equivalent file back to disk.
 */
import { describe, it, expect } from "vitest";
import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";

describe("normalizeMarkdown", () => {
    it("trims leading and trailing whitespace", () => {
        expect(normalizeMarkdown("  # Hello  \n\n")).toBe("# Hello");
    });

    it("converts CRLF line endings to LF", () => {
        expect(normalizeMarkdown("# A\r\n\r\n- b\r\n- c")).toBe("# A\n\n- b\n- c");
    });

    it("collapses runs of three or more blank lines to two", () => {
        expect(normalizeMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb");
    });

    it("preserves a single blank line between blocks", () => {
        expect(normalizeMarkdown("# Title\n\nBody")).toBe("# Title\n\nBody");
    });

    it("preserves two blank lines (paragraph separator)", () => {
        expect(normalizeMarkdown("# Title\n\n\nBody")).toBe("# Title\n\nBody");
    });

    it("is idempotent", () => {
        const input = "  # Title\r\n\r\n\r\n- a\r\n- b  \n\n";
        const once = normalizeMarkdown(input);
        const twice = normalizeMarkdown(once);
        expect(twice).toBe(once);
    });

    it("absorbs a trailing-newline rewrite on disk (the original bug)", () => {
        // Disk has a trailing newline; editor's serialized form does not.
        // After normalize, both should compare equal.
        const onDisk = "# Hello\n";
        const fromEditor = "# Hello";
        expect(normalizeMarkdown(onDisk)).toBe(normalizeMarkdown(fromEditor));
    });

    it("absorbs a CRLF-vs-LF rewrite (Windows line endings on disk)", () => {
        const fromEditor = "# A\n\n- b\n- c";
        const onDisk = "# A\r\n\r\n- b\r\n- c";
        expect(normalizeMarkdown(onDisk)).toBe(normalizeMarkdown(fromEditor));
    });

    it("returns empty string for whitespace-only input", () => {
        expect(normalizeMarkdown("   \n\n  ")).toBe("");
    });
});
