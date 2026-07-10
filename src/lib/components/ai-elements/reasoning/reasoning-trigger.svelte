<script lang="ts">
	import { cn } from "$lib/utils/shadcn";
	import { CollapsibleTrigger } from "$lib/components/ui/collapsible/index.js";
	import { getReasoningContext } from "./reasoning-context.svelte.js";
	import BrainIcon from "@lucide/svelte/icons/brain";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import Shimmer from "$lib/components/ai-elements/shimmer/Shimmer.svelte";

	interface Props {
		class?: string;
		children?: import("svelte").Snippet;
	}

	let { class: className = "", children, ...props }: Props = $props();

	let reasoningContext = getReasoningContext();

	let isStreaming = $derived(reasoningContext.isStreaming);
	let duration = $derived(reasoningContext.duration);
	let isOpen = $derived(reasoningContext.isOpen);

	let getThinkingMessage = $derived.by(() => {
		if (isStreaming || duration === 0) {
			return "Thinking...";
		}
		if (duration === undefined) {
			return "Thought for a few seconds";
		}
		return `Thought for ${duration} seconds`;
	});
</script>

<CollapsibleTrigger
	class={cn(
		"text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-sm transition-colors",
		className
	)}
	{...props}
>
	{#if children}
		{@render children()}
	{:else}
		<BrainIcon
			class={cn(
				"size-4 shrink-0 transition-colors",
				isStreaming && "text-primary",
			)}
		/>
		{#if isStreaming}
			<Shimmer duration={1.6} spread={1.5} content_length={getThinkingMessage.length}>
				{#snippet children()}{getThinkingMessage}{/snippet}
			</Shimmer>
		{:else}
			<p class="leading-none">{getThinkingMessage}</p>
		{/if}
		<ChevronRightIcon
			class={cn(
				"size-4 ml-auto shrink-0 transition-transform duration-200",
				isOpen ? "rotate-90" : "rotate-0",
			)}
		/>
	{/if}
</CollapsibleTrigger>
