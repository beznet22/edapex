<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Popover from "$lib/components/ui/popover";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import CheckIcon from "@lucide/svelte/icons/check";

  let {
    uploadingFiles,
    assetCount
  }: {
    uploadingFiles: {name: string, status: string}[];
    assetCount: number;
  } = $props();
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button 
        {...props}
        variant="ghost"
        class="h-7 w-full px-4 flex items-center justify-between border-t border-white/5 bg-slate-950/40 hover:bg-white/5 transition-all text-[9.5px] font-black tracking-widest text-white/20 uppercase group/status rounded-none"
      >
        <div class="flex items-center gap-4">
           <div class="flex items-center gap-2">
              <div class={cn(
                "size-1.5 rounded-full shadow-[0_0_8px]", 
                uploadingFiles.length > 0 ? "bg-[#D4AF37] animate-pulse shadow-[#D4AF37]/80" : "bg-emerald-500 shadow-emerald-500/40"
              )}></div>
              <span class={cn(uploadingFiles.length > 0 ? "text-[#D4AF37]" : "text-emerald-500/60")}>
                {uploadingFiles.length > 0 ? `Syncing ${uploadingFiles.length} files...` : 'All Systems Synced'}
              </span>
           </div>
           <div class="w-px h-2.5 bg-white/5"></div>
           <div class="flex items-center gap-2">
              <CloudIcon class="size-2.5 opacity-40 group-hover/status:opacity-100 transition-opacity" />
              <span>{assetCount} Assets</span>
           </div>
        </div>
        <div class="flex items-center gap-2 pr-1 opacity-0 group-hover/status:opacity-100 transition-opacity">
           <span>Live Orchestration</span>
           <div class="size-1 rounded-full bg-primary/40 animate-ping"></div>
        </div>
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64 hermes-glass border-white/10 p-0 shadow-2xl rounded-xl skew-y-0 translate-z-0 overflow-hidden" align="end" side="top" sideOffset={8}>
    <div class="bg-white/5 px-4 py-3 border-b border-white/5">
      <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Active Transfers</h4>
    </div>
    <ScrollArea class="max-h-[300px]">
      <div class="p-2 flex flex-col gap-1">
        {#if uploadingFiles.length === 0}
          <div class="py-12 flex flex-col items-center justify-center opacity-20 text-center px-4">
            <CheckIcon class="size-8 mb-2" />
            <p class="text-[9px] font-bold uppercase tracking-widest">No active uploads</p>
          </div>
        {:else}
          {#each uploadingFiles as f}
            <div class="px-3 py-2.5 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2 transition-all hover:bg-white/10">
              <div class="flex items-center justify-between gap-3">
                <span class="text-[10px] font-bold truncate opacity-90">{f.name}</span>
                <Badge variant="outline" class="text-[8px] h-4 font-black uppercase tracking-widest border-white/10 bg-white/5">
                  {f.status}
                </Badge>
              </div>
              {#if f.status === 'uploading' || f.status === 'extracting'}
                <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full bg-[#D4AF37] animate-progress-indeterminate"></div>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </ScrollArea>
  </Popover.Content>
</Popover.Root>
