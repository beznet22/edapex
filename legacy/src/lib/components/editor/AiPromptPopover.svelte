<script lang="ts">
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { tick } from "svelte";

  let {
    onSubmit,
    onDismiss,
  }: {
    onSubmit: (prompt: string) => void;
    onDismiss: () => void;
  } = $props();

  let promptDraft = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let containerEl = $state<HTMLFormElement | null>(null);

  $effect(() => {
    if (inputEl) {
      tick().then(() => inputEl?.focus());
    }
  });

  $effect(() => {
    function handleDocumentPointerDown(e: PointerEvent) {
      if (containerEl && !containerEl.contains(e.target as Node)) {
        onDismiss();
      }
    }
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  });

  function handleSubmit(e?: Event) {
    e?.preventDefault();
    const prompt = promptDraft.trim();
    if (!prompt) return;
    onSubmit(prompt);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  }

  function handleContainerMouseDown(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

<form
  bind:this={containerEl}
  class="ai-prompt-popover"
  onsubmit={handleSubmit}
  onmousedown={handleContainerMouseDown}
  aria-label="Ask AI anything"
>
  <input
    bind:this={inputEl}
    bind:value={promptDraft}
    type="text"
    class="ai-prompt-input"
    placeholder="Ask AI anything"
    onkeydown={handleKeyDown}
    autocomplete="off"
    spellcheck="true"
  />
  <button
    type="submit"
    class="ai-prompt-submit"
    disabled={!promptDraft.trim()}
    aria-label="Send prompt"
  >
    <ArrowUp class="h-4 w-4" />
  </button>
</form>

<style>
  .ai-prompt-popover {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: 9999px;
    box-shadow:
      0 1px 2px 0 oklch(0 0 0 / 0.05),
      0 8px 24px -4px oklch(0 0 0 / 0.18),
      0 20px 40px -8px oklch(0 0 0 / 0.12);
    width: 24rem;
    max-width: calc(100vw - 2rem);
    animation: ai-popover-in 180ms ease-out;
    transform-origin: bottom center;
  }

  @keyframes ai-popover-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .ai-prompt-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    font-size: 0.9375rem;
    line-height: 1.25rem;
    color: var(--foreground);
    padding: 0.25rem 0;
    font-family: inherit;
  }

  .ai-prompt-input::placeholder {
    color: var(--muted-foreground);
    opacity: 0.7;
  }

  .ai-prompt-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    background: var(--muted-foreground);
    color: var(--background);
    border: none;
    cursor: pointer;
    transition: opacity 150ms ease, transform 150ms ease, background 150ms ease;
    flex-shrink: 0;
  }

  .ai-prompt-submit:hover:not(:disabled) {
    background: var(--foreground);
  }

  .ai-prompt-submit:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ai-prompt-submit:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
