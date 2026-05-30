<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";

  let { text, onAccept, onDiscard }: { text: string; onAccept: () => void; onDiscard: () => void } = $props();

  function preventDefault(fn: () => void) {
    return (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
  }
</script>

<span class="copilot-ghost-text">
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

  .copilot-actions {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 0;
    display: flex;
    gap: 0.25rem;
    pointer-events: auto;
    background: var(--background);
    border: 1px solid var(--border);
    padding: 2px;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    animation: delayed-fade-in 0.4s ease-out forwards;
    opacity: 0;
    z-index: 50;
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
</style>
