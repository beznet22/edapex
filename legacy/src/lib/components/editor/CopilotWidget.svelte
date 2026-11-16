<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import Timer from "@lucide/svelte/icons/timer";

  let {
    text,
    thinking = false,
    debouncing = false,
    onAccept,
    onDiscard
  }: {
    text: string;
    thinking?: boolean;
    debouncing?: boolean;
    onAccept: () => void;
    onDiscard: () => void;
  } = $props();

  function preventDefault(fn: () => void) {
    return (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
  }
</script>

<span class="copilot-ghost-text" class:copilot-debouncing={debouncing}>
  {#if debouncing}
    <span class="copilot-debouncing-indicator" aria-label="Copilot auto-trigger pending">
      <Timer class="h-3 w-3" />
      <span>drafting…</span>
    </span>
  {:else if thinking}
    <span class="copilot-thinking-dots" aria-label="Copilot is thinking">
      <span></span><span></span><span></span>
    </span>
  {:else}
    {text}
    <span class="copilot-actions" contenteditable="false">
      <Button
        variant="ghost"
        size="sm"
        onclick={preventDefault(onDiscard)}
        class="h-6 px-1.5 text-muted-foreground hover:text-destructive"
      >
        <X class="h-3 w-3" />
      </Button>
      <Button
        variant="default"
        size="sm"
        onclick={preventDefault(onAccept)}
        class="h-6 px-2 bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
      >
        <Check class="h-3 w-3 mr-1" />
        Accept
      </Button>
    </span>
  {/if}
</span>

<style>
  .copilot-ghost-text {
    opacity: 0.5;
    color: var(--muted-foreground);
    position: relative;
    pointer-events: none;
    user-select: none;
    white-space: pre-wrap;
  }

  /* 8px gap with pointer-events: none so clicks on the padding pass through to the document. */
  .copilot-actions {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 0;
    display: flex;
    gap: 0.25rem;
    background: var(--background);
    border: 1px solid var(--border);
    padding: 2px;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1);
    animation: delayed-fade-in 0.4s ease-out forwards;
    opacity: 0;
    z-index: 50;
    /* The outer element absorbs clicks; only the inner buttons reactivate pointer events. */
    pointer-events: auto;
  }

  .copilot-actions::before {
    content: '';
    position: absolute;
    inset: -8px;
    pointer-events: none;
  }

  @keyframes delayed-fade-in {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    50% {
      opacity: 0;
      transform: translateY(4px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .copilot-debouncing {
    opacity: 0.35;
  }

  .copilot-debouncing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-style: italic;
    font-size: 0.85em;
    color: var(--muted-foreground);
  }

  .copilot-thinking-dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .copilot-thinking-dots span {
    width: 4px;
    height: 4px;
    border-radius: 9999px;
    background: var(--muted-foreground);
    animation: copilot-blink 1.2s ease-in-out infinite;
  }
  .copilot-thinking-dots span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .copilot-thinking-dots span:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes copilot-blink {
    0%, 80%, 100% {
      opacity: 0.25;
      transform: scale(0.85);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
