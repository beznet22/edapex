<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import Heading1Icon from "@lucide/svelte/icons/heading-1";
  import Heading2Icon from "@lucide/svelte/icons/heading-2";
  import Heading3Icon from "@lucide/svelte/icons/heading-3";
  import ListIcon from "@lucide/svelte/icons/list";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import QuoteIcon from "@lucide/svelte/icons/quote";
  import CodeIcon from "@lucide/svelte/icons/code";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { Component } from "svelte";

  interface SlashMenuItem {
    label: string;
    description: string;
    icon: string;
    command: (props: any) => void;
  }

  let {
    items = [],
    selectedIndex = 0,
    onSelect,
  }: {
    items: SlashMenuItem[];
    selectedIndex?: number;
    onSelect?: (item: SlashMenuItem) => void;
  } = $props();

  const iconMap: Record<string, Component<{ class?: string }>> = {
    'heading-1': Heading1Icon,
    'heading-2': Heading2Icon,
    'heading-3': Heading3Icon,
    'list': ListIcon,
    'list-ordered': ListOrderedIcon,
    'quote': QuoteIcon,
    'code': CodeIcon,
    'minus': MinusIcon,
    'sparkles': SparklesIcon,
  };

  function getIcon(name: string): Component<{ class?: string }> {
    return iconMap[name] ?? MinusIcon;
  }

  const isAi = (item: SlashMenuItem) => item.icon === 'sparkles';
</script>

<div class="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl w-56 overflow-hidden">
  <div class="py-1 max-h-64 overflow-y-auto">
    {#each items as item, i}
      {@const Icon = getIcon(item.icon)}
      {#if isAi(item) && i > 0}
        <div class="border-t border-border/30 mt-1 pt-1"></div>
      {/if}
      <button
        class={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 group",
          i === selectedIndex ? "bg-secondary/70" : "hover:bg-secondary/50",
          isAi(item) ? "hover:bg-primary/5" : ""
        )}
        onclick={() => onSelect?.(item)}
      >
        <div class={cn(
          "flex items-center justify-center size-7 rounded-lg transition-colors",
          isAi(item)
            ? "bg-primary/10 text-primary"
            : "bg-secondary/50 text-muted-foreground group-hover:text-foreground"
        )}>
          <Icon class="size-3.5" />
        </div>
        <div class="flex flex-col">
          <span class={cn(
            "text-[11px] font-semibold",
            isAi(item) ? "text-primary" : "text-foreground/90"
          )}>{item.label}</span>
          <span class="text-[9px] text-muted-foreground">{item.description}</span>
        </div>
      </button>
    {/each}

    {#if items.length === 0}
      <div class="px-3 py-4 text-center text-[11px] text-muted-foreground">
        No matching commands
      </div>
    {/if}
  </div>
</div>
