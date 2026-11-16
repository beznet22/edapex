<script lang="ts">
  import { cn } from "$lib/utils/shadcn.js";
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import {
    PromptInputClass,
    setPromptInputContext,
    type PromptInputSchema,
  } from "./prompt-input-context.svelte.js";

  let {
    class: className,
    isLoading = false,
    value,
    onValueChange,
    maxHeight = 240,
    onSubmit,
    children,
  }: PromptInputSchema & {
    class?: string;
    children: import("svelte").Snippet;
  } = $props();

  const contextInstance = new PromptInputClass({
    get isLoading() { return isLoading; },
    get value() { return value; },
    get onValueChange() { return onValueChange; },
    get maxHeight() { return maxHeight; },
    get onSubmit() { return onSubmit; },
    get disabled() { return isLoading; },
  });

  setPromptInputContext(contextInstance);

  // Sync props with context
  $effect(() => {
    contextInstance.isLoading = isLoading;
    contextInstance.disabled = isLoading;
  });

  $effect(() => {
    if (value !== undefined) {
      contextInstance.value = value;
    }
  });

  $effect(() => {
    contextInstance.onValueChange = onValueChange;
  });

  $effect(() => {
    contextInstance.maxHeight = maxHeight;
  });

  $effect(() => {
    contextInstance.onSubmit = onSubmit;
  });

  function handleClick() {
    contextInstance.textareaRef?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Only handle Enter key to focus textarea from wrapper
    // Don't intercept Space key as it prevents typing spaces in the textarea
    if (e.key === "Enter") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<TooltipPrimitive.Provider>
  <div
    class={cn(
      "cursor-text transition-all duration-300",
      className,
    )}
    onclick={handleClick}
    onkeydown={handleKeyDown}
    role="button"
    tabindex="-1"
  >
    {@render children()}
  </div>
</TooltipPrimitive.Provider>
