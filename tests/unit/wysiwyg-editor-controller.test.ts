/**
 * Unit tests for WysiwygEditorController.syncExternalContent.
 *
 * The dedup contract:
 *   - Normalize both sides (trim + CRLF → LF).
 *   - If equal → no `editor.commands.setContent` call.
 *   - If different → `setContent(content ?? "")` exactly once.
 *   - If `getEditor()` returns null → no-op (defensive).
 *
 * The controller imports `@ai-sdk/svelte`'s `Chat` class via its constructor,
 * which is browser-bound. We mock it before importing the controller so the
 * test runs in Node.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Editor } from '@tiptap/core';

// Stub the AI SDK Chat constructor — it pulls in browser runtime APIs that
// don't exist under vitest's Node environment. We only care about the
// controller's `syncExternalContent` method, which never touches the chat.
vi.mock('@ai-sdk/svelte', () => ({
    Chat: class {
        constructor(_options: unknown) {
            // no-op
        }
    },
    DefaultChatTransport: class {
        constructor(_options: unknown) {
            // no-op
        }
    },
}));

import { WysiwygEditorController } from '$lib/components/editor/useWysiwygEditor.svelte';

// The minimal slice of `Editor` exercised by `syncExternalContent`. Using
// Pick<> over indexed access types keeps the mock typed precisely.
type SetContentFn = Editor['commands']['setContent'];
type GetMarkdownFn = () => string;
type GetHtmlFn = Editor['getHTML'];

interface EditorMock {
    setContent: ReturnType<typeof vi.fn<SetContentFn>>;
    getMarkdown: ReturnType<typeof vi.fn<GetMarkdownFn>>;
    getHTML: ReturnType<typeof vi.fn<GetHtmlFn>>;
}

function makeEditorMock(opts: {
    getMarkdown?: string;
    fallbackHtml?: string;
} = {}): EditorMock {
    return {
        setContent: vi.fn<SetContentFn>(() => true),
        getMarkdown: vi.fn<GetMarkdownFn>(() => opts.getMarkdown ?? ''),
        getHTML: vi.fn<GetHtmlFn>(() => opts.fallbackHtml ?? '<p></p>'),
    };
}

// Assertion function: a mock with the right method shapes IS a usable Editor
// for the controller's syncExternalContent. TipTap's `Editor` class has
// 50+ members; we exercise only three. The runtime check verifies the
// structural shape; TS narrows the parameter to `Editor` for callers.
type EditorLike = {
    commands: { setContent: SetContentFn };
    storage: { markdown?: { getMarkdown?: GetMarkdownFn } } | object;
    getHTML: GetHtmlFn;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function asEditor(mock: EditorLike): asserts mock is Editor {
    const commandsOk =
        isObject(mock) &&
        isObject(mock.commands) &&
        typeof mock.commands.setContent === 'function';
    const getHtmlOk = isObject(mock) && typeof mock.getHTML === 'function';
    if (!commandsOk || !getHtmlOk) {
        throw new Error('asEditor: mock does not satisfy the Editor shape');
    }
}

function buildEditor(mock: EditorMock, withMarkdownStorage: boolean): Editor {
    const storage = withMarkdownStorage
        ? { markdown: { getMarkdown: mock.getMarkdown } }
        : {};
    const candidate: EditorLike = {
        commands: { setContent: mock.setContent },
        storage,
        getHTML: mock.getHTML,
    };
    asEditor(candidate);
    return candidate;
}

function makeController(editor: Editor | null): {
    controller: WysiwygEditorController;
} {
    const controller = new WysiwygEditorController(
        () => editor,
        () => undefined,
        {
            designationId: 1,
            selectedClassId: null,
            selectedSectionId: null,
            selectedClassName: '',
            selectedSectionName: '',
        },
    );
    return { controller };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('WysiwygEditorController.syncExternalContent', () => {
    it('skips setContent when external content matches the editor after normalization', () => {
        const mock = makeEditorMock({ getMarkdown: '# Hello\n\nworld  ' });
        const { controller } = makeController(buildEditor(mock, true));

        controller.syncExternalContent('  # Hello\n\nworld');

        expect(mock.setContent).not.toHaveBeenCalled();
    });

    it('calls setContent with the new content when external content differs', () => {
        const mock = makeEditorMock({ getMarkdown: '# Old\n\nbody' });
        const { controller } = makeController(buildEditor(mock, true));

        controller.syncExternalContent('# New\n\nbody');

        expect(mock.setContent).toHaveBeenCalledTimes(1);
        expect(mock.setContent).toHaveBeenCalledWith('# New\n\nbody');
    });

    it('is a no-op when getEditor() returns null', () => {
        const { controller } = makeController(null);

        expect(() => controller.syncExternalContent('anything')).not.toThrow();
    });

    it('normalizes CRLF line endings to LF on both sides before comparing', () => {
        const mock = makeEditorMock({ getMarkdown: '# Title\r\n\r\n- a\r\n- b  ' });
        const { controller } = makeController(buildEditor(mock, true));

        // Same content but with CRLF + trailing whitespace. Must NOT trigger
        // a redundant setContent round-trip.
        controller.syncExternalContent('  # Title\r\n\r\n- a\r\n- b');

        expect(mock.setContent).not.toHaveBeenCalled();
    });

    it('falls back to editor.getHTML() when storage.markdown.getMarkdown is unavailable', () => {
        const mock = makeEditorMock({ fallbackHtml: '  <h1>Hello</h1><p>world</p>  ' });
        const { controller } = makeController(buildEditor(mock, false));

        // Different content → setContent called with the new content.
        controller.syncExternalContent('# Changed\n\nbody');

        expect(mock.getHTML).toHaveBeenCalled();
        expect(mock.setContent).toHaveBeenCalledWith('# Changed\n\nbody');
    });
});
