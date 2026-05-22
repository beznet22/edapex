<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import Heading1Icon from "@lucide/svelte/icons/heading-1";
  import Heading2Icon from "@lucide/svelte/icons/heading-2";
  import Heading3Icon from "@lucide/svelte/icons/heading-3";
  import ListIcon from "@lucide/svelte/icons/list";
  import ListOrderedIcon from "@lucide/svelte/icons/list-ordered";
  import QuoteIcon from "@lucide/svelte/icons/quote";
  import CodeIcon from "@lucide/svelte/icons/code";
  import ImageIcon from "@lucide/svelte/icons/image";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { Editor } from "@tiptap/core";

  let {
    editor,
    onAiGenerate,
    onClose,
  }: {
    editor: Editor;
    onAiGenerate?: () => void;
    onClose?: () => void;
  } = $props();

  let filterQuery = $state("");

  const items = $derived([
    { icon: Heading1Icon, label: "Heading 1", description: "Large heading", action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { icon: Heading2Icon, label: "Heading 2", description: "Medium heading", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: Heading3Icon, label: "Heading 3", description: "Small heading", action: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: ListIcon, label: "Bullet List", description: "Unordered list", action: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrderedIcon, label: "Ordered List", description: "Numbered list", action: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: QuoteIcon, label: "Blockquote", description: "Quote block", action: () => editor.chain().focus().toggleBlockquote().run() },
    { icon: CodeIcon, label: "Code Block", description: "Syntax highlighted", action: () => editor.chain().focus().toggleCodeBlock().run() },
    { icon: MinusIcon, label: "Divider", description: "Horizontal rule", action: () => editor.chain().focus().setHorizontalRule().run() },
  ]);

  const filteredItems = $derived(
    filterQuery
      ? items.filter(i => i.label.toLowerCase().includes(filterQuery.toLowerCase()))
      : items
  );

  function handleSelect(action: () => void) {
    action();
    onClose?.();
  }
</script>

<div class="hermes-glass rounded-xl shadow-2xl w-56 overflow-hidden transition-spring">
  <!-- Filter input -->
  <div class="p-2 border-b border-border/30">
    <input
      type="text"
      placeholder="Filter..."
      bind:value={filterQuery}
      class="w-full bg-secondary/30 border border-border/30 rounded-lg px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring/30"
    />
  </div>

  <!-- Command items -->
  <div class="py-1 max-h-64 overflow-y-auto">
    {#each filteredItems as item}
      <button
        class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/50 transition-colors duration-100 group"
        onclick={() => handleSelect(item.action)}
      >
        <div class="flex items-center justify-center size-7 rounded-lg bg-secondary/50 text-muted-foreground group-hover:text-foreground transition-colors">
          <item.icon class="size-3.5" />
        </div>
        <div class="flex flex-col">
          <span class="text-[11px] font-semibold text-foreground/90">{item.label}</span>
          <span class="text-[9px] text-muted-foreground">{item.description}</span>
        </div>
      </button>
    {/each}

    {#if onAiGenerate}
      <div class="border-t border-border/30 mt-1 pt-1">
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-primary/5 transition-colors duration-100 group"
          onclick={() => { onAiGenerate(); onClose?.(); }}
        >
          <div class="flex items-center justify-center size-7 rounded-lg bg-primary/10 text-primary group-hover:gold-glow transition-all">
            <SparklesIcon class="size-3.5" />
          </div>
          <div class="flex flex-col">
            <span class="text-[11px] font-semibold text-primary">Generate with AI</span>
            <span class="text-[9px] text-muted-foreground">Write with AI assistance</span>
          </div>
        </button>
      </div>
    {/if}
  </div>
</div>
