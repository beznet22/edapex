<script lang="ts">
	import { cn } from "$lib/utils/shadcn";
	import { Collapsible } from "$lib/components/ui/collapsible/index.js";
	import { ReasoningContext, setReasoningContext } from "./reasoning-context.svelte";
	import { untrack } from "svelte";

	interface Props {
		class?: string;
		isStreaming?: boolean;
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Durable duration from message meta (seconds). Prefer over local when set. */
		duration?: number;
		children?: import("svelte").Snippet;
	}

	let {
		class: className = "",
		isStreaming = false,
		open = $bindable(),
		defaultOpen = false,
		onOpenChange,
		duration,
		children,
		...props
	}: Props = $props();

	const MS_IN_S = 1000;
	const TICK_MS = 250;

	let reasoningContext = new ReasoningContext({
		isStreaming: untrack(() => isStreaming),
		isOpen: open ?? untrack(() => defaultOpen),
		duration: untrack(() => (typeof duration === "number" && duration > 0 ? duration : 0)),
	});

	let isOpen = $state(open ?? untrack(() => defaultOpen));
	/** Client-measured duration for the current/last streaming session (seconds). */
	let localDuration = $state(0);
	let startedAt: number | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	const clearTick = () => {
		if (tickTimer !== null) {
			clearInterval(tickTimer);
			tickTimer = null;
		}
	};

	const effectiveDuration = $derived.by(() => {
		if (typeof duration === "number" && duration > 0) return duration;
		return localDuration;
	});

	$effect(() => {
		reasoningContext.isStreaming = isStreaming;
	});

	$effect(() => {
		reasoningContext.duration = effectiveDuration;
	});

	$effect(() => {
		if (open !== undefined) {
			isOpen = open;
			reasoningContext.isOpen = open;
		}
	});

	// Live duration: start on stream enter, tick while streaming, freeze on exit.
	$effect(() => {
		if (isStreaming) {
			if (startedAt === null) {
				startedAt = Date.now();
				localDuration = 0;
			}
			clearTick();
			tickTimer = setInterval(() => {
				if (startedAt === null) return;
				localDuration = Math.max(0, (Date.now() - startedAt) / MS_IN_S);
			}, TICK_MS);
			return () => clearTick();
		}

		clearTick();
		if (startedAt !== null) {
			localDuration = Math.max(0, (Date.now() - startedAt) / MS_IN_S);
			startedAt = null;
		}
	});

	let handleOpenChange = (newOpen: boolean) => {
		isOpen = newOpen;
		reasoningContext.setIsOpen(newOpen);

		if (open !== undefined) {
			open = newOpen;
		}

		onOpenChange?.(newOpen);
	};

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
