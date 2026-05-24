<script lang="ts">
  import { cn } from "$lib/utils/shadcn";

  let {
    mode = $bindable<"wysiwyg" | "raw">("wysiwyg"),
  }: {
    mode: "wysiwyg" | "raw";
  } = $props();
</script>

<div class="flex items-center gap-0.5 bg-slate-950/80 backdrop-blur-xl rounded-full p-1 border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
  <button
    class={cn(
      "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
      mode === "wysiwyg"
        ? "bg-primary/20 text-primary shadow-sm"
        : "text-white/40 hover:text-white/70"
    )}
    onclick={() => mode = "wysiwyg"}
  >
    Editor
  </button>
  <button
    class={cn(
      "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
      mode === "raw"
        ? "bg-primary/20 text-primary shadow-sm"
        : "text-white/40 hover:text-white/70"
    )}
    onclick={() => mode = "raw"}
  >
    Raw
  </button>
</div>
