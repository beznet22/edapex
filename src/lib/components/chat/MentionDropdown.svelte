<script lang="ts">
  import { UserContext } from "$lib/context/user-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { searchFilter } from "$lib/utils/search";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import FileIcon from "@lucide/svelte/icons/file";
  import UsersIcon from "@lucide/svelte/icons/users";

  let { 
    query, 
    onSelect 
  }: { 
    query: string, 
    onSelect: (mention: any) => void 
  } = $props();

  const userContext = UserContext.fromContext();
  const fileActions = useFileActions();

  const students = $derived(userContext.students.map(s => ({ ...s, name: s.name ?? 'Unknown Student', type: 'student' })));
  const files = $derived(fileActions.files.map(f => ({ name: f.name ?? 'Untitled File', type: 'file' })));
  
  const allMentions = $derived([...students, ...files]);
  
  const filtered = $derived(
    query ? allMentions.filter(m => m.name.toLowerCase().includes(query.toLowerCase())) : allMentions
  );
</script>

<div class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
  <div class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]">
    Mention Entity
  </div>
  <div class="flex flex-col gap-0.5 overflow-y-auto max-h-[320px] scrollbar-slick px-0.5">
    {#each filtered as item}
      <button 
        class="group flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent/50 text-left transition-colors cursor-pointer"
        onclick={() => onSelect(item)}
      >
        <div class="size-8 flex items-center justify-center rounded-md border border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20 transition-colors">
          {#if item.type === 'student'}
            <GraduationCapIcon class="size-4 text-muted-foreground group-hover:text-primary" />
          {:else if item.type === 'file'}
            <FileIcon class="size-4 text-muted-foreground group-hover:text-primary" />
          {:else}
            <UsersIcon class="size-4 text-muted-foreground group-hover:text-primary" />
          {/if}
        </div>
        <div class="flex flex-col">
          <span class="text-sm font-medium text-foreground group-hover:text-primary transition-colors">@{item.name}</span>
          <span class="text-[10px] text-muted-foreground uppercase">{item.type}</span>
        </div>
      </button>
    {/each}
    {#if filtered.length === 0}
      <div class="p-4 text-center text-sm text-muted-foreground">
        No results for "@{query}"
      </div>
    {/if}
  </div>
</div>
