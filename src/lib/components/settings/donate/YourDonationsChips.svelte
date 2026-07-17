<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Popover from '$lib/components/ui/popover';
	import { Spinner } from '$lib/components/ui/spinner';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { revokeMyDonation } from '$lib/api/agent.remote.js';

	export type MyDonation = {
		id: string;
		providerId: string;
		donatedAt: string;
		isActive: boolean;
		tosVersion: string | null;
	};

	interface Props {
		/** Map of providerId → human-readable name (e.g. "Groq"). */
		providerNames: Record<string, string>;
		/** The user's active donations. Empty array = render nothing. */
		donations: MyDonation[];
		/** While the parent is fetching the first batch, render a skeleton. */
		loading: boolean;
		/** Whether the parent has finished its first load. Drives the
		 *  "loading shimmer" state — only shown before the first successful
		 *  fetch, never on subsequent refreshes. */
		hasLoadedOnce: boolean;
		/** Disable the chips (e.g. while a revoke is in flight for that id). */
		revokingId: string | null;
		/** Called when the user confirms a revoke. The parent is responsible
		 *  for calling the command and updating the `donations` list. */
		onRevoke: (donation: MyDonation) => void;
	}

	let {
		providerNames,
		donations,
		loading,
		hasLoadedOnce,
		revokingId,
		onRevoke
	}: Props = $props();

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString();
		} catch {
			return iso.slice(0, 10);
		}
	}
</script>

{#if loading && !hasLoadedOnce}
	<div class="flex items-center gap-2 text-xs text-muted-foreground/60 py-2">
		<Spinner class="size-3" />
		Loading your donations…
	</div>
{:else if donations.length > 0}
	<section class="space-y-3" data-testid="your-donations">
		<div class="flex items-center gap-2">
			<GiftIcon class="size-3.5 text-amber-500" />
			<h3
				class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>
				Your donations
			</h3>
			<span class="text-[10px] font-bold text-muted-foreground/40"
				>{donations.length} active</span
			>
		</div>
		<div class="flex flex-wrap gap-2">
			{#each donations as d (d.id)}
				{@const name = providerNames[d.providerId] ?? d.providerId}
				<Badge
					class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300"
				>
					<GiftIcon class="size-3" />
					<span>{name}</span>
					<span class="text-amber-600/70 dark:text-amber-400/60 font-normal">
						· {formatDate(d.donatedAt)}
					</span>
					<Popover.Root>
						<Popover.Trigger
							class="ml-1 -mr-1 inline-flex size-4 items-center justify-center rounded-full text-amber-700/60 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-300/60 dark:hover:text-amber-300 transition-colors"
							aria-label="Revoke donation"
							disabled={revokingId === d.id}
						>
							{#if revokingId === d.id}
								<Spinner class="size-2.5" />
							{:else}
								<Trash2Icon class="size-2.5" />
							{/if}
						</Popover.Trigger>
						<Popover.Content class="w-56 p-3" align="end">
							<div class="flex flex-col gap-2">
								<p class="text-xs font-medium">Revoke this donation?</p>
								<p class="text-[11px] text-muted-foreground">
									Your {name} key will be removed from the school pool. The pool
									will no longer use it for other members' requests.
								</p>
								<div class="flex justify-end gap-1.5">
									<Popover.Close
										class="text-[11px] font-medium text-muted-foreground px-2 py-1 rounded hover:bg-muted"
										disabled={revokingId === d.id}>Cancel</Popover.Close
									>
									<button
										class="text-[11px] font-medium text-destructive px-2 py-1 rounded bg-destructive/10 hover:bg-destructive/20"
										disabled={revokingId === d.id}
										onclick={() => onRevoke(d)}
									>
										Revoke
									</button>
								</div>
							</div>
						</Popover.Content>
					</Popover.Root>
				</Badge>
			{/each}
		</div>
	</section>
{/if}
