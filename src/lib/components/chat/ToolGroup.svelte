<script lang="ts">
  import type { xUIMessagePart } from "$lib/types/chat-types";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "$lib/components/ui/collapsible";
  import ToolMessage from "$lib/components/tool-message.svelte";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let { parts }: { parts: xUIMessagePart[] } = $props();
  const toolCount = $derived(parts.length);
  let open = $state(true);
</script>

<div class="w-full max-w-2xl">
  <Collapsible
    bind:open
    class="rounded-2xl border border-border/30 bg-background/30 backdrop-blur-sm overflow-hidden"
  >
    <CollapsibleTrigger
      class="group flex w-full items-center justify-between px-3.5 py-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
    >
      <span>Tools ({toolCount})</span>
      <ChevronDownIcon
        class="size-3.5 transition-transform group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90"
      />
    </CollapsibleTrigger>
    <CollapsibleContent class="divide-y divide-border/20">
      {#each parts as part, i (i)}
        {#if part.type.startsWith("tool-")}
          <div class="px-3.5 py-2">
            <ToolMessage {part} />
          </div>
        {/if}
      {/each}
    </CollapsibleContent>
  </Collapsible>
</div>
