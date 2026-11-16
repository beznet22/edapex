<script lang="ts">
	import { goto } from "$app/navigation";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import {
		categorizeAIError,
		describe,
		type FriendlyAction,
		type FriendlyAiError
	} from "$lib/errors/friendly-ai-error";

	type Props = {
		error: unknown;
		onRegenerate?: () => void;
		onClearContext?: () => void;
	};

	let { error, onRegenerate, onClearContext }: Props = $props();

	const categorized = $derived.by<FriendlyAiError>(() => categorizeAIError(error));
	const presentation = $derived.by(() => describe(categorized));

	function onAction(action: FriendlyAction): void {
		switch (action) {
			case 'regenerate':
				onRegenerate?.();
				break;
			case 'clear_context':
				onClearContext?.();
				break;
			case 'open_settings':
				void goto('/settings/providers');
				break;
			case 'edit_marksheet_then_retry':
				// Open the workspace panel focused on the marksheet.
				void goto('/workspace');
				break;
			case 'mention_student':
			case 'rephrase_request': {
				// Focus the chat composer input. Safe fallback: no-op if the
				// selector doesn't match (e.g. composer not mounted yet).
				const input = document.querySelector(
					'textarea[data-composer], [contenteditable="true"]'
				) as HTMLElement | null;
				input?.focus();
				break;
			}
			case 'rerun_format':
				// No-op for now — format pending is a future chunk.
				break;
			case 'contact_support':
			case 'none':
			default:
				break;
		}
	}
	$effect(()=>{
		console.log(presentation.message, error)
	})
</script>

<Alert.Root
	variant="destructive"
	class="bg-destructive/10 border-dashed border-destructive/50 text-destructive my-2"
>
	<TriangleAlertIcon class="size-4" />
	<Alert.Title>{presentation.title}</Alert.Title>
	<Alert.Description>{presentation.message}</Alert.Description>
	<div class="mt-2 flex gap-2">
		{#if presentation.action === 'regenerate'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Retry
			</Button>
		{:else if presentation.action === 'clear_context'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Start fresh
			</Button>
		{:else if presentation.action === 'open_settings'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Open Settings
			</Button>
		{:else if presentation.action === 'edit_marksheet_then_retry'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Edit marksheet
			</Button>
		{:else if presentation.action === 'mention_student'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Mention a student
			</Button>
		{:else if presentation.action === 'rerun_format'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Run /format
			</Button>
		{:else if presentation.action === 'rephrase_request'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Rephrase
			</Button>
		{/if}
	</div>
</Alert.Root>
