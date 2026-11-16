<script lang="ts">
	import {
		ShieldAlert,
		LoaderCircle,
		ThumbsUp,
		ThumbsDown
	} from '@lucide/svelte';

	type Props = {
		/** Header text shown on the left next to the shield icon. */
		context?: string;
		/** Optional secondary line below context (e.g. tool name · short summary). */
		subContext?: string;
		/** Identifier passed to callbacks — the toolCallId. */
		toolCallId: string;
		/** Human-readable name of the tool awaiting approval. */
		approvalToolName?: string;
		/** Short summary of the action the tool will take. */
		approvalSummary?: string;
		/** Called when the user approves the pending tool call. */
		onApprove: (toolCallId: string) => void;
		/** Called when the user rejects the pending tool call. */
		onReject: (toolCallId: string) => void;
		/** Disables both buttons while the approval response is in-flight. */
		approving?: boolean;
	};

	let {
		context = 'Approval Required',
		subContext = '',
		toolCallId,
		approvalToolName = '',
		approvalSummary = '',
		onApprove,
		onReject,
		approving = false
	}: Props = $props();

	function handleApprove(e: MouseEvent): void {
		e.stopPropagation();
		onApprove(toolCallId);
	}

	function handleReject(e: MouseEvent): void {
		e.stopPropagation();
		onReject(toolCallId);
	}
</script>

<div
	class="bg-secondary/40 flex flex-row items-center gap-3 rounded-t-4xl px-3.5 py-2 text-sm leading-tight text-card-foreground not-first:min-h-11"
	role="region"
	aria-label="Tool approval required"
	data-mode="approval"
>
	<!-- Left: context (icon + header + sub line) -->
	<div class="flex flex-1 items-center gap-2.5 min-w-0 pl-1">
		<span
			class="inline-flex shrink-0 items-center justify-center size-6 rounded-lg text-destructive"
		>
			<ShieldAlert class="size-3.5" aria-hidden="true" />
		</span>
		<div class="flex min-w-0 flex-col">
			<span class="truncate font-medium text-foreground">{context}</span>
			{#if approvalToolName || approvalSummary || subContext}
				<span class="truncate text-[11px] text-muted-foreground">
					{#if approvalToolName}<span class="font-mono">{approvalToolName}</span>{/if}
					{#if approvalToolName && (approvalSummary || subContext)} · {/if}
					{approvalSummary || subContext}
				</span>
			{/if}
		</div>
	</div>

	<!-- Right: Reject / Approve -->
	<div class="flex shrink-0 items-center gap-1.5" role="group" aria-label="Decisions">
		<button
			type="button"
			class="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:min-w-8"
			onclick={handleReject}
			disabled={approving}
			aria-label="Reject tool call"
			data-testid="action-bar-reject"
		>
			<ThumbsDown class="size-3.5" aria-hidden="true" />
			<span class="hidden sm:inline">Reject</span>
		</button>
		<button
			type="button"
			class="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8 sm:min-w-8"
			onclick={handleApprove}
			disabled={approving}
			aria-label="Approve tool call"
			data-testid="action-bar-approve"
		>
			{#if approving}
				<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
			{:else}
				<ThumbsUp class="size-3.5" aria-hidden="true" />
			{/if}
			<span class="hidden sm:inline">{approving ? 'Approving…' : 'Approve'}</span>
		</button>
	</div>
</div>
