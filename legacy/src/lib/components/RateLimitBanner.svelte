<script lang="ts">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { RateLimitState } from "$lib/context/chat-context.svelte";

	const rateLimit = RateLimitState.fromContext();

	let remaining = $state(0);

	$effect(() => {
		const active = rateLimit.active;
		if (!active) {
			remaining = 0;
			return;
		}
		const resetMs = new Date(active.resetAt).getTime();
		if (Number.isNaN(resetMs)) {
			remaining = 0;
			return;
		}
		const tick = (): void => {
			const ms = resetMs - Date.now();
			remaining = Math.max(0, Math.ceil(ms / 1000));
		};
		tick();
		const interval = setInterval(tick, 250);
		return () => clearInterval(interval);
	});

	const formatted = $derived.by(() => {
		if (remaining <= 0) return "0s";
		if (remaining < 60) return `${remaining}s`;
		const m = Math.floor(remaining / 60);
		const s = remaining % 60;
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	});
</script>

{#if rateLimit.active}
	<div
		class="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-300 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200"
	>
		<TriangleAlertIcon class="size-3.5 shrink-0" />
		<span>
			Rate limit on <strong class="font-bold">{rateLimit.active.providerId}</strong>.
			Auto-retrying in <strong class="font-bold tabular-nums">{formatted}</strong>…
		</span>
	</div>
{/if}
