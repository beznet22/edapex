<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Popover from "$lib/components/ui/popover";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Badge } from "$lib/components/ui/badge";

  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import CheckIcon from "@lucide/svelte/icons/check";
  import FolderIcon from "@lucide/svelte/icons/folder";

  let {
    maxPreviewMode = $bindable(),
    ocrEnabled = $bindable(),
    compressionEnabled = $bindable(),
    activeView = $bindable(),
    chat,
    uploadingFiles,
    workflowStatus,
    canViewRunHistory,
  }: {
    maxPreviewMode: boolean;
    ocrEnabled: boolean;
    compressionEnabled: boolean;
    activeView: "files" | "workflow" | "run-history";
    chat: any;
    uploadingFiles: { name: string; status: string }[];
    workflowStatus: string;
    canViewRunHistory: boolean;
  } = $props();

  let hasActiveWorkflows = $derived(
    workflowStatus !== "idle" && workflowStatus !== "complete",
  );
  let activeTransfers = $derived(uploadingFiles.length > 0);
  let pulseStatus = $derived(hasActiveWorkflows || activeTransfers);
</script>

<!-- Expandable Vertical FAB Wrapper -->
<!-- The outer div triggers opacity on canvas hover (.group) and acts as the hover area for the FAB (.group/fab) -->
<div
  class="absolute bottom-6 right-6 z-50 flex flex-col items-center justify-end opacity-0 group-hover:opacity-100 transition-all duration-1000 pointer-events-auto group/fab"
>
  <!-- Expandable Content (Shown on FAB hover) -->
  <div
    class="mb-3 flex flex-col items-center gap-1.5 rounded-2xl bg-slate-950/90 backdrop-blur-3xl border border-white/10 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.6)] px-1.5 py-0 max-h-0 opacity-0 overflow-hidden transition-all duration-300 group-hover/fab:max-h-[500px] group-hover/fab:opacity-100 group-hover/fab:py-2"
  >
    <!-- Sidebar Toggle -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-300",
              !maxPreviewMode
                ? "text-[#D4AF37] bg-[#D4AF37]/10"
                : "text-white/40 hover:text-white hover:bg-white/5",
            )}
            onclick={() => (maxPreviewMode = !maxPreviewMode)}
          >
            <PanelLeftIcon class="size-4.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left">Toggle File Browser</Tooltip.Content>
    </Tooltip.Root>

    <div class="h-px shrink-0 w-5 bg-white/10 my-0.5"></div>

    <!-- Active View Controls -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-300",
              activeView === "files"
                ? "bg-primary/20 text-primary shadow-sm"
                : "text-white/40 hover:text-white hover:bg-white/5",
            )}
            onclick={() => (activeView = "files")}
          >
            <FolderIcon class="size-4.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left">Files View</Tooltip.Content>
    </Tooltip.Root>

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-300 relative",
              activeView === "workflow"
                ? "bg-[#D4AF37]/20 text-[#D4AF37] shadow-sm"
                : "text-white/40 hover:text-white hover:bg-white/5",
            )}
            onclick={() => (activeView = "workflow")}
          >
            <ActivityIcon class="size-4.5" />
            {#if hasActiveWorkflows && activeView !== "workflow"}
              <div
                class="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#D4AF37] animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]"
              ></div>
            {/if}
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left">Workflow Inspector</Tooltip.Content>
    </Tooltip.Root>

    {#if canViewRunHistory}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class={cn(
                "size-9 shrink-0 rounded-xl transition-all duration-300",
                activeView === "run-history"
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-white/40 hover:text-white hover:bg-white/5",
              )}
              onclick={() => (activeView = "run-history")}
            >
              <HistoryIcon class="size-4.5" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="left">Run History</Tooltip.Content>
      </Tooltip.Root>
    {/if}

    <div class="h-px shrink-0 w-5 bg-white/10 my-0.5"></div>

    <!-- Hooks (OCR, Compress) -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-300",
              ocrEnabled
                ? "text-[#D4AF37] bg-[#D4AF37]/15"
                : "text-white/20 hover:text-white/40 hover:bg-white/5",
            )}
            onclick={() => (ocrEnabled = !ocrEnabled)}
          >
            <EyeIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left"
        >OCR Hook {ocrEnabled ? "Active" : "Off"}</Tooltip.Content
      >
    </Tooltip.Root>

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-9 shrink-0 rounded-xl transition-all duration-300",
              compressionEnabled
                ? "text-emerald-500 bg-emerald-500/15"
                : "text-white/20 hover:text-white/40 hover:bg-white/5",
            )}
            onclick={() => (compressionEnabled = !compressionEnabled)}
          >
            <ZapIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="left"
        >Auto-Compress {compressionEnabled ? "On" : "Off"}</Tooltip.Content
      >
    </Tooltip.Root>
  </div>

  <!-- Primary Trigger Icon / Status Dot / Active Transfers Popover -->
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <!-- The trigger button serves as the bottom anchor. It shows the status cloud. -->
        <Button
          {...props}
          variant="default"
          size="icon"
          class="size-12 shrink-0 rounded-full bg-slate-950/90 hover:bg-slate-900 border border-white/10 text-white transition-all duration-300 relative overflow-hidden shadow-[0_5px_20px_rgba(0,0,0,0.5)] group-hover/fab:shadow-[0_8px_30px_rgba(0,0,0,0.6)] hover:scale-105"
        >
          <CloudIcon
            class={cn(
              "size-5 transition-all duration-300",
              pulseStatus ? "text-[#D4AF37]" : "text-white/60",
            )}
          />
          {#if pulseStatus}
            <div
              class="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-[#D4AF37] animate-ping shadow-[0_0_8px_rgba(212,175,55,0.8)]"
            ></div>
          {/if}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      class="w-64 hermes-glass border-white/10 p-0 shadow-2xl rounded-xl skew-y-0 translate-z-0 overflow-hidden mb-2 mr-2"
      align="end"
      side="left"
      sideOffset={16}
    >
      <div class="bg-white/5 px-4 py-3 border-b border-white/5">
        <h4
          class="text-[10px] font-black uppercase tracking-[0.2em] text-white/60"
        >
          Active Transfers
        </h4>
      </div>
      <ScrollArea class="max-h-[300px]">
        <div class="p-2 flex flex-col gap-1">
          {#if uploadingFiles.length === 0}
            <div
              class="py-12 flex flex-col items-center justify-center opacity-20 text-center px-4"
            >
              <CheckIcon class="size-8 mb-2" />
              <p class="text-[9px] font-bold uppercase tracking-widest">
                No active uploads
              </p>
            </div>
          {:else}
            {#each uploadingFiles as f}
              <div
                class="px-3 py-2.5 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2 transition-all hover:bg-white/10"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[10px] font-bold truncate opacity-90"
                    >{f.name}</span
                  >
                  <Badge
                    variant="outline"
                    class="text-[8px] h-4 font-black uppercase tracking-widest border-white/10 bg-white/5"
                  >
                    {f.status}
                  </Badge>
                </div>
                {#if f.status === "uploading" || f.status === "extracting"}
                  <div
                    class="h-1 w-full bg-white/5 rounded-full overflow-hidden"
                  >
                    <div
                      class="h-full bg-[#D4AF37] animate-progress-indeterminate"
                    ></div>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </ScrollArea>
    </Popover.Content>
  </Popover.Root>
</div>
