<script lang="ts">
	import { cn } from "$lib/utils/shadcn";
	import { CollapsibleContent } from "$lib/components/ui/collapsible/index.js";
	import { Response } from "$lib/components/ai-elements/response";
	import type { Snippet } from "svelte";

	interface Props {
		class?: string;
		content?: string;
		children?: Snippet;
	}

	let { class: className = "", content = "", children, ...props }: Props = $props();
</script>

<CollapsibleContent
	class={cn(
		"overflow-hidden text-sm text-muted-foreground outline-none",
		"transition-[height,opacity] duration-200 ease-out will-change-[height,opacity]",
		"data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
		"data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
		className
	)}
	{...props}
>
	<div class="pt-4">
		{#if children}
			{@render children()}
		{:else}
			<Response class="grid gap-2" {content} />
		{/if}
	</div>
</CollapsibleContent>
