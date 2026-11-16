<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import BoldIcon from "@lucide/svelte/icons/bold";
  import ItalicIcon from "@lucide/svelte/icons/italic";
  import StrikethroughIcon from "@lucide/svelte/icons/strikethrough";
  import UnderlineIcon from "@lucide/svelte/icons/underline";
  import CodeIcon from "@lucide/svelte/icons/code";
  import HighlighterIcon from "@lucide/svelte/icons/highlighter";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { Editor } from "@tiptap/core";

  let {
    editor,
    onAiImprove,
  }: {
    editor: Editor;
    onAiImprove?: () => void;
  } = $props();

  const actions = $derived([
    { icon: BoldIcon, label: "Bold", active: editor.isActive("bold"), toggle: () => editor.chain().focus().toggleBold().run() },
    { icon: ItalicIcon, label: "Italic", active: editor.isActive("italic"), toggle: () => editor.chain().focus().toggleItalic().run() },
    { icon: UnderlineIcon, label: "Underline", active: editor.isActive("underline"), toggle: () => editor.chain().focus().toggleUnderline().run() },
    { icon: StrikethroughIcon, label: "Strikethrough", active: editor.isActive("strike"), toggle: () => editor.chain().focus().toggleStrike().run() },
    { icon: CodeIcon, label: "Code", active: editor.isActive("code"), toggle: () => editor.chain().focus().toggleCode().run() },
    { icon: HighlighterIcon, label: "Highlight", active: editor.isActive("highlight"), toggle: () => editor.chain().focus().toggleHighlight().run() },
  ]);
</script>

<div class="flex items-center gap-0.5 px-1.5 py-1 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl transition-spring">
  {#each actions as action, i}
    <button
      class={cn(
        "p-1.5 rounded-lg transition-all duration-150",
        action.active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      )}
      onclick={action.toggle}
      title={action.label}
    >
      <action.icon class="size-3.5" />
    </button>
    {#if i === 3}
      <div class="w-px h-4 bg-border/50 mx-0.5"></div>
    {/if}
  {/each}

  {#if onAiImprove}
    <div class="w-px h-4 bg-border/50 mx-0.5"></div>
    <button
      class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150 group"
      onclick={onAiImprove}
      title="AI Improve"
    >
      <SparklesIcon class="size-3.5 group-hover:animate-pulse" />
      <span class="text-[9px] font-black uppercase tracking-widest">Improve</span>
    </button>
  {/if}
</div>
