<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createEditor } from "svelte-tiptap";
  import { EditorContent, BubbleMenu } from "svelte-tiptap";
  import StarterKit from "@tiptap/starter-kit";
  import Underline from "@tiptap/extension-underline";
  import Highlight from "@tiptap/extension-highlight";
  import Placeholder from "@tiptap/extension-placeholder";
  import { Markdown } from "tiptap-markdown";
  import WysiwygBubbleMenu from "./WysiwygBubbleMenu.svelte";
  import type { Editor } from "@tiptap/core";

  let {
    content = "",
    onUpdate,
    onAiImprove,
    onAiGenerate,
    class: className = "",
  }: {
    content?: string;
    onUpdate?: (markdown: string) => void;
    onAiImprove?: (selectedText: string) => void;
    onAiGenerate?: () => void;
    class?: string;
  } = $props();

  let editorInstance = $state<Editor | null>(null);

  const editor = createEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: {
            class:
              "bg-card rounded-lg p-4 font-mono text-[12px] leading-relaxed border border-border/30 my-3",
          },
        },
        blockquote: {
          HTMLAttributes: {
            class:
              "border-l-2 border-primary/40 pl-4 italic text-muted-foreground",
          },
        },
        horizontalRule: {
          HTMLAttributes: {
            class: "border-border/50 my-6",
          },
        },
      }),
      Underline,
      Highlight.configure({
        HTMLAttributes: {
          class: "bg-primary/15 text-primary rounded px-0.5",
        },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands, or start writing...",
        emptyEditorClass: "is-editor-empty",
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] px-6 py-4",
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = (e.storage as any).markdown?.getMarkdown?.() ?? e.getHTML();
      onUpdate?.(md);
    },
  });

  // Track the editor instance for child components
  $effect(() => {
    if ($editor) {
      editorInstance = $editor;
    }
  });

  // Update content when external content changes (e.g. file switch)
  let lastExternalContent = content;
  $effect(() => {
    if (content !== lastExternalContent && $editor) {
      lastExternalContent = content;
      $editor.commands.setContent(content);
    }
  });

  function handleAiImprove() {
    if (!$editor) return;
    const { from, to } = $editor.state.selection;
    const selectedText = $editor.state.doc.textBetween(from, to, " ");
    if (selectedText && onAiImprove) {
      onAiImprove(selectedText);
    }
  }
</script>

<div class="flex-1 overflow-y-auto {className}">
  {#if $editor}
    <BubbleMenu editor={$editor} class="z-50">
      <WysiwygBubbleMenu
        editor={$editor}
        onAiImprove={onAiImprove ? handleAiImprove : undefined}
      />
    </BubbleMenu>
  {/if}

  <EditorContent editor={$editor} class="w-full" />
</div>

<style>
  /* Tiptap prose styling — flat, borderless, integrated with Hermes theme */
  :global(.tiptap) {
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.7;
    color: var(--foreground);
  }

  :global(.tiptap h1) {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: var(--foreground);
  }

  :global(.tiptap h2) {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--foreground);
  }

  :global(.tiptap h3) {
    font-size: 1.1rem;
    font-weight: 700;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    color: var(--foreground);
  }

  :global(.tiptap p) {
    margin-bottom: 0.5rem;
  }

  :global(.tiptap ul),
  :global(.tiptap ol) {
    padding-left: 1.5rem;
    margin-bottom: 0.5rem;
  }

  :global(.tiptap ul) {
    list-style-type: disc;
  }

  :global(.tiptap ol) {
    list-style-type: decimal;
  }

  :global(.tiptap li) {
    margin-bottom: 0.15rem;
  }

  :global(.tiptap li p) {
    margin-bottom: 0;
  }

  :global(.tiptap code) {
    font-family: var(--font-mono);
    font-size: 0.85em;
    background: var(--secondary);
    border-radius: 4px;
    padding: 0.15em 0.35em;
    color: var(--primary);
  }

  :global(.tiptap pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    color: inherit;
  }

  :global(.tiptap strong) {
    font-weight: 700;
  }

  :global(.tiptap a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* Placeholder styling */
  :global(.tiptap p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--muted-foreground);
    pointer-events: none;
    height: 0;
    font-style: italic;
    opacity: 0.5;
  }

  /* Selection styling */
  :global(.tiptap ::selection) {
    background: oklch(0.65 0.15 40 / 0.2);
  }
</style>
