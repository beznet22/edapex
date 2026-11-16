<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "./ui/button";
  import { Loader } from "./prompt-kit/loader";
  import { cn } from "$lib/utils/shadcn.js";

  let {
    pending,
    success,
    class: className,
    children,
  }: { pending: boolean; success: boolean; class?: string; children: Snippet } = $props();
</script>

<Button
  type={pending ? "button" : "submit"}
  disabled={pending || success}
  class={cn("relative w-full overflow-hidden transition-all duration-300", className)}
>
  <div class={cn(
    "flex items-center justify-center gap-2 transition-all duration-300",
    (pending || success) ? "opacity-0 scale-95" : "opacity-100 scale-100"
  )}>
    {@render children()}
  </div>

  {#if pending || success}
    <div class="absolute inset-0 flex items-center justify-center">
      <Loader variant="circular" size="sm" class="text-current" />
    </div>
  {/if}

  <output aria-live="polite" class="sr-only">
    {pending || success ? "Loading" : "Submit form"}
  </output>
</Button>
