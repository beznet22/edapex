
<script lang="ts">
  import { NodeViewWrapper } from "svelte-tiptap";
  import { Streamdown } from "svelte-streamdown";
  import type { NodeViewProps } from "@tiptap/core";
  import { Button } from "$lib/components/ui/button";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";

  let { node, editor, getPos, deleteNode }: NodeViewProps = $props();

  const content = $derived(node.attrs.content || "");
  const status = $derived(node.attrs.status || "streaming");

  function handleAccept() {
    const pos = getPos();
    if (typeof pos === "number") {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContentAt(pos, content)
        .run();
    }
  }

  function handleReject() {
    deleteNode();
    editor.commands.focus();
  }
</script>

<NodeViewWrapper class="ai-stream-wrapper" data-ai-stream>
  <div class="ai-stream-container">
    <div class="ai-stream-indicator">
      <span class="ai-stream-dot"></span>
    </div>
    <div class="ai-stream-content">
      {#if content}
        <Streamdown
          {content}
          baseTheme="shadcn"
          animation={{
            enabled: true,
            type: "blur",
            duration: 400,
            timingFunction: "ease-out",
            tokenize: "word",
          }}
        />
      {:else}
        <span class="ai-stream-placeholder">AI is thinking…</span>
      {/if}
    </div>
  </div>
  
  {#if status === "finished"}
    <div class="ai-stream-actions">
      <Button variant="ghost" size="sm" onclick={handleReject} class="h-7 px-2 text-muted-foreground hover:text-destructive">
        <X class="h-4 w-4 mr-1" />
        Discard
      </Button>
      <Button variant="default" size="sm" onclick={handleAccept} class="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-700">
        <Check class="h-4 w-4 mr-1" />
        Accept
      </Button>
    </div>
  {/if}
</NodeViewWrapper>

<style>
  .ai-stream-container {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-left: 2px solid oklch(0.65 0.15 40 / 0.6);
    padding-left: 1rem;
    margin: 0.5rem 0;
    border-radius: 0 6px 6px 0;
    background: oklch(0.65 0.15 40 / 0.04);
    position: relative;
  }

  .ai-stream-indicator {
    display: flex;
    align-items: flex-start;
    padding-top: 0.35rem;
    flex-shrink: 0;
  }

  .ai-stream-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: oklch(0.65 0.15 40);
    animation: ai-pulse 1.5s ease-in-out infinite;
  }

  @keyframes ai-pulse {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.3);
    }
  }

  .ai-stream-content {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 1.7;
  }

  .ai-stream-placeholder {
    color: var(--muted-foreground);
    font-style: italic;
    opacity: 0.6;
  }

  .ai-stream-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-right: 0.5rem;
    animation: fade-in 0.2s ease-out forwards;
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>