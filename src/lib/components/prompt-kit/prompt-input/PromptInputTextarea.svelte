<script lang="ts">
  import { cn } from "$lib/utils/shadcn.js";
  import Textarea from "$lib/components/ui/textarea/textarea.svelte";
  import { getPromptInputContext } from "./prompt-input-context.svelte.js";
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { watch } from "runed";

  let {
    class: className,
    onkeydown,
    disableAutosize = false,
    ref = $bindable(null),
    ...restProps
  }: HTMLTextareaAttributes & {
    disableAutosize?: boolean;
    ref?: HTMLTextAreaElement | null;
  } = $props();

  const context = getPromptInputContext();

  // Auto-resize functionality using watch from runed
  watch(
    [() => context.value, () => context.maxHeight, () => disableAutosize],
    () => {
      if (disableAutosize) return;
      if (!context.textareaRef) return;

      if (context.textareaRef.scrollTop === 0) {
        context.textareaRef.style.height = "auto";
      }

      context.textareaRef.style.height =
        typeof context.maxHeight === "number"
          ? `${Math.min(context.textareaRef.scrollHeight, context.maxHeight)}px`
          : `min(${context.textareaRef.scrollHeight}px, ${context.maxHeight})`;
    },
  );

  function handleKeyDown(
    e: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
  ) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
    }
    onkeydown?.(e);
  }

  function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
    context.setValue(e.currentTarget.value);
  }

  $effect(() => {
    if (ref) {
      context.textareaRef = ref;
    }
  });
</script>

<Textarea
  bind:ref
  value={context.value}
  oninput={handleInput}
  onkeydown={handleKeyDown}
  class={cn(
    "w-full resize-none border-none! bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0",
    className,
  )}
  rows={1}
  disabled={context.disabled}
  {...restProps}
></Textarea>
