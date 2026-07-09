<script lang="ts">
  import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
  import type { Editor } from "@tiptap/core";
  import Highlight from "@tiptap/extension-highlight";
  import Placeholder from "@tiptap/extension-placeholder";
  import Subscript from "@tiptap/extension-subscript";
  import Superscript from "@tiptap/extension-superscript";
  import { Table } from "@tiptap/extension-table";
  import { TableCell } from "@tiptap/extension-table-cell";
  import { TableHeader } from "@tiptap/extension-table-header";
  import { TableRow } from "@tiptap/extension-table-row";
  import { TaskItem } from "@tiptap/extension-task-item";
  import { TaskList } from "@tiptap/extension-task-list";
  import Underline from "@tiptap/extension-underline";
  import StarterKit from "@tiptap/starter-kit";
  import { untrack } from "svelte";
  import { BubbleMenu, createEditor, EditorContent } from "svelte-tiptap";
  import { Markdown } from "tiptap-markdown";
  import AiPromptPopover from "./AiPromptPopover.svelte";
  import { AiStreamNode } from "./extensions/ai-stream-node";
  import { Callout } from "./extensions/callout";
  import { CodeBlockHighlight } from "./extensions/code-block-lowlight";
  import { CopilotExtension } from "./extensions/copilot";
  import { MentionExtension } from "./extensions/mention-menu";
  import { SlashMenuExtension } from "./extensions/slash-menu";
  import GenerativeMenuSwitch from "./GenerativeMenuSwitch.svelte";
  import { WysiwygEditorController } from "./useWysiwygEditor.svelte.ts";

  import { dragHandle } from "./DragHandle.svelte";
  import {
      DescriptionDetail,
      DescriptionTerm
  } from "./extensions/description-list";
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

  const shouldEnableCopilot = untrack(() => copilotEnabled);
  let container = $state<HTMLElement>();

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
        tightListClass: "tight",
        bulletListMarker: "-",
        linkify: false,
        breaks: false,
      }),
      ...(shouldEnableCopilot
        ? [CopilotExtension.configure({ api: "/api/ai/editor/copilot" })]
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
      Callout,
      // DescriptionList,
      DescriptionTerm,
      DescriptionDetail,
      CodeBlockHighlight,
    ],
    content: content ?? "",
    editable,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] px-6 py-4",
        spellcheck: "false",
        lang: "en",
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      controller.handleEditorUpdate(transaction, e);
    },
  });

  // Mirror the editable prop into the live editor. Tiptap doesn't react to
  // config changes after construction — we have to push it imperatively.
  $effect(() => {
    $editor?.setEditable(editable);
  });
</script>

<div bind:this={container} class="flex-1 overflow-y-auto relative {className}">
  {#if $editor}
    <BubbleMenu editor={$editor} class="z-50">
      <GenerativeMenuSwitch
        editor={$editor}
        onAiCommand={(option, text) => controller.handleAiCommand(option, text)}
      />
    </BubbleMenu>
  {/if}

  <div class="wysiwyg-editor-wrapper w-full">
    <EditorContent editor={$editor} class="w-full" />
  </div>

  {#if controller.aiPromptOpen && controller.aiPromptPos}
    <div
      class="ai-prompt-anchor"
      style="top: {controller.aiPromptPos.top}px; left: {controller.aiPromptPos
        .left}px;"
    >
      <AiPromptPopover
        onSubmit={(prompt) => controller.submitAiPrompt(prompt)}
        onDismiss={() => controller.dismissAiPrompt()}
      />
    </div>
  {/if}
</div>