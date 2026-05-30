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
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport, type UIMessage } from "ai";
  import { CopilotExtension } from "./extensions/copilot";
  import { SlashMenuExtension } from "./extensions/slash-menu";
  import { MentionExtension } from "./extensions/mention-menu";
  import { AiStreamNode } from "./extensions/ai-stream-node";

  let {
    content = "",
    onUpdate,
    class: className = "",
  }: {
    content?: string;
    onUpdate?: (markdown: string) => void;
    class?: string;
  } = $props();

  let isAiProcessing = $state(false);
  let aiStreamNodePos = $state<number | null>(null);
  let accumulatedContent = $state("");

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
      CopilotExtension.configure({
        debounceDelay: 500,
        api: "/api/ai/editor/copilot",
      }),
      SlashMenuExtension,
      MentionExtension,
      AiStreamNode,
    ],
    content,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] px-6 py-4",
        spellcheck: "true",
        lang: "en",
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
  let lastExternalContent = $state(content);
  $effect(() => {
    if (content !== lastExternalContent && $editor) {
      lastExternalContent = content;
      $editor.commands.setContent(content);
    }
  });

  let currentCtx = $state<any>(null);

  // Initialize once. The closure in prepareSendMessagesRequest will read the latest currentCtx
  const chatClient = new Chat<UIMessage>({
    id: "editor-command",
    transport: new DefaultChatTransport({
      api: "/api/ai/editor/command",
      prepareSendMessagesRequest: ({ messages }) => {
        return {
          body: {
            messages,
            ctx: currentCtx,
          },
        };
      },
    }),
    onError: (err) => {
      console.error("AI Improve Error:", err);
      isAiProcessing = false;
    },
  });

  let lastMessageId = $state("");

  // Reactive streaming effect — renders into AiStreamNode NodeView
  $effect(() => {
    if (!$editor || !isAiProcessing) return;

    const messages = chatClient.messages;
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "assistant") {
      // New message — insert the NodeView island
      if (lastMessage.id !== lastMessageId) {
        lastMessageId = lastMessage.id;
        accumulatedContent = "";

        if (currentCtx?.toolName === "edit") {
          $editor.commands.deleteSelection();
        }

        // Insert the aiStreamBlock node at the current cursor position
        const insertPos = $editor.state.selection.from;
        $editor
          .chain()
          .focus()
          .insertContentAt(insertPos, {
            type: "aiStreamBlock",
            attrs: { content: "" },
          })
          .run();

        // Find the position of the node we just inserted
        let foundPos: number | null = null;
        $editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "aiStreamBlock" && foundPos === null) {
            foundPos = pos;
          }
          return foundPos === null;
        });
        aiStreamNodePos = foundPos;
      }

      // Extract the full text content from the message
      const anyMsg = lastMessage as any;
      let fullContent = anyMsg.content || "";
      if (!fullContent && anyMsg.parts) {
        fullContent =
          anyMsg.parts.find((p: any) => p.type === "text")?.text || "";
      }

      // Update the NodeView's content attribute with the accumulated markdown
      if (
        fullContent.length > accumulatedContent.length &&
        aiStreamNodePos !== null
      ) {
        accumulatedContent = fullContent;

        // Verify the node still exists at the tracked position
        const nodeAtPos = $editor.state.doc.nodeAt(aiStreamNodePos);
        if (nodeAtPos?.type.name === "aiStreamBlock") {
          const tr = $editor.state.tr.setNodeMarkup(
            aiStreamNodePos,
            undefined,
            {
              content: accumulatedContent,
            },
          );
          tr.setMeta("aiStream", true);
          $editor.view.dispatch(tr);
        }
      }
    }

    // Stream finished — present Accept/Reject options
    if (chatClient.status === "ready" || chatClient.status === "error") {
      if (aiStreamNodePos !== null && accumulatedContent && $editor) {
        const nodeAtPos = $editor.state.doc.nodeAt(aiStreamNodePos);
        if (nodeAtPos?.type.name === "aiStreamBlock") {
          const tr = $editor.state.tr.setNodeMarkup(
            aiStreamNodePos,
            undefined,
            {
              content: accumulatedContent,
              status: "finished",
            },
          );
          $editor.view.dispatch(tr);
        }
      }

      aiStreamNodePos = null;
      accumulatedContent = "";
      isAiProcessing = false;
    }
  });

  async function handleAiImprove() {
    if (!$editor || isAiProcessing) return;
    const { from, to } = $editor.state.selection;
    const selectedText = $editor.state.doc.textBetween(from, to, " ");
    if (!selectedText) return;

    isAiProcessing = true;
    const markdown =
      ($editor.storage as any).markdown?.getMarkdown?.() ?? $editor.getHTML();

    currentCtx = { markdown, selectedText, toolName: "edit" };
    chatClient.sendMessage({ text: "Improve this text" });
  }

  function handleAiGenerate() {
    if (!$editor || isAiProcessing) return;
    isAiProcessing = true;
    const markdown =
      ($editor.storage as any).markdown?.getMarkdown?.() ?? $editor.getHTML();
    currentCtx = { markdown, selectedText: "", toolName: "generate" };
    chatClient.sendMessage({ text: "Generate content here" });
  }

  let container = $state<HTMLElement>();

  $effect(() => {
    if (!container) return;
    container.addEventListener("ai-generate", handleAiGenerate);
    return () =>
      container?.removeEventListener("ai-generate", handleAiGenerate);
  });
</script>

<div bind:this={container} class="flex-1 overflow-y-auto {className}">
  {#if $editor}
    <BubbleMenu editor={$editor} class="z-50">
      <WysiwygBubbleMenu editor={$editor} onAiImprove={handleAiImprove} />
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
