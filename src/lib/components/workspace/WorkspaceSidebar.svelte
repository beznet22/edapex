<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import WorkspacePane from "./WorkspacePane.svelte";
  import { cn } from "$lib/utils/shadcn";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<!-- Desktop persistent sidebar -->
<aside class={cn(
  "hidden lg:flex flex-col h-full border-l border-border/40 bg-background/50 backdrop-blur-md transition-all duration-300 ease-in-out overflow-hidden shadow-2xl",
  open ? "w-80 opacity-100" : "w-0 opacity-0 border-none"
)}>
  <div class="w-80 h-full flex flex-col">
    <WorkspacePane onClose={() => open = false} />
  </div>
</aside>

<!-- Mobile sheet -->
<div class="lg:hidden">
  <Sheet.Root bind:open>
    <Sheet.Content side="right" class="w-[85vw] sm:w-[400px] p-0 border-l border-border bg-background outline-none">
      <div class="flex h-full w-full flex-col">
        <WorkspacePane onClose={() => open = false} />
      </div>
    </Sheet.Content>
  </Sheet.Root>
</div>
