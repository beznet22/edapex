<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import Heading1Icon from "@lucide/svelte/icons/heading-1";
  import Heading2Icon from "@lucide/svelte/icons/heading-2";
  import Heading3Icon from "@lucide/svelte/icons/heading-3";
  import ListIcon from "@lucide/svelte/icons/list";
  import ListChecksIcon from "@lucide/svelte/icons/list-checks";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import QuoteIcon from "@lucide/svelte/icons/quote";
  import CodeIcon from "@lucide/svelte/icons/code";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import TextIcon from "@lucide/svelte/icons/text";
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
    'list-checks': ListChecksIcon,
    'list-ordered': ListOrderedIcon,
    'quote': QuoteIcon,
    'code': CodeIcon,
    'minus': MinusIcon,
    'sparkles': SparklesIcon,
    'text': TextIcon,
  };

  function getIcon(name: string): Component<{ class?: string }> {
    return iconMap[name] ?? MinusIcon;
  }

  const isAi = (item: SlashMenuItem) => item.icon === 'sparkles';
</script>

<div class="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl w-72 overflow-hidden">
  <div class="py-1.5 max-h-80 overflow-y-auto">
    {#each items as item, i}
      {@const Icon = getIcon(item.icon)}
      {#if isAi(item) && i > 0}
        <div class="border-t border-border/30 mt-1 pt-1"></div>
      {/if}
      <button
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 group",
          i === selectedIndex ? "bg-secondary/70" : "hover:bg-secondary/50",
          isAi(item) ? "hover:bg-primary/5" : ""
        )}
        onclick={() => onSelect?.(item)}
      >
        <div class={cn(
          "flex items-center justify-center size-8 rounded-lg transition-colors shrink-0",
          isAi(item)
            ? "bg-primary/10 text-primary"
            : "bg-secondary/50 text-muted-foreground group-hover:text-foreground"
        )}>
          <Icon class="size-4" />
        </div>
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class={cn(
            "text-[13px] font-semibold leading-tight",
            isAi(item) ? "text-primary" : "text-foreground/90"
          )}>{item.label}</span>
          <span class="text-[11px] text-muted-foreground/80 leading-tight truncate">{item.description}</span>
        </div>
      </button>
    {/each}

    {#if items.length === 0}
      <div class="px-3 py-6 text-center text-[12px] text-muted-foreground">
        No matching commands
      </div>
    {/if}
  </div>
</div>
