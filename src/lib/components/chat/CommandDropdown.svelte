<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils/shadcn";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import SearchIcon from "@lucide/svelte/icons/search";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import LayoutPanelLeftIcon from "@lucide/svelte/icons/layout-panel-left";
  import ShuffleIcon from "@lucide/svelte/icons/shuffle";

  let { 
    query, 
    onSelect 
  }: { 
    query: string, 
    onSelect: (cmd: string) => void 
  } = $props();

  const commands = [
    { id: 'extract', label: 'Extract', icon: FileTextIcon, desc: 'Process assessment PDFs' },
    { id: 'grade', label: 'Grade', icon: GraduationCapIcon, desc: 'Execute grading logic' },
    { id: 'onboard', label: 'Onboard', icon: LayoutPanelLeftIcon, desc: 'Setup class context' },
    { id: 'gov', label: 'Governance', icon: ShieldCheckIcon, desc: 'Check compliance' },
    { id: 'switch', label: 'Switch', icon: ShuffleIcon, desc: 'Change orchestration mode' },
    { id: 'search', label: 'Search', icon: SearchIcon, desc: 'Deep codebase query' },
  ];

  const filtered = $derived(
    query ? commands.filter(c => c.id.includes(query.toLowerCase())) : commands
  );
</script>

<div class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
  <div class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]">
    Available Commands
  </div>
  <div class="flex flex-col gap-0.5 max-h-[320px] overflow-y-auto scrollbar-slick px-0.5">
    {#each filtered as cmd}
      <button 
        class="group flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent/50 text-left transition-colors cursor-pointer"
        onclick={() => onSelect(cmd.id)}
      >
        <div class="size-8 flex items-center justify-center rounded-md border border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
          <cmd.icon class="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div class="flex flex-col">
          <span class="text-sm font-medium text-foreground group-hover:text-primary transition-colors">/{cmd.label}</span>
          <span class="text-xs text-muted-foreground">{cmd.desc}</span>
        </div>
      </button>
    {/each}
    {#if filtered.length === 0}
      <div class="p-4 text-center text-sm text-muted-foreground">
        No commands matching "/{query}"
      </div>
    {/if}
  </div>
</div>
