<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import VariableIcon from "@lucide/svelte/icons/variable";
  import { tick } from "svelte";

  interface MentionItem {
    id: number | string;
    name: string;
    category: string;
    typeBadge: string;
    parentContext?: string;
  }

  let {
    items = [],
    selectedIndex = 0,
    query = "",
    filterLabel = '',
    onSelect,
    onHover,
  }: {
    items: MentionItem[];
    selectedIndex: number;
    query: string;
    clientRect: (() => DOMRect | null) | null;
    filterLabel?: string;
    onSelect: (item: MentionItem) => void;
    onHover: (index: number) => void;
  } = $props();

  const iconFor = (category: string) => {
    if (category === 'students') return GraduationCapIcon;
    if (category === 'date') return CalendarIcon;
    return VariableIcon;
  };

  const grouped = $derived(() => {
    const byCategory: Record<string, MentionItem[]> = {};
    for (const item of items) {
      (byCategory[item.category] ??= []).push(item);
    }
    return byCategory;
  });

  const flatIndex = (item: MentionItem) => items.findIndex((i) => i.id === item.id && i.category === item.category);

  let listEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (listEl) {
      tick().then(() => {
        const el = listEl?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  });
</script>

<div
  bind:this={listEl}
  class="mention-suggestion-list bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl w-72 max-h-72 overflow-y-auto p-1"
  role="listbox"
  aria-label="Mention suggestions"
>
  {#if filterLabel}
    <div class="px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1">
      <span>Filter:</span>
      <span class="text-primary normal-case tracking-normal">{filterLabel}</span>
    </div>
  {/if}
  {#if items.length === 0}
    <div class="px-3 py-6 text-center text-[12px] text-muted-foreground">
      {#if query}
        No matches. Press Escape and type {`{{custom:${query}}}`} for a free-form value.
      {:else}
        Start typing to search…
      {/if}
    </div>
  {:else}
    {#each Object.entries(grouped()) as [category, group] (category)}
      <div class="px-2 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {category}
      </div>
      {#each group as item (item.id + '-' + item.category)}
        {@const idx = flatIndex(item)}
        {@const Icon = iconFor(item.category)}
        <button
          data-idx={idx}
          class={cn(
            "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors",
            idx === selectedIndex ? "bg-primary/15 text-primary" : "hover:bg-secondary/50",
          )}
          onclick={() => onSelect(item)}
          onmouseenter={() => onHover(idx)}
          role="option"
          aria-selected={idx === selectedIndex}
        >
          <div class={cn(
            "flex items-center justify-center size-7 rounded-md shrink-0",
            idx === selectedIndex ? "bg-primary/15 text-primary" : "bg-secondary/40 text-muted-foreground",
          )}>
            <Icon class="size-3.5" />
          </div>
          <div class="flex flex-col flex-1 min-w-0">
            <span class="text-[12.5px] font-semibold leading-tight truncate">
              {item.name}
            </span>
            {#if item.parentContext}
              <span class="text-[10.5px] text-muted-foreground/80 leading-tight truncate">
                {item.parentContext}
              </span>
            {/if}
          </div>
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-secondary/40 text-muted-foreground/70">
            {item.typeBadge}
          </span>
        </button>
      {/each}
    {/each}
  {/if}
</div>
