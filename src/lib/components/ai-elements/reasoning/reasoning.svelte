<script lang="ts">
	import { cn } from "$lib/utils/shadcn";
	import { Collapsible } from "$lib/components/ui/collapsible/index.js";
	import { ReasoningContext, setReasoningContext } from "./reasoning-context.svelte";
	import { untrack } from "svelte";

	// indexing

	interface Props {
		class?: string;
		isStreaming?: boolean;
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		duration?: number;
		children?: import("svelte").Snippet;
	}

	let {
		class: className = "",
		isStreaming = false,
		open = $bindable(),
		defaultOpen = false,
		onOpenChange,
		duration = $bindable(),
		children,
		...props
	}: Props = $props();

	let MS_IN_S = 1000;

	// Create the reasoning context
	let reasoningContext = new ReasoningContext({
		isStreaming: untrack(() => isStreaming),
		isOpen: open ?? untrack(() => defaultOpen),
		duration: duration ?? 0,
	});

	// Set up controllable state for open
	let isOpen = $state(open ?? untrack(() => defaultOpen));
	let currentDuration = $state(duration ?? 0);

	// Sync external props to context and local state
	$effect(() => {
		reasoningContext.isStreaming = isStreaming;
	});

	$effect(() => {
		if (open !== undefined) {
			isOpen = open;
			reasoningContext.isOpen = open;
		}
	});

	$effect(() => {
		if (duration !== undefined) {
			currentDuration = duration;
			reasoningContext.duration = duration;
		}
	});

	// Sync the final duration back to the optional bindable prop when streaming stops.
	$effect(() => {
		if (!isStreaming && duration !== undefined) {
			duration = currentDuration;
		}
	});

	// Panel only opens when the user clicks the trigger; no auto-open/close.
	let handleOpenChange = (newOpen: boolean) => {
		isOpen = newOpen;
		reasoningContext.setIsOpen(newOpen);

		if (open !== undefined) {
			open = newOpen;
		}

		onOpenChange?.(newOpen);
	};

	// Set the context for child components
	setReasoningContext(reasoningContext);
</script>

<Collapsible
	class={cn("not-prose", className)}
	bind:open={isOpen}
	onOpenChange={handleOpenChange}
	{...props}
>
	{@render children?.()}
</Collapsible>
