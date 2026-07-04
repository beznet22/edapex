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
		{/if}
	</div>
</Alert.Root>
