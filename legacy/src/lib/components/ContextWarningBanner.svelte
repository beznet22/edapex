<script lang="ts">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";

	let {
		usedPercent,
		usedTokens,
		maxTokens,
		modelName
	}: {
		usedPercent: number;
		usedTokens: number;
		maxTokens: number;
		modelName: string;
	} = $props();

	const formatNum = (n: number): string =>
		new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
</script>

{#if usedPercent > 0.7}
	<div
		class="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-300"
	>
		<TriangleAlertIcon class="size-3.5 shrink-0" />
		<span>
			This conversation is at
			<strong class="font-bold tabular-nums">{Math.round(usedPercent * 100)}%</strong>
			of <strong class="font-bold">{modelName}</strong>'s context window
			(<strong class="tabular-nums">{formatNum(usedTokens)}</strong>
			/ {formatNum(maxTokens)}). Start a new chat for best results.
		</span>
	</div>
{/if}
