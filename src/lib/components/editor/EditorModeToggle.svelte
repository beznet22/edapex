<script lang="ts">
	import { cn } from "$lib/utils/shadcn";

	let {
		mode = $bindable<"wysiwyg" | "raw">("wysiwyg"),
	}: {
		mode: "wysiwyg" | "raw";
	} = $props();
</script>

<div
	class="flex items-center gap-0.5 bg-popover/95 backdrop-blur-xl rounded-full p-1 border border-border/60 shadow-2xl"
>
	<button
		class={cn(
			"px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
			mode === "wysiwyg"
				? "bg-primary/15 text-primary shadow-sm"
				: "text-muted-foreground hover:text-foreground",
		)}
		onclick={() => (mode = "wysiwyg")}
	>
		Editor
	</button>
	<button
		class={cn(
			"px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-200",
			mode === "raw"
				? "bg-primary/15 text-primary shadow-sm"
				: "text-muted-foreground hover:text-foreground",
		)}
		onclick={() => (mode = "raw")}
	>
		Raw
	</button>
</div>
