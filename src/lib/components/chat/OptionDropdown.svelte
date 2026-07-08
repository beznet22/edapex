<script lang="ts">
	import ResponsiveSheet from '$lib/components/shared/responsive-sheet.svelte';
	import { Button } from '$lib/components/ui/button';
	import SendIcon from '@lucide/svelte/icons/send';
	import XIcon from '@lucide/svelte/icons/x';
	import HelpCircleIcon from '@lucide/svelte/icons/help-circle';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import type { PendingGateOption } from '$lib/context/chat-context.svelte';

	let {
		open = $bindable(false),
		question,
		options,
		allowFreeText = true,
		onSelect,
		onCancel
	}: {
		open: boolean;
		question: string;
		options: PendingGateOption[];
		allowFreeText?: boolean;
		onSelect: (selection: { selectedOptionId: string; freeTextAnswer?: string }) => void;
		onCancel?: () => void;
	} = $props();

	let freeTextValue = $state('');
	let showFreeText = $state(false);

	function handleOptionClick(option: PendingGateOption): void {
		// Do not set `open = false` here — the parent unmounts the
		// component via `pendingGate = null` in `resumePendingGate()`,
		// which is the canonical close path. Setting `open = false` here
		// would race with unmount and spuriously fire `onCancel` via
		// ResponsiveSheet's `onOpenChange`.
		onSelect({ selectedOptionId: option.id });
	}

	function handleFreeTextSubmit(): void {
		const trimmed = freeTextValue.trim();
		if (trimmed.length === 0) return;
		// Same rationale as `handleOptionClick` — the parent unmounts.
		onSelect({
			selectedOptionId: `free_text_${Date.now()}`,
			freeTextAnswer: trimmed
		});
		freeTextValue = '';
		showFreeText = false;
	}

	function handleCancel(): void {
		showFreeText = false;
		freeTextValue = '';
		onCancel?.();
	}

	function handleOpenChange(newOpen: boolean): void {
		open = newOpen;
		if (!newOpen) handleCancel();
	}

	function handleClose(): void {
		open = false;
	}
</script>

{#snippet optionHeader()}
	<div class="flex items-start gap-3 w-full pr-2">
		<div
			class="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"
		>
			<ShieldCheckIcon class="size-5 text-primary" />
		</div>
		<div class="flex flex-col min-w-0 flex-1">
			<span class="text-[10px] font-black text-primary tracking-[0.2em] uppercase mb-0.5">
				Selection Required
			</span>
			<p class="text-sm text-foreground/90 leading-relaxed">
				{question}
			</p>
		</div>
	</div>
{/snippet}

{#snippet optionExtra()}
	<Button
		variant="ghost"
		size="icon"
		class="h-12 w-12 min-h-12 min-w-12 rounded-2xl shrink-0"
		onclick={handleClose}
		aria-label="Close"
	>
		<XIcon class="h-5 w-5" />
	</Button>
{/snippet}

<ResponsiveSheet
	bind:open
	onOpenChange={handleOpenChange}
	header={optionHeader}
	extra={optionExtra}
>
	<div class="flex flex-col gap-0.5">
		{#if !showFreeText}
			{#each options as option (option.id)}
				<button
					type="button"
					class="group flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-sidebar-accent/50 active:scale-[0.98] text-left transition-colors cursor-pointer min-h-12 md:min-h-10"
					onclick={() => handleOptionClick(option)}
				>
					<div
						class="size-8 flex items-center justify-center rounded-md border border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors shrink-0"
					>
						{#if option.icon}
							<span class="text-base leading-none">{option.icon}</span>
						{:else}
							<HelpCircleIcon
								class="size-4 text-muted-foreground group-hover:text-primary transition-colors"
							/>
						{/if}
					</div>
					<div class="flex flex-col min-w-0 flex-1">
						<span
							class="text-sm font-medium text-foreground group-hover:text-primary transition-colors"
						>
							{option.label}
						</span>
					</div>
				</button>
			{/each}

			{#if allowFreeText}
				<button
					type="button"
					class="group flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-sidebar-accent/50 active:scale-[0.98] text-left transition-colors cursor-pointer min-h-12 md:min-h-10 italic mt-1"
					onclick={() => {
						showFreeText = true;
					}}
				>
					<div
						class="size-8 flex items-center justify-center rounded-md border border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors shrink-0"
					>
						<SendIcon
							class="size-4 text-muted-foreground group-hover:text-primary transition-colors"
						/>
					</div>
					<div class="flex flex-col min-w-0 flex-1">
						<span
							class="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors"
						>
							Type your own answer
						</span>
					</div>
				</button>
			{/if}
		{:else}
			<form
				class="flex flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					handleFreeTextSubmit();
				}}
			>
				<label
					class="text-xs text-muted-foreground font-medium"
					for="option-dropdown-freetext"
				>
					Your answer
				</label>
				<input
					id="option-dropdown-freetext"
					type="text"
					bind:value={freeTextValue}
					class="w-full min-h-12 md:min-h-10 px-3 text-sm rounded-lg border border-border/20 bg-background/60 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
					placeholder="Type your answer..."
					autocomplete="off"
				/>
				<div class="flex items-center gap-2 justify-end">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="min-h-12 md:min-h-8 min-w-12"
						onclick={() => {
							showFreeText = false;
							freeTextValue = '';
						}}
					>
						<XIcon class="size-4" />
						Cancel
					</Button>
					<Button
						type="submit"
						size="sm"
						class="min-h-12 md:min-h-8 min-w-12"
						disabled={freeTextValue.trim().length === 0}
					>
						<SendIcon class="size-4" />
						Send
					</Button>
				</div>
			</form>
		{/if}
	</div>
</ResponsiveSheet>
