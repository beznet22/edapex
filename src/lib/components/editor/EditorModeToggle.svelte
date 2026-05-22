<script lang="ts">
  import { cn } from "$lib/utils/shadcn";

  let {
    mode = $bindable<"wysiwyg" | "raw">("wysiwyg"),
  }: {
    mode: "wysiwyg" | "raw";
  } = $props();
</script>

<div class="flex items-center gap-0.5 bg-secondary/50 rounded-lg p-0.5 border border-border/30">
  <button
    class={cn(
      "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
      mode === "wysiwyg"
        ? "bg-primary/15 text-primary border border-primary/20 shadow-sm"
        : "text-muted-foreground hover:text-foreground/70"
    )}
    onclick={() => mode = "wysiwyg"}
  >
    Editor
  </button>
  <button
    class={cn(
      "px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
      mode === "raw"
        ? "bg-primary/15 text-primary border border-primary/20 shadow-sm"
        : "text-muted-foreground hover:text-foreground/70"
    )}
    onclick={() => mode = "raw"}
  >
    Raw
  </button>
</div>
