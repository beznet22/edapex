<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
  import Minimize2Icon from "@lucide/svelte/icons/minimize-2";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    maxPreviewMode = $bindable(),
    ocrEnabled = $bindable(),
    compressionEnabled = $bindable(),
    chat,
    onClose
  }: {
    maxPreviewMode: boolean;
    ocrEnabled: boolean;
    compressionEnabled: boolean;
    chat: any;
    onClose: () => void;
  } = $props();
</script>

<header class="flex items-center justify-between px-3 h-11 border-b border-white/5 shrink-0 bg-slate-950/20 backdrop-blur-md">
  <div class="flex items-center gap-3">
    <!-- Max Preview Toggle (Globe) -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button 
            {...props}
            variant="ghost" 
            size="icon" 
            class={cn("size-8 rounded-lg transition-all", maxPreviewMode ? "text-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_20px_rgba(212,175,55,0.2)]" : "text-white/40 hover:text-white")}
            onclick={() => maxPreviewMode = !maxPreviewMode}
          >
            {#if maxPreviewMode}
              <Minimize2Icon class="size-4.5" />
            {:else}
              <Maximize2Icon class="size-4.5" />
            {/if}
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{maxPreviewMode ? 'Exit' : 'Enter'} Max Preview</Tooltip.Content>
    </Tooltip.Root>

    <div class="w-px h-4 bg-white/10 mx-1"></div>

    <!-- Optimization Hooks -->
    <div class="flex items-center gap-1.5 bg-slate-900/40 p-1 rounded-xl border border-white/5">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button 
              {...props}
              variant="ghost" 
              size="icon" 
              class={cn("size-7 rounded-lg transition-all", ocrEnabled ? "text-[#D4AF37] bg-[#D4AF37]/15" : "text-white/20 hover:text-white/40")}
              onclick={() => ocrEnabled = !ocrEnabled}
            >
              <EyeIcon class="size-3.5" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>OCR Hook {ocrEnabled ? 'Active' : 'Off'}</Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button 
              {...props}
              variant="ghost" 
              size="icon" 
              class={cn("size-7 rounded-lg transition-all", compressionEnabled ? "text-emerald-500 bg-emerald-500/15" : "text-white/20 hover:text-white/40")}
              onclick={() => compressionEnabled = !compressionEnabled}
            >
              <ZapIcon class="size-3.5" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Auto-Compress {compressionEnabled ? 'On' : 'Off'}</Tooltip.Content>
      </Tooltip.Root>
    </div>
  </div>

  <!-- Center Title (Agent Selection Trigger) -->
  <div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" class="h-8 px-3 rounded-xl hover:bg-white/5 text-[11px] font-black uppercase tracking-[0.2em] text-[#D4AF37] hover:text-[#D4AF37] transition-all gap-2 border border-[#D4AF37]/20 bg-[#D4AF37]/5">
            {chat.activeAgent?.label || 'Hermes'}
            <ChevronDownIcon class="size-3 opacity-50" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="center" class="w-56 hermes-glass border-white/5 shadow-2xl skew-y-0 translate-z-0">
        <DropdownMenu.Label class="text-[10px] font-bold uppercase tracking-widest opacity-40 px-2 py-2">Select Agent Role</DropdownMenu.Label>
        <DropdownMenu.Separator class="bg-white/5" />
        {#each chat.agents as agent}
          <DropdownMenu.Item 
            class={cn(
              "gap-3 px-3 py-2.5 rounded-lg transition-all focus:bg-[#D4AF37]/10 focus:text-[#D4AF37]",
              chat.activeAgent?.id === agent.id ? "text-[#D4AF37] bg-[#D4AF37]/5" : ""
            )}
            onclick={() => chat.activeAgent = agent}
          >
            <div class={cn("size-2.5 rounded-full", chat.activeAgent?.id === agent.id ? "bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.6)]" : "bg-white/10")}></div>
            <div class="flex flex-col">
              <span class="text-[11px] font-bold uppercase tracking-tight">{agent.label}</span>
              <span class="text-[9px] opacity-40 leading-none">{agent.assistants[0]?.highlight || 'Specialized AI tool'}</span>
            </div>
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <Button 
    variant="ghost" 
    size="icon" 
    class="size-9 rounded-xl text-white/40 hover:text-white transition-all hover:bg-white/5 cursor-pointer"
    onclick={onClose}
  >
    <XIcon class="size-5" />
  </Button>
</header>
