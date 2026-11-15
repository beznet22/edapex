<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import { PotluckAlwaysDonate } from '$lib/context/sync.svelte';

	interface Props {
		/** When false, the entire toggle is hidden. The user's role is
		 *  not in `donorRoles` (or pool is disabled), so the global
		 *  preference is meaningless. */
		canDonate: boolean;
	}

	let { canDonate }: Props = $props();

	// Read the cookie-backed context. Falls back to a fresh instance with
	// empty value when the layout hasn't mounted (e.g. SSR-only render).
	const holder = $derived(PotluckAlwaysDonate.fromContext());
	const isOn = $derived(holder?.value === 'on');

	function onCheckedChange(v: boolean): void {
		if (!holder) return;
		// Assigning `value` triggers `syncCookie` (sets the 365-day cookie)
		// AND updates the local state in one step. Other code reading the
		// same context (e.g. `settings/index.svelte:startConnect`) sees the
		// change immediately.
		holder.value = v ? 'on' : 'off';
	}
</script>

{#if canDonate && holder}
	<label
		class="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 cursor-pointer"
	>
		<Checkbox
			checked={isOn}
			onCheckedChange={(v: boolean) => onCheckedChange(v)}
		/>
		<div class="flex flex-col gap-0.5 text-xs">
			<span class="flex items-center gap-1.5 font-bold">
				<GiftIcon class="size-3.5 text-amber-500" />
				Always donate to the school pool
			</span>
			<span class="text-muted-foreground">
				When you connect a new provider, your key is auto-donated to
				the school pool. You can always revoke a donation later.
			</span>
		</div>
	</label>
{/if}
