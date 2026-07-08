<script lang="ts">
    import { untrack } from "svelte";
    import { createEditor } from "svelte-tiptap";
    import { EditorContent, BubbleMenu } from "svelte-tiptap";
    import StarterKit from "@tiptap/starter-kit";
    import Underline from "@tiptap/extension-underline";
    import Highlight from "@tiptap/extension-highlight";
    import Placeholder from "@tiptap/extension-placeholder";
    import Subscript from "@tiptap/extension-subscript";
    import Superscript from "@tiptap/extension-superscript";
    import { Markdown } from "tiptap-markdown";
    import GenerativeMenuSwitch from "./GenerativeMenuSwitch.svelte";
    import { dragHandle } from "./DragHandle.svelte";
    import { CopilotExtension } from "./extensions/copilot";
    import { SlashMenuExtension } from "./extensions/slash-menu";
    import { MentionExtension } from "./extensions/mention-menu";
    import { AiStreamNode } from "./extensions/ai-stream-node";
    import AiPromptPopover from "./AiPromptPopover.svelte";
    import { Table } from "@tiptap/extension-table";
    import { TableRow } from "@tiptap/extension-table-row";
    import { TableHeader } from "@tiptap/extension-table-header";
    import { TableCell } from "@tiptap/extension-table-cell";
    import { TaskList } from "@tiptap/extension-task-list";
    import { TaskItem } from "@tiptap/extension-task-item";
    import { Link } from "@tiptap/extension-link";
    import { Callout } from "./extensions/callout";
    import {
        DescriptionList,
        DescriptionTerm,
        DescriptionDetail,
    } from "./extensions/description-list";
    import { CodeBlockHighlight } from "./extensions/code-block-lowlight";
    import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
    import { WysiwygEditorController } from "./useWysiwygEditor.svelte.ts";

    let {
        content = "",
        onUpdate,
        class: className = "",
        copilotEnabled = true,
        designationId = ALLOWED_DESIGNATIONS.IT,
        selectedClassId = null,
        selectedSectionId = null,
        selectedClassName = "",
        selectedSectionName = "",
        editable = true,
    }: {
        content?: string;
        onUpdate?: (markdown: string) => void;
        class?: string;
        copilotEnabled?: boolean;
        designationId?: number;
        selectedClassId?: number | null;
        selectedSectionId?: number | null;
        selectedClassName?: string;
        selectedSectionName?: string;
        editable?: boolean;
    } = $props();

    // TipTap builds the editor once. The copilot extension set is captured at mount time;
    // toggling the prop in the same editor instance would require a full rebuild, which
    // the in-editor status pill does not trigger (it only swaps the visual state).
    const shouldEnableCopilot = untrack(() => copilotEnabled);
    let container = $state<HTMLElement>();

    // Controller owns AI streaming, prompt state, mention context, event listeners.
    // Getters pass through to the live editor/container so the controller can read
    // current values without stale closures. Declared BEFORE createEditor so its
    // onCreate/onUpdate callbacks can reference it (closure-resolved at call time,
    // but TypeScript needs the binding in scope).
    // svelte-ignore state_referenced_locally
    const controller = new WysiwygEditorController(
        () => $editor,
        () => container,
        {
            onUpdate,
            designationId,
            selectedClassId,
            selectedSectionId,
            selectedClassName,
            selectedSectionName,
        },
    );

    // svelte-ignore state_referenced_locally
    const editor = createEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                codeBlock: false,
                blockquote: {},
                horizontalRule: {
                    HTMLAttributes: {
                        class: "border-border/50 my-6",
                    },
                },
            }),
            Highlight.configure({
                HTMLAttributes: {
                    class: "bg-primary/15 text-primary rounded px-0.5",
                },
            }),
            Underline,
            Subscript,
            Superscript,
            Placeholder.configure({
                placeholder: "Write or type '/' for commands…",
                emptyEditorClass: "is-editor-empty",
                showOnlyCurrent: true,
            }),
            Markdown.configure({
                html: false,
                transformPastedText: true,
                transformCopiedText: true,
            }),
            ...(shouldEnableCopilot
                ? [
                      CopilotExtension.configure({
                          api: "/api/ai/editor/copilot",
                      }),
                  ]
                : []),
            SlashMenuExtension,
            MentionExtension,
            AiStreamNode,
            dragHandle,
            Table.configure({
                resizable: false,
                HTMLAttributes: { class: "tiptap-table" },
            }),
            TableRow,
            TableHeader,
            TableCell,
            TaskList,
            TaskItem.configure({ nested: true }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    rel: "noopener noreferrer",
                    class: "tiptap-link",
                },
            }),
            Callout,
            DescriptionList,
            DescriptionTerm,
            DescriptionDetail,
            CodeBlockHighlight,
        ],
        content: "",
        editable,
        editorProps: {
            attributes: {
                class: "tiptap outline-none min-h-[200px] px-4 py-3 sm:px-6 sm:py-4",
                spellcheck: "false",
                lang: "en",
            },
        },
        onCreate: ({ editor: e }) =>
            controller.setInitialContent(content ?? ""),
        onUpdate: ({ editor: e, transaction }) =>
            controller.handleEditorUpdate(transaction, e),
    });

    // Mirror the editable prop into the live editor. Tiptap doesn't react to
    // config changes after construction — we have to push it imperatively.
    $effect(() => {
        $editor?.setEditable(editable);
    });

    // Sync external content (e.g. file switch) into the editor via the
    // controller's dedup + tiptap-markdown parsing pipeline.
    $effect(() => {
        controller.syncExternalContent(content);
    });
</script>

<div bind:this={container} class="flex-1 overflow-y-auto relative {className}">
    {#if $editor}
        <BubbleMenu editor={$editor} class="z-50">
            <GenerativeMenuSwitch
                editor={$editor}
                onAiCommand={(option, text) =>
                    controller.handleAiCommand(option, text)}
            />
        </BubbleMenu>
    {/if}

    <div class="wysiwyg-editor-wrapper w-full">
        <EditorContent editor={$editor} class="w-full" />
    </div>

    {#if controller.aiPromptOpen && controller.aiPromptPos}
        <div
            class="ai-prompt-anchor"
            style="top: {controller.aiPromptPos.top}px; left: {controller
                .aiPromptPos.left}px;"
        >
            <AiPromptPopover
                onSubmit={(prompt) => controller.submitAiPrompt(prompt)}
                onDismiss={() => controller.dismissAiPrompt()}
            />
        </div>
    {/if}
</div>

<style>
    /* === AUTO-INLINED FROM styles/ PARTIALS WITH :global(...) WRAPPING === */
    /* Mirrors svelte-streamdown shadcnTheme (node_modules/svelte-streamdown/dist/theme.js:169-308). */
    /* Order: blocks → tables → code → media → chrome. Later files override earlier. */

    /* ---------- BLOCKS ---------- */
    /* Block-level typography and structural elements: headings, paragraphs,
 * lists, task lists, blockquote, hr, sup/sub, callouts. */
    :global(.wysiwyg-editor-wrapper .tiptap) {
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h1) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 1.875rem;
        line-height: 2.25rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h2) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 1.5rem;
        line-height: 2rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h3) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 1.25rem;
        line-height: 1.75rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h4) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 1.125rem;
        line-height: 1.75rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h5) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 1rem;
        line-height: 1.5rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap h6) {
        margin-top: 1.5rem;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap p) {
        color: var(--foreground);
    }

    /* Lists — `list-inside` matches svelte-streamdown shadcnTheme; bullets
 * sit on the same row as the first line of content. */
    :global(.wysiwyg-editor-wrapper .tiptap ul) {
        margin-left: 1rem;
        list-style-position: inside;
        list-style-type: disc;
        white-space: normal;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap ol) {
        margin-left: 1rem;
        list-style-position: inside;
        white-space: normal;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap li) {
        padding-top: 0.25rem;
        padding-bottom: 0.25rem;
    } /* Tiptap renders <li><p>…</p></li>. The browser's default <p> margin: 1em 0
 * collapses the inside marker, so neutralize the <p> inside <li>. */
    :global(.wysiwyg-editor-wrapper .tiptap li > p) {
        margin: 0;
    }
    :global(.wysiwyg-editor-wrapper .tiptap li::marker) {
        color: var(--muted-foreground);
    }

    /* Task list — checkbox items. Tiptap renders <ul data-type="taskList"><li data-type="taskItem">
 * with a hidden checkbox + label. The Tiptap TaskItem wraps the content in <div><p>…</p></div>;
 * because <p> is block-level by default the checkbox ends up on a row ABOVE the text.
 * Setting <div> to display:flex and <p> to flex:1 puts the checkbox and the first line of
 * text on the same row while still allowing multi-line <p> content to wrap. */

    :global(.wysiwyg-editor-wrapper .tiptap ul[data-type="taskList"]) {
        list-style: none;
        padding-left: 0.25rem;
    }
    :global(.wysiwyg-editor-wrapper .tiptap li[data-type="taskItem"]) {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
    }
    :global(.wysiwyg-editor-wrapper .tiptap li[data-type="taskItem"] > label) {
        flex: 0 0 auto;
        margin-top: 0.35rem;
        user-select: none;
    }
    :global(.wysiwyg-editor-wrapper .tiptap li[data-type="taskItem"] > div) {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: flex-start;
    }
    :global(
            .wysiwyg-editor-wrapper .tiptap li[data-type="taskItem"] > div > p
        ) {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                li[data-type="taskItem"]
                input[type="checkbox"]
        ) {
        accent-color: var(--primary);
        cursor: pointer;
    }
    :global(.wysiwyg-editor-wrapper .tiptap code) {
        background-color: var(--muted);
        border-radius: 0.25rem;
        padding-left: 0.375rem;
        padding-right: 0.375rem;
        padding-top: 0.125rem;
        padding-bottom: 0.125rem;
        font-family: var(--font-mono);
        color: var(--foreground);
        font-size: 0.9em;
    }
    :global(.wysiwyg-editor-wrapper .tiptap strong) {
        font-weight: 600;
        color: var(--foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap em) {
        font-style: italic;
    }
    :global(.wysiwyg-editor-wrapper .tiptap u) {
        text-decoration: underline;
        text-underline-offset: 2px;
    }
    :global(.wysiwyg-editor-wrapper .tiptap a) {
        color: var(--primary);
        overflow-wrap: anywhere;
        font-weight: 500;
        text-decoration-line: underline;
    }
    :global(.wysiwyg-editor-wrapper .tiptap a:hover) {
        color: color-mix(in oklch, var(--primary), transparent 20%);
    } /* Focus ring for keyboard navigation when tabbing through links inside
 * the editor content. The Tiptap Link extension config sets `rel="noopener
 * noreferrer"` and `class="tiptap-link"` on every rendered <a>. */
    :global(.wysiwyg-editor-wrapper .tiptap a:focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
        border-radius: 0.125rem;
    } /* Selected link — when the cursor sits inside a link mark, ProseMirror
 * adds ProseMirror-selectednode to the <a>. Tinted background to signal
 * the mark's active range without interfering with the underline. */
    :global(.wysiwyg-editor-wrapper .tiptap a.ProseMirror-selectednode) {
        background-color: color-mix(in oklch, var(--primary), transparent 92%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap blockquote) {
        border-color: color-mix(
            in oklch,
            var(--muted-foreground),
            transparent 70%
        );
        color: var(--muted-foreground);
        margin-top: 1rem;
        margin-bottom: 1rem;
        border-left-width: 4px;
        padding-left: 1rem;
        font-style: italic;
    } /* Tiptap renders <blockquote><p>…</p></blockquote>. The <p>'s 1em margin
 * doubles the blockquote's spacing — neutralize it. */
    :global(.wysiwyg-editor-wrapper .tiptap blockquote > :first-child),
    :global(.wysiwyg-editor-wrapper .tiptap blockquote > :last-child) {
        margin-top: 0;
        margin-bottom: 0;
    }
    :global(.wysiwyg-editor-wrapper .tiptap hr) {
        border: none;
        border-top: 1px solid var(--border);
        margin-top: 1.5rem;
        margin-bottom: 1.5rem;
        height: 0;
    }
    :global(.wysiwyg-editor-wrapper .tiptap del) {
        color: var(--muted-foreground);
    } /* Description list — mirrors svelte-streamdown shadcnTheme
 * descriptionList / descriptionTerm / descriptionDetail.
 * Renders <dl><dt>…</dt><dd>…</dd></dl>. */
    :global(.wysiwyg-editor-wrapper .tiptap dl.tiptap-description-list) {
        margin-top: 1rem;
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    :global(.wysiwyg-editor-wrapper .tiptap dt.tiptap-description-term) {
        font-weight: 600;
        color: var(--foreground);
        border-left: 2px solid var(--border);
        padding-left: 1rem;
    }
    :global(.wysiwyg-editor-wrapper .tiptap dd.tiptap-description-detail) {
        color: var(--muted-foreground);
        margin-left: 1rem;
        line-height: 1.625;
    } /* Neutralize the <p> margin inside dd so cell-like padding is the only spacing. */
    :global(.wysiwyg-editor-wrapper .tiptap dd.tiptap-description-detail > p) {
        margin: 0;
    } /* Sup / sub — svelte-streamdown shadcnTheme uses text-sm. */
    :global(.wysiwyg-editor-wrapper .tiptap sup),
    :global(.wysiwyg-editor-wrapper .tiptap sub) {
        font-size: 0.875rem;
        line-height: 1.25rem;
    } /* Callout — mirrors svelte-streamdown shadcnTheme alert.* classes.
 * <aside data-callout data-type="…"><div data-callout-title>…</div><div data-callout-content>…</div></aside> */
    :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout]) {
        position: relative;
        margin-top: 1rem;
        margin-bottom: 1rem;
        border-left-width: 4px;
        padding: 1rem;
        background-color: var(--card);
        border-radius: 0 0.375rem 0.375rem 0;
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout]
                > [data-callout-title]
        ) {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        text-transform: capitalize;
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout]
                > [data-callout-title]::before
        ) {
        content: "";
        display: inline-block;
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
        background: currentColor;
        mask-size: contain;
        mask-repeat: no-repeat;
        -webkit-mask-size: contain;
        -webkit-mask-repeat: no-repeat;
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="note"]
                > [data-callout-title]::before
        ) {
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 16v-4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 8h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 16v-4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 8h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="tip"]
                > [data-callout-title]::before
        ) {
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M9 18h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M10 22h4' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M9 18h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M10 22h4' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="warning"]
                > [data-callout-title]::before
        ) {
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 9v4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 17h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 9v4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 17h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="caution"]
                > [data-callout-title]::before
        ) {
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='8' x2='12' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='8' x2='12' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="important"]
                > [data-callout-title]::before
        ) {
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 11h10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 15h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 7h8' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 11h10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 15h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M7 7h8' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout]
                > [data-callout-content]
                > p
        ) {
        margin: 0;
    } /* Callout semantic colors — single source of truth for note/tip/warning/
 * important. caution already maps to --destructive (theme token). Values
 * mirror Tailwind v4's blue-600 / green-600 / yellow-600 / purple-600 so
 * the editor matches svelte-streamdown shadcnTheme's alert palette
 * without depending on Tailwind's color var generation. */
    :global(.wysiwyg-editor-wrapper) {
        --callout-note-color: oklch(0.6 0.18 240);
        --callout-tip-color: oklch(0.55 0.17 145);
        --callout-warning-color: oklch(0.7 0.16 85);
        --callout-important-color: oklch(0.58 0.2 300);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="note"]
        ) {
        border-color: var(--callout-note-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="note"]
                > [data-callout-title]
        ) {
        color: var(--callout-note-color);
    }
    :global(
            .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="tip"]
        ) {
        border-color: var(--callout-tip-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="tip"]
                > [data-callout-title]
        ) {
        color: var(--callout-tip-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="warning"]
        ) {
        border-color: var(--callout-warning-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="warning"]
                > [data-callout-title]
        ) {
        color: var(--callout-warning-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="caution"]
        ) {
        border-color: var(--destructive);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="caution"]
                > [data-callout-title]
        ) {
        color: var(--destructive);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="important"]
        ) {
        border-color: var(--callout-important-color);
    }
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                aside[data-callout][data-type="important"]
                > [data-callout-title]
        ) {
        color: var(--callout-important-color);
    }

    /* ---------- TABLES ---------- */
    /* Table styles — mirrors svelte-streamdown shadcnTheme table.* classes.
 *
 * Tiptap's TableView wraps every <table> in <div class="tableWrapper">
 * (see @tiptap/extension-table TableView constructor). <table> is
 * `display: table` and ignores the `overflow` property, so the
 * horizontal-scroll container must live on the wrapper. Outer border
 * and border-radius also belong on the wrapper — `border-collapse:
 * collapse` on <table> silently drops border-radius from the corners,
 * and the wrapper's `overflow-y: hidden` clips cells to the rounded
 * shape.
 *
 * Requires @tiptap/extension-table to be added to the editor for live editing.
 */
    :global(.wysiwyg-editor-wrapper .tiptap .tableWrapper) {
        overflow-x: auto;
        overflow-y: hidden;
        margin-top: 1rem;
        margin-bottom: 1rem;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        /* iOS Safari momentum scrolling inside the scrollable wrapper.
   * `-webkit-overflow-scrolling` is a non-standard but universally
   * supported property on iOS; ignored on other platforms. */
        -webkit-overflow-scrolling: touch;
    }
    :global(.wysiwyg-editor-wrapper .tiptap table) {
        width: 100%;
        border-collapse: collapse;
        min-width: 100%;
    }
    :global(.wysiwyg-editor-wrapper .tiptap thead) {
        background: color-mix(in oklch, var(--muted), transparent 20%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap tr) {
        border-bottom: 1px solid var(--border);
        transition: background-color 0.15s ease-in-out;
    }
    :global(.wysiwyg-editor-wrapper .tiptap tbody tr:hover) {
        background-color: color-mix(in oklch, var(--muted), transparent 50%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap tfoot) {
        background-color: color-mix(in oklch, var(--muted), transparent 50%);
        border-top: 1px solid var(--border);
    }
    :global(.wysiwyg-editor-wrapper .tiptap tfoot td) {
        font-weight: 500;
        color: var(--muted-foreground);
    }
    :global(.wysiwyg-editor-wrapper .tiptap tr:last-child) {
        border-bottom: none;
    }
    :global(.wysiwyg-editor-wrapper .tiptap th),
    :global(.wysiwyg-editor-wrapper .tiptap td) {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        color: var(--foreground);
        min-width: 200px;
        max-width: 400px;
        overflow-wrap: break-word;
    }
    :global(.wysiwyg-editor-wrapper .tiptap th) {
        font-weight: 600;
        text-align: left;
    } /* Tiptap renders <td><p>…</p></td>. Neutralize the <p> margin so cell padding
 * is the only spacing. */
    :global(.wysiwyg-editor-wrapper .tiptap th > p),
    :global(.wysiwyg-editor-wrapper .tiptap td > p) {
        margin: 0;
    }

    /* ---------- CODE ---------- */
    /* Code block + syntax-highlighting styles — mirrors svelte-streamdown
 * shadcnTheme code.* and codespan.* classes.
 *
 * Tiptap CodeBlock renders <pre><code class="language-xxx">…</code></pre>.
 * The CodeBlockHighlight NodeView (see extensions/code-block-lowlight.ts)
 * wraps the <pre> in <div class="code-block-wrapper"> with a header bar
 * carrying the language label and copy-to-clipboard button — mirrors
 * svelte-streamdown's code.base / code.header / code.buttons / code.language
 * / components.button stack.
 */
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-wrapper) {
        margin-top: 1rem;
        margin-bottom: 1rem;
        width: 100%;
        overflow: hidden;
        border-radius: 0.5rem;
        border: 1px solid var(--border);
        background-color: color-mix(in oklch, var(--muted), transparent 60%);
        display: flex;
        flex-direction: column;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-header) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: color-mix(in oklch, var(--muted), transparent 20%);
        padding: 0.25rem 0.5rem;
        color: var(--muted-foreground);
        font-size: 0.75rem;
        line-height: 1rem;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-language) {
        margin-left: 0.25rem;
        font-family: var(--font-mono);
        text-transform: lowercase;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-copy) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        padding: 0.25rem;
        color: var(--muted-foreground);
        background: transparent;
        border: none;
        border-radius: 0.25rem;
        cursor: pointer;
        transition:
            color 0.15s ease-in-out,
            background-color 0.15s ease-in-out;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-copy:hover) {
        color: var(--foreground);
        background-color: color-mix(in oklch, var(--border), transparent 50%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-copy:focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .code-block-copy--success) {
        color: oklch(0.55 0.17 145);
    }
    :global(.wysiwyg-editor-wrapper .tiptap pre.code-block-pre) {
        margin: 0;
        width: 100%;
        overflow-x: auto;
        border-radius: 0;
        border: none;
        background-color: color-mix(in oklch, var(--muted), transparent 40%);
        padding: 0.75rem 1rem;
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--foreground);
        white-space: pre;
    }
    :global(.wysiwyg-editor-wrapper .tiptap pre.code-block-pre code) {
        background-color: transparent;
        border-radius: 0;
        padding: 0;
        color: inherit;
        font-size: inherit;
        font-family: inherit;
        white-space: pre;
    } /* Legacy fallback for any code block that hasn't been wrapped by the
 * NodeView (e.g. content pasted as raw HTML before the extension loaded).
 * Mirrors the shadcnTheme `pre` styling so un-wrapped <pre> still looks
 * acceptable. */
    :global(.wysiwyg-editor-wrapper .tiptap pre:not(.code-block-pre)) {
        margin-top: 1rem;
        margin-bottom: 1rem;
        width: 100%;
        overflow-x: auto;
        border-radius: 0.5rem;
        border: 1px solid var(--border);
        background-color: color-mix(in oklch, var(--muted), transparent 60%);
        padding: 0.75rem 1rem;
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--foreground);
        white-space: pre;
    }
    :global(.wysiwyg-editor-wrapper .tiptap pre:not(.code-block-pre) code) {
        background-color: transparent;
        border-radius: 0;
        padding: 0;
        color: inherit;
        font-size: inherit;
        font-family: inherit;
        white-space: pre;
    } /* Syntax highlighting — lowlight emits <span class="hljs-xxx"> tokens. Uses design-token
 * oklch hues so highlighting reads correctly in both light and dark modes. */
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-keyword),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-selector-tag),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-built_in),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-name),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-tag) {
        color: oklch(0.55 0.18 280);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-string),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-attr),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-symbol),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-bullet),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-addition) {
        color: oklch(0.55 0.16 145);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-number),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-literal),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-meta) {
        color: oklch(0.6 0.18 40);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-comment),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-quote),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-deletion) {
        color: var(--muted-foreground);
        font-style: italic;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-function),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-title),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-class .hljs-title),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-attribute) {
        color: oklch(0.55 0.2 240);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-variable),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-template-variable),
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-regexp) {
        color: oklch(0.55 0.2 25);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-emphasis) {
        font-style: italic;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .hljs-strong) {
        font-weight: 700;
    }

    /* ---------- MEDIA ---------- */
    /* Image styles — hover brightness + selected node outline + image placeholder
 * spinner (Novel prosemirror.css parity).
 *
 * `display: block` + `width: fit-content` + `mx-auto` matches the
 * svelte-streamdown shadcnTheme `image.base` pattern (`group relative
 * my-4 mx-auto w-fit block`): the image takes its intrinsic width
 * when narrower than the editor, centered; capped by max-width:100%
 * when wider.
 */
    :global(.wysiwyg-editor-wrapper .tiptap img) {
        display: block;
        margin-top: 1rem;
        margin-bottom: 1rem;
        margin-left: auto;
        margin-right: auto;
        width: fit-content;
        max-width: 100%;
        height: auto;
        transition: filter 0.1s ease-in-out;
    }
    :global(.wysiwyg-editor-wrapper .tiptap img:hover) {
        cursor: pointer;
        filter: brightness(90%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap img.ProseMirror-selectednode) {
        outline: 3px solid oklch(0.7 0.15 220);
        filter: brightness(90%);
    }
    /* (2) Image placeholder — spinner while uploading (Novel .img-placeholder parity) */
    @keyframes wysiwyg-img-spinning {
        to {
            transform: rotate(360deg);
        }
    }
    :global(.wysiwyg-editor-wrapper .tiptap .img-placeholder) {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 4rem;
        padding: 1rem;
        border-radius: 0.5rem;
        background: color-mix(in oklch, var(--muted), transparent 60%);
    }
    :global(.wysiwyg-editor-wrapper .tiptap .img-placeholder::before) {
        content: "";
        box-sizing: border-box;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        border: 2px solid var(--border);
        border-top-color: var(--foreground);
        animation: wysiwyg-img-spinning 0.6s linear infinite;
    }

    /* ---------- CHROME ---------- */
    /* Editor chrome — selection styling, mention pill, AI popover anchor,
 * drag handle, and other meta-elements that wrap content rather than
 * being content themselves.
 */ /* (3) Task list — checked line-through (Novel parity) */
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                ul[data-type="taskList"]
                li[data-checked="true"]
                > div
                > p
        ) {
        color: var(--muted-foreground);
        text-decoration: line-through;
        text-decoration-thickness: 2px;
    } /* (4) Selected node background — highlights the block when cursor inside
 * (Novel .ProseMirror:not(.dragging) .ProseMirror-selectednode parity) */
    :global(
            .wysiwyg-editor-wrapper
                .tiptap:not(.dragging)
                .ProseMirror-selectednode
        ) {
        outline: none !important;
        background-color: color-mix(in oklch, var(--primary), transparent 92%);
        transition: background-color 0.2s;
        box-shadow: none;
    } /* (5) Bold color issue fix — span/mark with inline color shouldn't trap bold.
 * Novel parity for span[style] > strong and mark[style] > strong. */
    :global(.wysiwyg-editor-wrapper .tiptap span[style] > strong),
    :global(.wysiwyg-editor-wrapper .tiptap span[style] > b) {
        color: inherit;
    }
    :global(.wysiwyg-editor-wrapper .tiptap mark[style] > strong),
    :global(.wysiwyg-editor-wrapper .tiptap mark[style] > b) {
        color: inherit;
    } /* Mention — inline pill rendered by @tiptap/extension-mention. The Node
 * itself is an inline atom; styling here ensures it reads as a
 * structured variable without breaking the line baseline. */
    :global(.wysiwyg-editor-wrapper .tiptap .mention) {
        display: inline-block;
        padding: 0.0625rem 0.375rem;
        margin: 0 0.0625rem;
        background: color-mix(in oklch, var(--primary), transparent 88%);
        color: var(--primary);
        border: 1px solid color-mix(in oklch, var(--primary), transparent 70%);
        border-radius: 0.375rem;
        font-weight: 500;
        font-size: 0.95em;
        line-height: 1.2;
        user-select: all;
        cursor: default;
    }
    :global(.wysiwyg-editor-wrapper .tiptap .mention::before) {
        content: "@";
        opacity: 0.6;
        margin-right: 0.125rem;
    } /* Mention suggestion popup — positioned absolutely, anchored to the caret
 * by the suggestion plugin's clientRect. The popup itself is teleported
 * to <body> so it escapes any overflow:hidden ancestor. */
    :global(.mention-suggestion-popup) {
        font-family: inherit;
    } /* AiStreamNode — <NodeViewWrapper class="ai-stream-wrapper"> renders
 * <p><Markdown /></p> indirectly through ProseMirror. Neutralize the
 * trailing <p>'s default margin so the Accept/Discard row sits flush. */
    :global(.wysiwyg-editor-wrapper .tiptap [data-ai-stream] > p) {
        margin: 0;
    } /* Placeholder styling */
    :global(
            .wysiwyg-editor-wrapper
                .tiptap
                p.is-editor-empty:first-child::before
        ),
    :global(.wysiwyg-editor-wrapper .tiptap p.is-empty::before) {
        content: attr(data-placeholder);
        float: left;
        color: var(--muted-foreground);
        pointer-events: none;
        height: 0;
        font-style: italic;
        opacity: 0.5;
    } /* Selection styling */
    :global(.wysiwyg-editor-wrapper .tiptap ::selection) {
        background: oklch(0.65 0.15 40 / 0.2);
    } /* First/last-child margin reset — mirrors <Markdown />'s [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
 * so WYSIWYG edges match the preview exactly. */
    :global(.wysiwyg-editor-wrapper .tiptap > :first-child) {
        margin-top: 0 !important;
    }
    :global(.wysiwyg-editor-wrapper .tiptap > :last-child) {
        margin-bottom: 0 !important;
    } /* Floating AI prompt popover anchor — positioned absolutely within the scroll container
 * so the popover stays visible while the user scrolls. z-[60] sits above the
 * BubbleMenu (z-50) and the slash/mention suggestion popups. */
    :global(.ai-prompt-anchor) {
        position: absolute;
        z-index: 60;
    } /* (6) Drag handle (⋮⋮ six-dot block drag) — renders the element from
 * tiptap-extension-global-drag-handle. The library creates a `position: fixed`
 * div; we position, size, add the icon, and control visibility.
 * Hidden on mobile (< 600px) — BottomToolbar handles reordering instead. */
    :global(.drag-handle) {
        position: fixed;
        opacity: 1;
        transition:
            opacity ease-in 0.2s,
            background-color 0.2s;
        border-radius: 0.25rem;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' style='fill: rgba(0, 0, 0, 0.5)'%3E%3Cpath d='M3,2 C2.44771525,2 2,1.55228475 2,1 C2,0.44771525 2.44771525,0 3,0 C3.55228475,0 4,0.44771525 4,1 C4,1.55228475 3.55228475,2 3,2 Z M3,6 C2.44771525,6 2,5.55228475 2,5 C2,4.44771525 2.44771525,4 3,4 C3.55228475,4 4,4.44771525 4,5 C4,5.55228475 3.55228475,6 3,6 Z M3,10 C2.44771525,10 2,9.55228475 2,9 C2,8.44771525 2.44771525,8 3,8 C3.55228475,8 4,8.44771525 4,9 C4,9.55228475 3.55228475,10 3,10 Z M7,2 C6.44771525,2 6,1.55228475 6,1 C6,0.44771525 6.44771525,0 7,0 C7.55228475,0 8,0.44771525 8,1 C8,1.55228475 7.55228475,2 7,2 Z M7,6 C6.44771525,6 6,5.55228475 6,5 C6,4.44771525 6.44771525,4 7,4 C7.55228475,4 8,4.44771525 8,5 C8,5.55228475 7.55228475,6 7,6 Z M7,10 C6.44771525,10 6,9.55228475 6,9 C6,8.44771525 6.44771525,8 7,8 C7.55228475,8 8,8.44771525 8,9 C8,9.55228475 7.55228475,10 7,10 Z'%3E%3C/path%3E%3C/svg%3E");
        background-size: calc(0.5em + 0.375rem) calc(0.5em + 0.375rem);
        background-repeat: no-repeat;
        background-position: center;
        width: 1.2rem;
        height: 1.5rem;
        z-index: 50;
        cursor: grab;
    }
    :global(.drag-handle:hover) {
        background-color: color-mix(in oklch, var(--muted), transparent 70%);
        transition: background-color 0.2s;
    }
    :global(.drag-handle:active) {
        background-color: color-mix(in oklch, var(--muted), transparent 40%);
        transition: background-color 0.2s;
        cursor: grabbing;
    }
    :global(.drag-handle.hide) {
        opacity: 0;
        pointer-events: none;
    }
    @media screen and (max-width: 600px) {
        :global(.drag-handle) {
            display: none;
            pointer-events: none;
        }
    }
    :global(.dark .drag-handle) {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' style='fill: rgba(255, 255, 255, 0.5)'%3E%3Cpath d='M3,2 C2.44771525,2 2,1.55228475 2,1 C2,0.44771525 2.44771525,0 3,0 C3.55228475,0 4,0.44771525 4,1 C4,1.55228475 3.55228475,2 3,2 Z M3,6 C2.44771525,6 2,5.55228475 2,5 C2,4.44771525 2.44771525,4 3,4 C3.55228475,4 4,4.44771525 4,5 C4,5.55228475 3.55228475,6 3,6 Z M3,10 C2.44771525,10 2,9.55228475 2,9 C2,8.44771525 2.44771525,8 3,8 C3.55228475,8 4,8.44771525 4,9 C4,9.55228475 3.55228475,10 3,10 Z M7,2 C6.44771525,2 6,1.55228475 6,1 C6,0.44771525 6.44771525,0 7,0 C7.55228475,0 8,0.44771525 8,1 C8,1.55228475 7.55228475,2 7,2 Z M7,6 C6.44771525,6 6,5.55228475 6,5 C6,4.44771525 6.44771525,4 7,4 C7.55228475,4 8,4.44771525 8,5 C8,5.55228475 7.55228475,6 7,6 Z M7,10 C6.44771525,10 6,9.55228475 6,9 C6,8.44771525 6.44771525,8 7,8 C7.55228475,8 8,8.44771525 8,9 C8,9.55228475 7.55228475,10 7,10 Z'/%3E%3Cpath d='M3,2 C2.44771525,2 2,1.55228475 2,1 C2,0.44771525 2.44771525,0 3,0 C3.55228475,0 4,0.44771525 4,1 C4,1.55228475 3.55228475,2 3,2 Z M3,6 C2.44771525,6 2,5.55228475 2,5 C2,4.44771525 2.44771525,4 3,4 C3.55228475,4 4,4.44771525 4,5 C4,5.55228475 3.55228475,6 3,6 Z M3,10 C2.44771525,10 2,9.55228475 2,9 C2,8.44771525 2.44771525,8 3,8 C3.55228475,8 4,8.44771525 4,9 C4,9.55228475 3.55228475,10 3,10 Z M7,2 C6.44771525,2 6,1.55228475 6,1 C6,0.44771525 6.44771525,0 7,0 C7.55228475,0 8,0.44771525 8,1 C8,1.55228475 7.55228475,2 7,2 Z M7,6 C6.44771525,6 6,5.55228475 6,5 C6,0.44771525 6.44771525,4 7,4 C7.55228475,4 8,4.44771525 8,5 C8,5.55228475 7.55228475,6 7,6 Z M7,10 C6.44771525,10 6,9.55228475 6,9 C6,0.44771525 6.44771525,8 7,8 C7.55228475,8 8,8.447725 8,9 C8,9.55228475 7.55228475,10 7,10 Z'%3E%3C/path%3E%3C/svg%3E");
    }
</style>
