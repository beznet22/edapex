<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import WorkspacePane from "./WorkspacePane.svelte";
  import { cn } from "$lib/utils/shadcn";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let { 
    open = $bindable(false),
    isMobile = false 
  }: { 
    open?: boolean,
    isMobile?: boolean
  } = $props();
</script>

<!-- Desktop/Mobile persistent sidebar -->
<div 
  class={cn(
    "flex-col h-full overflow-hidden bg-background/40 backdrop-blur-3xl",
    isMobile ? "fixed inset-0 z-50 w-full h-full lg:hidden" : "hidden lg:flex"
  )}
  transition:fly={{ x: 500, duration: 500, easing: quintOut }}
>
  {#if isMobile}
    <!-- Mobile specific backdrop/wrapper if needed, but WorkspacePane has its own style -->
    <div class="h-full w-full">
      <WorkspacePane onClose={() => open = false} isMobile={true} />
    </div>
  {:else}
    <div class="h-full w-full border-l border-white/5">
      <WorkspacePane onClose={() => open = false} />
    </div>
  {/if}
</div>
