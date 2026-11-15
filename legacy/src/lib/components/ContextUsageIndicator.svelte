<script lang="ts">
	import * as Context from "$lib/components/ai-elements/context";
	import { chatUsage } from "$lib/context/chat-context.svelte";
	import type { LanguageModelUsage } from "$lib/components/ai-elements/context/context-context.svelte.js";

	let {
		modelId,
		maxTokens
	}: {
		modelId: string;
		maxTokens: number;
	} = $props();

	const usage = $derived<LanguageModelUsage>(chatUsage.value);

	const usedTokens = $derived.by(() => {
		return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0);
	});
</script>

<Context.Root
	{modelId}
	{maxTokens}
	{usedTokens}
	usage={{
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		reasoningTokens: usage.reasoningTokens,
		cachedInputTokens: usage.cachedInputTokens
	}}
>
	<Context.Trigger />
	<Context.Content sideOffset={8} class="hermes-glass border-sidebar-border/40">
		<Context.ContentHeader />
		<Context.ContentBody>
			<Context.InputUsage />
			<Context.OutputUsage />
			<Context.ReasoningUsage />
			<Context.CacheUsage />
		</Context.ContentBody>
		<Context.ContentFooter />
	</Context.Content>
</Context.Root>
