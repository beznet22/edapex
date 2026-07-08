<script lang="ts">
	import {
		ShieldCheck,
		LoaderCircle,
		CheckCircle2,
		ChevronDown,
		Ban
	} from '@lucide/svelte';

	/** A sub-action exposed in the split-button dropdown chevron. */
	type DropdownOption = {
		id: string;
		label: string;
	};

	type Props = {
		mode: 'validation';
		/** Header text shown on the left next to the context icon. */
		context?: string;
		/** Optional secondary line below context (e.g. relative path). */
		subContext?: string;
		/** Override the default icon (ShieldCheck) — pass a Lucide component. */
		contextIcon?: typeof ShieldCheck;
		artifactId: string;
		onValidate: (artifactId: string, dropdownId?: string) => void;
		validating?: boolean;
		/** Label for the secondary (Deny-equivalent) action. Omit to hide. */
		secondaryLabel?: string;
		onSecondary?: () => void;
		/** Items exposed via the split-button chevron dropdown. */
		dropdownOptions?: DropdownOption[];
	};

	let {
		mode,
		context = '',
		subContext = '',
		contextIcon,
		artifactId,
		onValidate,
		validating = false,
		secondaryLabel,
		onSecondary,
		dropdownOptions = []
	}: Props = $props();

	let dropdownOpen = $state(false);

	const HeaderIcon = $derived(contextIcon ?? ShieldCheck);

	function handleValidateClick(): void {
		onValidate(artifactId);
		closeDropdown();
	}

	function handleDropdownSelect(opt: DropdownOption): void {
		onValidate(artifactId, opt.id);
		closeDropdown();
	}

	function toggleDropdown(): void {
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown(): void {
		dropdownOpen = false;
	}

	function handleSecondary(): void {
		onSecondary?.();
	}

	function handleBackdrop(): void {
		closeDropdown();
	}
</script>

<svelte:window on:click={handleBackdrop} />

<div
	class="bg-secondary/40 flex flex-row items-center gap-3 rounded-t-4xl px-3.5 py-2 text-sm leading-tight text-card-foreground shadow-lg min-h-11"
	role="region"
	aria-label="Action required"
	data-mode={mode}
>
	<!-- Left: context object (icon + primary + sub line) -->
	<div class="flex flex-1 items-center gap-2.5 min-w-0 pl-1">
		<span class="inline-flex shrink-0 items-center justify-center size-6 rounded-lg text-primary">
			<HeaderIcon class="size-3.5" aria-hidden="true" />
		</span>
		<div class="flex min-w-0 flex-col">
			<span class="truncate font-medium text-foreground">
				{context || 'Marksheet validation required'}
			</span>
			{#if subContext}
				<span class="truncate text-[11px] text-muted-foreground">{subContext}</span>
			{/if}
		</div>
	</div>

	<!-- Right: decision triggers (Skip + Validate split-button) -->
	<div class="flex shrink-0 items-center gap-1.5" role="group" aria-label="Decisions">
		{#if secondaryLabel}
			<button
				type="button"
				class="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:min-w-8"
				onclick={(e) => {
					e.stopPropagation();
					handleSecondary();
				}}
				disabled={validating}
				aria-label={secondaryLabel}
			>
				<Ban class="size-3.5" aria-hidden="true" />
				<span class="hidden sm:inline">{secondaryLabel}</span>
			</button>
		{/if}

		<div class="relative inline-flex items-stretch">
			<button
				type="button"
				class="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-l-lg border-0 bg-primary px-3.5 py-1.5 pr-2.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8 sm:min-w-8"
				onclick={(e) => {
					e.stopPropagation();
					handleValidateClick();
				}}
				disabled={validating || !artifactId}
				aria-label="Validate and commit to database"
				data-testid="action-bar-validate"
			>
				{#if validating}
					<LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" />
				{:else}
					<CheckCircle2 class="size-3.5" aria-hidden="true" />
				{/if}
				<span class="hidden sm:inline">{validating ? 'Validating…' : 'Validate'}</span>
			</button>
			{#if dropdownOptions.length > 0}
				<button
					type="button"
					class="inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-r-lg border-0 border-l border-primary/40 bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8 sm:min-w-8"
					onclick={(e) => {
						e.stopPropagation();
						toggleDropdown();
					}}
					disabled={validating}
					aria-label="More validation options"
					aria-haspopup="menu"
					aria-expanded={dropdownOpen}
				>
					<ChevronDown class="size-3.5" aria-hidden="true" />
				</button>
				{#if dropdownOpen}
					<div
						class="absolute right-0 top-[calc(100%+0.375rem)] z-60 flex min-w-56 max-w-[calc(100vw-2rem)] flex-col gap-px rounded-lg border border-border/50 bg-popover p-1 shadow-2xl"
						role="menu"
					>
						{#each dropdownOptions as opt (opt.id)}
							<button
								type="button"
								role="menuitem"
								class="block w-full min-h-10 cursor-pointer rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-xs font-medium text-popover-foreground hover:bg-muted hover:text-foreground"
								onclick={(e) => {
									e.stopPropagation();
									handleDropdownSelect(opt);
								}}
							>
								{opt.label}
							</button>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
