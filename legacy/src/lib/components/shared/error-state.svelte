<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button";

	/**
	 * ErrorState — reusable error UI used across the editor for AI command
	 * errors, mention search failures, and file-fetch failures.
	 *
	 * Per design section 4 (Error Handling), the editor surfaces errors in
	 * three modes:
	 *   - 'fatal'    — show title + message + dismiss only; no retry
	 *   - 'retryable' — title + message + Retry + Discard
	 *   - 'silent'   — toast.error() only (caller decides UX)
	 *
	 * Mirrors the existing LoadingState component in editor-canvas for visual
	 * consistency.
	 */
	let {
		title = "Something went wrong",
		message = "",
		variant = "retryable",
		onRetry,
		onDismiss,
	}: {
		title?: string;
		message?: string;
		variant?: "fatal" | "retryable" | "silent";
		onRetry?: () => void;
		onDismiss?: () => void;
	} = $props();
</script>

<div
	class="flex h-full w-full flex-col items-center justify-center gap-3 px-6 py-8 text-center"
	role="alert"
	aria-live="polite"
	data-slot="error-state"
	data-variant={variant}
>
	<AlertCircleIcon class="size-10 text-destructive/70" />
	<div class="space-y-1">
		<p class="text-sm font-semibold text-foreground">{title}</p>
		{#if message}
			<p class="text-xs text-muted-foreground max-w-md">{message}</p>
		{/if}
	</div>

	{#if variant === "retryable"}
		<div class="flex items-center gap-2">
			{#if onRetry}
				<Button size="sm" variant="outline" onclick={onRetry}>
					<RefreshCwIcon class="mr-1 size-3.5" />
					Retry
				</Button>
			{/if}
			{#if onDismiss}
				<Button size="sm" variant="ghost" onclick={onDismiss}>
					<XIcon class="mr-1 size-3.5" />
					Discard
				</Button>
			{/if}
		</div>
	{/if}
</div>
