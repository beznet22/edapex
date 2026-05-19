<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    openedFiles,
    activeFileKey = $bindable(),
    activeFileDef,
    onTabClose,
  }: {
    openedFiles: {key: string, name: string, type: string, url: string}[];
    activeFileKey: string | null;
    activeFileDef: {key: string, name: string, type: string, url: string} | undefined;
    onTabClose: (key: string) => void;
  } = $props();
</script>

<div class="flex items-center border-b border-white/5 px-2 bg-slate-950/20 h-12">
  <ScrollArea orientation="horizontal" class="flex-1 whitespace-nowrap scrollbar-hide">
    <div class="flex px-2 gap-1.5">
      {#each openedFiles as file (file.key)}
        <div 
          role="tab"
          aria-selected={activeFileKey === file.key}
          tabindex={0}
          class={cn(
            "group flex items-center gap-2.5 px-4 h-8 rounded-xl border transition-all duration-300 relative cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40",
            activeFileKey === file.key 
              ? "bg-primary/20 text-white border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.15)]" 
              : "text-white/40 border-white/5 hover:bg-white/5 hover:text-white/70"
          )}
          onclick={() => activeFileKey = file.key}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') activeFileKey = file.key }}
        >
          <span class="text-[11px] font-bold tracking-tight">{file.name}</span>
          <button 
            type="button"
            class="size-5 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-60 hover:opacity-100! hover:bg-white/10 transition-all cursor-pointer"
            onclick={(e) => { e.stopPropagation(); onTabClose(file.key); }}
          >
            <XIcon class="size-3" />
          </button>
          {#if activeFileKey === file.key}
            <div class="absolute bottom-[-6px] left-4 right-4 h-0.5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),1)]"></div>
          {/if}
        </div>
      {/each}
    </div>
  </ScrollArea>
</div>
