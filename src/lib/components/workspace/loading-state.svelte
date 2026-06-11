<script lang="ts">
	let {
		label = "Loading file content",
	}: {
		label?: string;
	} = $props();
</script>

<div class="flex flex-col items-center justify-center h-full w-full gap-4 min-h-[260px]">
	<div class="relative size-12">
		<div
			class="absolute inset-0 rounded-full border-2 border-border/40"
			aria-hidden="true"
		></div>
		<div
			class="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin"
			aria-hidden="true"
		></div>
	</div>
	<p class="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
		{label}
	</p>
</div>
