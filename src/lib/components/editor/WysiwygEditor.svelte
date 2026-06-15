<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { createEditor } from "svelte-tiptap";
  import { EditorContent, BubbleMenu } from "svelte-tiptap";
  import StarterKit from "@tiptap/starter-kit";
  import Underline from "@tiptap/extension-underline";
  import Highlight from "@tiptap/extension-highlight";
  import Placeholder from "@tiptap/extension-placeholder";
  import Subscript from "@tiptap/extension-subscript";
  import Superscript from "@tiptap/extension-superscript";
  import { Markdown } from "tiptap-markdown";
  import WysiwygBubbleMenu from "./WysiwygBubbleMenu.svelte";
  import type { Editor } from "@tiptap/core";
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport, type UIMessage } from "ai";
  import { CopilotExtension } from "./extensions/copilot";
  import { SlashMenuExtension } from "./extensions/slash-menu";
  import { MentionExtension } from "./extensions/mention-menu";
  import { AiStreamNode } from "./extensions/ai-stream-node";
  import {
    cacheOriginalText,
    cleanupStaleCacheEntries,
  } from "./extensions/ai-stream-cache";
  import AiPromptPopover from "./AiPromptPopover.svelte";
  import { Table } from "@tiptap/extension-table";
  import { TableRow } from "@tiptap/extension-table-row";
  import { TableHeader } from "@tiptap/extension-table-header";
  import { TableCell } from "@tiptap/extension-table-cell";
  import { TaskList } from "@tiptap/extension-task-list";
  import { TaskItem } from "@tiptap/extension-task-item";
  import { Callout } from "./extensions/callout";
  import { CodeBlockHighlight } from "./extensions/code-block-lowlight";
  import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";

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
  } = $props();

  $effect(() => {
    (window as any).__editorMentionCtx = {
      designationId,
      selectedClassId,
      selectedSectionId,
      selectedClassName,
      selectedSectionName,
    };
  });

  let isAiProcessing = $state(false);
  let aiStreamNodePos = $state<number | null>(null);
  let accumulatedContent = $state("");

  // Floating AI prompt popover state
  let aiPromptOpen = $state(false);
  let aiPromptPos = $state<{ top: number; left: number } | null>(null);
  let pendingSelection = $state<{
    from: number;
    to: number;
    text: string;
    markdown: string;
  } | null>(null);

  let editorInstance = $state<Editor | null>(null);

  // TipTap builds the editor once. The copilot extension set is captured at mount time;
  // toggling the prop in the same editor instance would require a full rebuild, which
  // the in-editor status pill does not trigger (it only swaps the visual state).
  const shouldEnableCopilot = untrack(() => copilotEnabled);

  const editor = createEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
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
      Highlight.configure({
        HTMLAttributes: {
          class: "bg-primary/15 text-primary rounded px-0.5",
        },
      }),
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
        ? [CopilotExtension.configure({ api: "/api/ai/editor/copilot" })]
        : []),
      SlashMenuExtension,
      MentionExtension,
      AiStreamNode,
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
      CodeBlockHighlight,
    ],
    content,
    editorProps: {
      attributes: {
        class: "outline-none min-h-[200px] px-6 py-4",
        spellcheck: "false",
        lang: "en",
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      // Skip getMarkdown when an aiStreamBlock is in the document (it warns and
      // is also pointless — the parent doesn't care about partial streaming state).
      if (transaction.getMeta("aiStream")) return;
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
            messages: messages,
            ctx: currentCtx,
          },
        };
      },
    }),
    onError: (err) => {
      console.error("AI Improve Error:", err);
      if ($editor && aiStreamNodePos !== null) {
        const nodeAtPos = $editor.state.doc.nodeAt(aiStreamNodePos);
        if (nodeAtPos?.type.name === "aiStreamBlock") {
          const rawText = err?.message || "";
          console.error("AI Improve Error (raw):", rawText);

          let displayMsg;

          const retryMatch = rawText.match(/try again in ([\d.]+)s/);
          if (retryMatch) {
            const seconds = Math.ceil(parseFloat(retryMatch[1]));
            displayMsg = `⚠️ Rate limit reached. Auto-retrying in ${seconds}s…`;
          } else if (rawText.startsWith("{")) {
            try {
              const parsed = JSON.parse(rawText);
              displayMsg = parsed.error || "AI service error";
            } catch {
              displayMsg = "AI service encountered an error. Please try again.";
            }
          } else if (rawText.includes("does not support")) {
            displayMsg = `⚠️ ${rawText.replace(/^ERROR:\s*/i, "")}`;
          } else if (
            ["Cannot connect", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "socket", "fetch failed", "network", "unreachable", "timeout", "retries exhausted"].some((kw) =>
              rawText.toLowerCase().includes(kw)
            )
          ) {
            displayMsg = "⚠️ Connection timed out. Please check your internet connection and try again.";
          } else {
            displayMsg = "⚠️ AI service encountered an error. Please try again.";
          }

          const retryAfter = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null;
          const tr = $editor.state.tr.setNodeMarkup(aiStreamNodePos, undefined, {
            ...nodeAtPos.attrs,
            content: displayMsg || "An error occurred",
            status: "error",
            retryAfter,
          });
          tr.setMeta("aiStream", true);
          $editor.view.dispatch(tr);
        }
      }
      isAiProcessing = false;
      aiStreamNodePos = null;
      accumulatedContent = "";
      lastMessageId = "";
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
      // New message — reset accumulator
      if (lastMessage.id !== lastMessageId) {
        lastMessageId = lastMessage.id;
        accumulatedContent = "";
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
          // setNodeMarkup REPLACES attrs (does not merge) — preserve streamId/toolName
          const tr = $editor.state.tr.setNodeMarkup(
            aiStreamNodePos,
            undefined,
            {
              ...nodeAtPos.attrs,
              content: accumulatedContent,
              status: "streaming",
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
              ...nodeAtPos.attrs,
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

  function handleAiImprove() {
    if (!$editor || isAiProcessing || aiPromptOpen) return;
    const { from, to } = $editor.state.selection;
    if (from === to) return;
    const selectedText = $editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;
    runAiEdit(
      from,
      to,
      selectedText,
      "Improve the selected text to be clearer, more concise, and grammatically correct. Preserve the meaning and tone. Return only the improved text.",
    );
  }

  function runAiEdit(
    from: number,
    to: number,
    selectedText: string,
    prompt: string,
  ) {
    if (!$editor || isAiProcessing) return;
    const streamId = crypto.randomUUID();
    cleanupStaleCacheEntries();
    cacheOriginalText(streamId, selectedText);

    const markdown =
      ($editor.storage as any).markdown?.getMarkdown?.() ?? $editor.getHTML();
    currentCtx = { markdown, selectedText, toolName: "edit" };

    $editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, {
        type: "aiStreamBlock",
        attrs: { content: "", status: "streaming", toolName: "edit", streamId },
      })
      .run();

    let foundPos: number | null = null;
    $editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "aiStreamBlock" && foundPos === null) {
        foundPos = pos;
      }
      return foundPos === null;
    });
    aiStreamNodePos = foundPos;
    accumulatedContent = "";
    lastMessageId = "";
    isAiProcessing = true;
    chatClient.messages = [];
    chatClient.sendMessage({ text: prompt });
  }

  function handleAiPromptOpen(e: Event) {
    if (!$editor || isAiProcessing || aiPromptOpen) return;
    const detail = (e as CustomEvent<{ mode?: "edit" | "generate" }>)
      .detail ?? { mode: "generate" };
    const mode = detail.mode ?? "generate";

    const { from, to } = $editor.state.selection;
    const view = $editor.view;
    const editorRect = view.dom.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect() ?? editorRect;
    if (!containerRect) return;

    const pos = from;
    const coords = view.coordsAtPos(pos);
    const popoverWidth = 320;
    const scrollTop = container?.scrollTop ?? 0;
    const scrollLeft = container?.scrollLeft ?? 0;

    const top = coords.bottom - containerRect.top + scrollTop + 8;
    const left = Math.max(
      8,
      Math.min(
        containerRect.width - popoverWidth - 8,
        coords.left - containerRect.left + scrollLeft - popoverWidth / 2,
      ),
    );

    const markdown =
      ($editor.storage as any).markdown?.getMarkdown?.() ?? $editor.getHTML();
    const selectedText =
      from !== to ? $editor.state.doc.textBetween(from, to, "\n") : "";

    pendingSelection = { from, to, text: selectedText, markdown };
    currentCtx = {
      markdown,
      selectedText,
      toolName: mode === "generate" ? "generate" : "edit",
    };
    aiPromptPos = { top, left };
    aiPromptOpen = true;
  }

  function dismissAiPrompt() {
    aiPromptOpen = false;
    aiPromptPos = null;
    pendingSelection = null;
    $editor?.commands.focus();
  }

  function submitAiPrompt(prompt: string) {
    if (!$editor || !pendingSelection) return;
    const { from, to, text: selectedText, markdown } = pendingSelection;
    const isEdit = currentCtx?.toolName === "edit";
    const streamId = crypto.randomUUID();
    cleanupStaleCacheEntries();

    if (isEdit) {
      cacheOriginalText(streamId, selectedText);
      $editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, {
          type: "aiStreamBlock",
          attrs: {
            content: "",
            status: "streaming",
            toolName: "edit",
            streamId,
          },
        })
        .run();
    } else {
      $editor
        .chain()
        .focus()
        .insertContentAt(from, {
          type: "aiStreamBlock",
          attrs: {
            content: "",
            status: "streaming",
            toolName: "generate",
            streamId,
          },
        })
        .run();
    }

    let foundPos: number | null = null;
    $editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "aiStreamBlock" && foundPos === null) {
        foundPos = pos;
      }
      return foundPos === null;
    });
    aiStreamNodePos = foundPos;
    accumulatedContent = "";
    lastMessageId = "";
    isAiProcessing = true;
    chatClient.messages = [];
    chatClient.sendMessage({ text: prompt });

    aiPromptOpen = false;
    aiPromptPos = null;
    pendingSelection = null;
  }

  let container = $state<HTMLElement>();

  function handleStreamResolve(e: Event) {
    isAiProcessing = false;
    aiStreamNodePos = null;
    accumulatedContent = "";
    lastMessageId = "";
    try {
      chatClient.messages = [];
    } catch {
      /* ignore */
    }
    try {
      (chatClient as any).stop?.();
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    if (!container) return;
    container.addEventListener("ai-prompt-open", handleAiPromptOpen);
    container.addEventListener("ai-stream-resolve", handleStreamResolve);
    return () => {
      container?.removeEventListener("ai-prompt-open", handleAiPromptOpen);
      container?.removeEventListener("ai-stream-resolve", handleStreamResolve);
    };
  });
</script>

<div bind:this={container} class="flex-1 overflow-y-auto relative {className}">
  {#if $editor}
    <BubbleMenu editor={$editor} class="z-50">
      <WysiwygBubbleMenu editor={$editor} onAiImprove={handleAiImprove} />
    </BubbleMenu>
  {/if}

  <div class="wysiwyg-editor-wrapper w-full">
    <EditorContent editor={$editor} class="w-full" />
  </div>

  {#if aiPromptOpen && aiPromptPos}
    <div
      class="ai-prompt-anchor"
      style="top: {aiPromptPos.top}px; left: {aiPromptPos.left}px;"
    >
      <AiPromptPopover onSubmit={submitAiPrompt} onDismiss={dismissAiPrompt} />
    </div>
  {/if}
</div>

<style>
  /* Tiptap content typography — mirrors svelte-streamdown shadcnTheme (node_modules/svelte-streamdown/dist/theme.js:157-309)
     so WYSIWYG editor renders identically to <Markdown /> preview. */
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

  :global(.wysiwyg-editor-wrapper .tiptap ul) {
    margin-left: 1rem;
    list-style-position: outside;
    list-style-type: disc;
    white-space: normal;
    color: var(--foreground);
    padding-left: 1.5rem;
  }

  :global(.wysiwyg-editor-wrapper .tiptap ol) {
    margin-left: 1rem;
    list-style-position: outside;
    white-space: normal;
    color: var(--foreground);
    padding-left: 1.5rem;
  }

  :global(.wysiwyg-editor-wrapper .tiptap li) {
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
  }

  /* Tiptap renders <li><p>…</p></li>. The browser's default <p> margin: 1em 0
     collapses the inside marker, so neutralize the <p> inside <li>. */
  :global(.wysiwyg-editor-wrapper .tiptap li > p) {
    margin: 0;
  }

  :global(.wysiwyg-editor-wrapper .tiptap li::marker) {
    color: var(--muted-foreground);
  }

  /* Task list — checkbox items. Tiptap renders <ul data-type="taskList"><li data-type="taskItem">
     with a hidden checkbox + label. The Tiptap TaskItem wraps the content in <div><p>…</p></div>;
     because <p> is block-level by default the checkbox ends up on a row ABOVE the text.
     Setting <div> to display:flex and <p> to flex:1 puts the checkbox and the first line of
     text on the same row while still allowing multi-line <p> content to wrap. */
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
  :global(.wysiwyg-editor-wrapper .tiptap li[data-type="taskItem"] > div > p) {
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

  /* Code block (Tiptap CodeBlock renders <pre><code class="language-xxx">…</code></pre>).
     The svelte-streamdown shadcnTheme code.base + code.pre + code.container stack is too
     complex to mirror 1:1 without the svelte-streamdown <Code /> component, so we render
     a clean shiki-friendly container: rounded border, muted bg, mono font, preserved
     whitespace, no phantom blank lines. */
  :global(.wysiwyg-editor-wrapper .tiptap pre) {
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

  :global(.wysiwyg-editor-wrapper .tiptap pre code) {
    background-color: transparent;
    border-radius: 0;
    padding: 0;
    color: inherit;
    font-size: inherit;
    font-family: inherit;
    white-space: pre;
  }

  :global(.wysiwyg-editor-wrapper .tiptap strong) {
    font-weight: 600;
    color: var(--foreground);
  }

  :global(.wysiwyg-editor-wrapper .tiptap em) {
    font-style: italic;
  }

  :global(.wysiwyg-editor-wrapper .tiptap a) {
    color: var(--primary);
    overflow-wrap: anywhere;
    font-weight: 500;
    text-decoration-line: underline;
  }

  :global(.wysiwyg-editor-wrapper .tiptap a:hover) {
    color: color-mix(in oklch, var(--primary), transparent 20%);
  }

  :global(.wysiwyg-editor-wrapper .tiptap blockquote) {
    border-color: color-mix(in oklch, var(--muted-foreground), transparent 70%);
    color: var(--muted-foreground);
    margin-top: 1rem;
    margin-bottom: 1rem;
    border-left-width: 4px;
    padding-left: 1rem;
    font-style: italic;
  }

  /* Tiptap renders <blockquote><p>…</p></blockquote>. The <p>'s 1em margin
     doubles the blockquote's spacing — neutralize it. */
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
  }

  /* Table — mirrors svelte-streamdown shadcnTheme table.* classes.
     Requires @tiptap/extension-table to be added to the editor for live editing. */
  :global(.wysiwyg-editor-wrapper .tiptap table) {
    width: 100%;
    max-width: 100%;
    margin-top: 1rem;
    margin-bottom: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    border-collapse: collapse;
    min-width: 100%;
    overflow-x: auto;
  }
  :global(.wysiwyg-editor-wrapper .tiptap thead) {
    background: color-mix(in oklch, var(--muted), transparent 20%);
  }
  :global(.wysiwyg-editor-wrapper .tiptap tr) {
    border-bottom: 1px solid var(--border);
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
  }

  /* Tiptap renders <td><p>…</p></td>. Neutralize the <p> margin so cell padding
     is the only spacing. */
  :global(.wysiwyg-editor-wrapper .tiptap th > p),
  :global(.wysiwyg-editor-wrapper .tiptap td > p) {
    margin: 0;
  }

  /* Callout — mirrors svelte-streamdown shadcnTheme alert.* classes.
     <aside data-callout data-type="…"><div data-callout-title>…</div><div data-callout-content>…</div></aside> */
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
      .wysiwyg-editor-wrapper .tiptap aside[data-callout] > [data-callout-title]
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
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout] > [data-callout-title]::before) {
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
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="note"] > [data-callout-title]::before) {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 16v-4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 8h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 16v-4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 8h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
  }
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="tip"] > [data-callout-title]::before) {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M9 18h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M10 22h4' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M9 18h6' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M10 22h4' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
  }
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="warning"] > [data-callout-title]::before) {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 9v4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 17h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 9v4' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cpath d='M12 17h.01' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
  }
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="caution"] > [data-callout-title]::before) {
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='8' x2='12' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='none' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='8' x2='12' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E");
  }
  :global(.wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="important"] > [data-callout-title]::before) {
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
  }
  :global(
      .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="note"]
    ) {
    border-color: oklch(0.6 0.18 240);
  }
  :global(
      .wysiwyg-editor-wrapper
        .tiptap
        aside[data-callout][data-type="note"]
        > [data-callout-title]
    ) {
    color: oklch(0.6 0.18 240);
  }
  :global(
      .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="tip"]
    ) {
    border-color: oklch(0.65 0.18 145);
  }
  :global(
      .wysiwyg-editor-wrapper
        .tiptap
        aside[data-callout][data-type="tip"]
        > [data-callout-title]
    ) {
    color: oklch(0.55 0.18 145);
  }
  :global(
      .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="warning"]
    ) {
    border-color: oklch(0.78 0.16 85);
  }
  :global(
      .wysiwyg-editor-wrapper
        .tiptap
        aside[data-callout][data-type="warning"]
        > [data-callout-title]
    ) {
    color: oklch(0.7 0.16 85);
  }
  :global(
      .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="caution"]
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
      .wysiwyg-editor-wrapper .tiptap aside[data-callout][data-type="important"]
    ) {
    border-color: oklch(0.58 0.2 300);
  }
  :global(
      .wysiwyg-editor-wrapper
        .tiptap
        aside[data-callout][data-type="important"]
        > [data-callout-title]
    ) {
    color: oklch(0.58 0.2 300);
  }

  /* Sup / sub — svelte-streamdown shadcnTheme uses text-sm. */
  :global(.wysiwyg-editor-wrapper .tiptap sup),
  :global(.wysiwyg-editor-wrapper .tiptap sub) {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  /* AiStreamNode — <NodeViewWrapper class="ai-stream-wrapper"> renders
     <p><Markdown /></p> indirectly through ProseMirror. Neutralize the
     trailing <p>'s default margin so the Accept/Discard row sits flush. */
  :global(.wysiwyg-editor-wrapper .tiptap [data-ai-stream] > p) {
    margin: 0;
  }

  /* Mention — inline pill rendered by @tiptap/extension-mention. The Node
     itself is an inline atom; styling here ensures it reads as a
     structured variable without breaking the line baseline. */
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
  }

  /* Mention suggestion popup — positioned absolutely, anchored to the caret
     by the suggestion plugin's clientRect. The popup itself is teleported
     to <body> so it escapes any overflow:hidden ancestor. */
  :global(.mention-suggestion-popup) {
    font-family: inherit;
  }

  /* Placeholder styling */
  :global(
      .wysiwyg-editor-wrapper .tiptap p.is-editor-empty:first-child::before
    ),
  :global(.wysiwyg-editor-wrapper .tiptap p.is-empty::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--muted-foreground);
    pointer-events: none;
    height: 0;
    font-style: italic;
    opacity: 0.5;
  }

  /* Selection styling */
  :global(.wysiwyg-editor-wrapper .tiptap ::selection) {
    background: oklch(0.65 0.15 40 / 0.2);
  }

  /* First/last-child margin reset — mirrors <Markdown />'s [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
     so WYSIWYG edges match the preview exactly. */
  :global(.wysiwyg-editor-wrapper .tiptap > :first-child) {
    margin-top: 0 !important;
  }
  :global(.wysiwyg-editor-wrapper .tiptap > :last-child) {
    margin-bottom: 0 !important;
  }

  /* Syntax highlighting — lowlight emits <span class="hljs-xxx"> tokens. Uses design-token
     oklch hues so highlighting reads correctly in both light and dark modes. */
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

  /* Floating AI prompt popover anchor — positioned absolutely within the scroll container
     so the popover stays visible while the user scrolls. z-[60] sits above the
     BubbleMenu (z-50) and the slash/mention suggestion popups. */
  .ai-prompt-anchor {
    position: absolute;
    z-index: 60;
  }

</style>
