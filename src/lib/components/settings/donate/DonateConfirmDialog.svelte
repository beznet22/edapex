<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { toast } from 'svelte-sonner';

	interface Props {
		open: boolean;
		providerId: string;
		providerName: string;
		tosVersion: string | null;
		donorRoles: string[];
		userRole: string | null;
		onConfirm: () => Promise<{ success: boolean; message?: string }>;
		onClose: () => void;
	}

	let {
		open = $bindable(false),
		providerId,
		providerName,
		tosVersion,
		donorRoles,
		userRole,
		onConfirm,
		onClose
	}: Props = $props();

	let isSubmitting = $state(false);
	let typedAcceptance = $state('');
	let error = $state<string | null>(null);

	const acceptanceRequired = tosVersion !== null && tosVersion.length > 0;
	const expectedPhrase = 'I accept';
	const acceptanceValid = $derived(
		!acceptanceRequired ||
			typedAcceptance.trim().toLowerCase() === expectedPhrase.toLowerCase()
	);

	async function handleConfirm() {
		if (acceptanceRequired && !acceptanceValid) {
			error = `Type "${expectedPhrase}" to confirm.`;
			return;
		}
		isSubmitting = true;
		error = null;
		try {
			const result = await onConfirm();
			if (result.success) {
				toast.success(`Donated ${providerName} to the school pool`);
				open = false;
				typedAcceptance = '';
				onClose();
			} else {
				error = result.message ?? 'Donation failed';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Donation failed';
		} finally {
			isSubmitting = false;
		}
	}

	function handleOpenChange(v: boolean) {
		open = v;
		if (!v) {
			typedAcceptance = '';
			error = null;
			onClose();
		}
	}

	const roleMatch = $derived(
		userRole !== null && (donorRoles.length === 0 || donorRoles.includes(userRole))
	);
</script>

<Dialog.Root bind:open={() => open, (v) => handleOpenChange(v)}>
	<Dialog.Content class="sm:max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<GiftIcon class="size-4" />
				Donate {providerName} to the school pool
			</Dialog.Title>
			<Dialog.Description>
				Your provider key will be encrypted and shared with the school. Other members of
				{#if donorRoles.length > 0}
					role <code class="rounded bg-muted px-1 py-0.5 text-xs"
						>{#if roleMatch}your role{:else}a permitted role{/if}</code
					>
				{:else}
					the school
				{/if} will draw from the pool when they don't have their own key.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 py-2">
			<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
				<div class="flex items-start gap-2">
					<ShieldCheckIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
					<div class="flex flex-col gap-1">
						<span class="font-medium">What this means</span>
						<ul class="ml-4 list-disc text-xs text-muted-foreground">
							<li>Pool members can use your key to make requests under your quota.</li>
							<li>You can revoke the donation at any time from Settings → Providers.</li>
							<li>Your key remains encrypted; admins never see the plaintext.</li>
						</ul>
					</div>
				</div>
			</div>

			{#if acceptanceRequired}
				<div class="flex flex-col gap-2">
					<Label for="tos-acceptance">
						Terms of Service version <code class="rounded bg-muted px-1 py-0.5 text-xs"
							>{tosVersion}</code
						>
					</Label>
					<p class="text-xs text-muted-foreground">
						Type <span class="font-mono">{expectedPhrase}</span> below to confirm you accept
						the school's contribution terms for this version.
					</p>
					<Input
						id="tos-acceptance"
						bind:value={typedAcceptance}
						placeholder={expectedPhrase}
						autocomplete="off"
						disabled={isSubmitting}
					/>
				</div>
			{/if}

			{#if error}
				<p class="text-xs font-medium text-destructive" role="alert">{error}</p>
			{/if}
		</div>

		<Dialog.Footer class="gap-2">
			<Button
				variant="ghost"
				onclick={() => handleOpenChange(false)}
				disabled={isSubmitting}>Cancel</Button
			>
			<Button
				onclick={handleConfirm}
				disabled={isSubmitting || (acceptanceRequired && !acceptanceValid)}
			>
				{#if isSubmitting}
					Donating…
				{:else}
					Donate to pool
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
