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
    import "./styles/editor.css";

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
    // onUpdate callback can reference it (closure-resolved at call time, but
    // TypeScript needs the binding in scope).
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
                tightLists: true,
                tightListClass: 'tight',
                bulletListMarker: '-',
                linkify: false,
                breaks: false,
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
        content: content ?? "",
        editable,
        editorProps: {
            attributes: {
                class: "tiptap outline-none min-h-[200px] px-4 py-3 sm:px-6 sm:py-4",
                spellcheck: "false",
                lang: "en",
            },
        },
        onUpdate: ({ editor: e, transaction }) =>
            controller.handleEditorUpdate(transaction, e),
    });

    // Mirror the editable prop into the live editor. Tiptap doesn't react to
    // config changes after construction — we have to push it imperatively.
    $effect(() => {
        $editor?.setEditable(editable);
    });

    // NO $effect for syncing `content` into the editor.
    //
    // Mirrors Novel.sh's `apps/web/components/tailwind/advanced-editor.tsx`:
    // content is supplied once to `createEditor({ content })` at mount time
    // (the `initialContent` semantics). Re-syncing content via an effect was
    // the architectural bug — Tiptap fires `onUpdate` many times per
    // `setContent` (one per internal transaction), and the previous pattern
    // wrote each `onUpdate` back to the parent's $state, which the effect
    // then re-fed into `setContent`, tripping `effect_update_depth_exceeded`.
    //
    // Callers that need to load a different file MUST remount the editor
    // (use `{#key activePath}` around `<WysiwygEditor />`). Imperative
    // external syncs are still possible via `controller.syncExternalContent`,
    // but they are protected by the `isExternalSync` flag and `lastSetContent`
    // dedup so cascading `onUpdate` does not propagate back.
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
