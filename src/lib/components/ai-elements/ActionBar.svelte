<script lang="ts">
	import {
		ShieldCheck,
		X,
		LoaderCircle,
		CheckCircle2,
		ChevronDown,
		FileText,
		Ban
	} from "@lucide/svelte";

	type OptionItem = {
		id: string;
		label: string;
		icon?: string;
	};

	/** A sub-action exposed in the split-button dropdown chevron. */
	type DropdownOption = {
		id: string;
		label: string;
	};

	type Props = {
		mode?: "options" | "validation";
		/** Header text shown on the left next to the context icon. */
		context?: string;
		/** Optional secondary line below context (e.g. relative path). */
		subContext?: string;
		/** Override the default icon (ShieldCheck) — pass a Lucide component. */
		contextIcon?: typeof ShieldCheck;
		question?: string;
		options?: OptionItem[];
		runId?: string;
		stepId?: string;
		allowFreeText?: boolean;
		onSelect?: (payload: { selectedOptionId: string; freeTextAnswer?: string }) => void;
		artifactId?: string;
		onValidate?: (artifactId: string, dropdownId?: string) => void;
		validating?: boolean;
		/** Label for the secondary (Deny-equivalent) action. Omit to hide. */
		secondaryLabel?: string;
		onSecondary?: () => void;
		/** Items exposed via the split-button chevron dropdown. */
		dropdownOptions?: DropdownOption[];
	};

	let {
		mode = "options",
		context = "",
		subContext = "",
		contextIcon,
		question = "",
		options = [],
		runId = "",
		stepId = "",
		allowFreeText = true,
		onSelect,
		artifactId = "",
		onValidate,
		validating = false,
		secondaryLabel,
		onSecondary,
		dropdownOptions = []
	}: Props = $props();

	let freeTextValue = $state("");
	let showFreeText = $state(false);
	let dropdownOpen = $state(false);

	const HeaderIcon = $derived(contextIcon ?? ShieldCheck);

	function handlePillClick(option: OptionItem) {
		onSelect?.({ selectedOptionId: option.id });
	}

	function handleFreeTextSubmit() {
		const trimmed = freeTextValue.trim();
		if (trimmed.length === 0) return;
		onSelect?.({ selectedOptionId: `free_text_${Date.now()}`, freeTextAnswer: trimmed });
		freeTextValue = "";
		showFreeText = false;
	}

	function handleValidateClick() {
		onValidate?.(artifactId);
		closeDropdown();
	}

	function handleDropdownSelect(opt: DropdownOption) {
		onValidate?.(artifactId, opt.id);
		closeDropdown();
	}

	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	function handleSecondary() {
		onSecondary?.();
	}

	function handleBackdrop() {
		closeDropdown();
	}
</script>

<svelte:window on:click={handleBackdrop} />

<div
	class="action-bar"
	role="region"
	aria-label="Action required"
	data-run-id={runId}
	data-step-id={stepId}
	data-mode={mode}
>
	<!-- Left: context object (icon + primary + sub line) -->
	<div class="action-bar-context">
		<span class="action-bar-context-icon">
			<HeaderIcon aria-hidden="true" />
		</span>
		<div class="action-bar-context-text">
			<span class="action-bar-context-primary">
				{mode === "validation" ? context || "Marksheet validation required" : context || question}
			</span>
			{#if subContext}
				<span class="action-bar-context-sub">{subContext}</span>
			{/if}
		</div>
	</div>

	<!-- Right: decision triggers (Deny + Allow split-button) -->
	<div class="action-bar-actions" role="group" aria-label="Decisions">
		{#if secondaryLabel}
			<button
				type="button"
				class="action-bar-deny"
				onclick={(e) => {
					e.stopPropagation();
					handleSecondary();
				}}
				disabled={validating}
				aria-label={secondaryLabel}
			>
				<Ban aria-hidden="true" />
				<span>{secondaryLabel}</span>
			</button>
		{/if}

		{#if mode === "validation"}
			<div class="action-bar-split">
				<button
					type="button"
					class="action-bar-split-main"
					onclick={(e) => {
						e.stopPropagation();
						handleValidateClick();
					}}
					disabled={validating || !artifactId}
					aria-label="Validate and commit to database"
					data-testid="action-bar-validate"
				>
					{#if validating}
						<LoaderCircle class="animate-spin" aria-hidden="true" />
					{:else}
						<CheckCircle2 aria-hidden="true" />
					{/if}
					<span>{validating ? "Validating…" : "Validate"}</span>
				</button>
				{#if dropdownOptions.length > 0}
					<button
						type="button"
						class="action-bar-split-chevron"
						onclick={(e) => {
							e.stopPropagation();
							toggleDropdown();
						}}
						disabled={validating}
						aria-label="More validation options"
						aria-haspopup="menu"
						aria-expanded={dropdownOpen}
					>
						<ChevronDown aria-hidden="true" />
					</button>
					{#if dropdownOpen}
						<div class="action-bar-dropdown" role="menu">
							{#each dropdownOptions as opt (opt.id)}
								<button
									type="button"
									role="menuitem"
									class="action-bar-dropdown-item"
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
		{:else}
			{#each options as option (option.id)}
				<button
					type="button"
					class="action-bar-pill"
					onclick={(e) => {
						e.stopPropagation();
						handlePillClick(option);
					}}
					aria-label={option.label}
				>
					{#if option.icon}
						<span class="action-bar-pill-icon" aria-hidden="true">{option.icon}</span>
					{/if}
					<span class="action-bar-pill-label">{option.label}</span>
				</button>
			{/each}

			{#if allowFreeText && !showFreeText}
				<button
					type="button"
					class="action-bar-pill action-bar-pill-secondary"
					onclick={(e) => {
						e.stopPropagation();
						showFreeText = true;
					}}
					aria-label="Type your own answer"
				>
					Type your own answer
				</button>
			{/if}
		{/if}
	</div>

	{#if mode === "options" && showFreeText}
		<form
			class="action-bar-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleFreeTextSubmit();
			}}
		>
			<label class="action-bar-form-label" for="action-bar-freetext">
				Or type your own answer
			</label>
			<div class="action-bar-form-row">
				<input
					id="action-bar-freetext"
					type="text"
					bind:value={freeTextValue}
					class="action-bar-form-input"
					placeholder="Type here..."
					autocomplete="off"
				/>
				<button
					type="submit"
					class="action-bar-form-submit"
					disabled={freeTextValue.trim().length === 0}
				>
					Send
				</button>
				<button
					type="button"
					class="action-bar-form-cancel"
					onclick={() => {
						showFreeText = false;
						freeTextValue = "";
					}}
					aria-label="Cancel"
				>
					<X aria-hidden="true" />
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	/* Outer card — IDE-style permission bar.
	   Border-radius matches ChatComposer's `rounded-4xl` so the ActionBar
	   looks visually attached when it peeks out from behind the composer. */
	.action-bar {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		border-radius: 2rem;
		background: oklch(0.18 0.012 270);
		border: 1px solid oklch(0.28 0.015 270);
		box-shadow: 0 4px 16px -4px rgb(0 0 0 / 0.45);
		color: oklch(0.92 0.01 270);
		font-size: 0.8125rem;
		line-height: 1.25;
		min-height: 2.75rem;
	}

	/* Left side — context object */
	.action-bar-context {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex: 1 1 auto;
		min-width: 0;
		padding-left: 0.25rem;
	}

	.action-bar-context-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.5rem;
		background: oklch(0.25 0.012 270);
		color: oklch(0.78 0.12 240);
		flex-shrink: 0;
	}
	.action-bar-context-icon :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.action-bar-context-text {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		min-width: 0;
	}

	.action-bar-context-primary {
		font-weight: 500;
		color: oklch(0.94 0.008 270);
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-bar-context-sub {
		font-size: 0.6875rem;
		color: oklch(0.58 0.012 270);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Right side — decision triggers */
	.action-bar-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	/* Deny button — low-emphasis */
	.action-bar-deny {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.68 0.012 270);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.5rem;
		cursor: pointer;
		min-height: 2rem;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.action-bar-deny:hover:not(:disabled) {
		color: oklch(0.85 0.012 270);
		background: oklch(0.25 0.012 270);
	}
	.action-bar-deny:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-bar-deny :global(svg) {
		width: 0.8125rem;
		height: 0.8125rem;
	}

	/* Split-button — primary action + chevron dropdown */
	.action-bar-split {
		display: inline-flex;
		align-items: stretch;
		position: relative;
	}

	.action-bar-split-main,
	.action-bar-split-chevron {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.875rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.99 0.005 240);
		background: oklch(0.62 0.18 255);
		border: 0;
		cursor: pointer;
		min-height: 2rem;
		transition:
			background 0.15s ease,
			filter 0.15s ease;
	}
	.action-bar-split-main {
		border-top-left-radius: 0.5rem;
		border-bottom-left-radius: 0.5rem;
		padding-right: 0.625rem;
	}
	.action-bar-split-chevron {
		border-top-right-radius: 0.5rem;
		border-bottom-right-radius: 0.5rem;
		padding: 0.4375rem 0.5rem;
		border-left: 1px solid oklch(0.55 0.18 255 / 0.6);
	}
	.action-bar-split-main:hover:not(:disabled),
	.action-bar-split-chevron:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.action-bar-split-main:disabled,
	.action-bar-split-chevron:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.action-bar-split-main :global(svg),
	.action-bar-split-chevron :global(svg) {
		width: 0.8125rem;
		height: 0.8125rem;
	}

	/* Dropdown menu */
	.action-bar-dropdown {
		position: absolute;
		top: calc(100% + 0.375rem);
		right: 0;
		min-width: 14rem;
		padding: 0.25rem;
		background: oklch(0.22 0.012 270);
		border: 1px solid oklch(0.3 0.015 270);
		border-radius: 0.625rem;
		box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.55);
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		z-index: 60;
	}

	.action-bar-dropdown-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.92 0.01 270);
		background: transparent;
		border: 0;
		border-radius: 0.375rem;
		cursor: pointer;
	}
	.action-bar-dropdown-item:hover {
		background: oklch(0.28 0.012 270);
		color: oklch(0.98 0.005 270);
	}

	/* Options mode — legacy pill rendering */
	.action-bar-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4375rem 0.875rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: oklch(0.92 0.01 270);
		background: oklch(0.25 0.012 270);
		border: 1px solid oklch(0.3 0.015 270);
		border-radius: 9999px;
		cursor: pointer;
		min-height: 2rem;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.action-bar-pill:hover {
		background: oklch(0.28 0.012 270);
		border-color: oklch(0.5 0.13 250);
	}
	.action-bar-pill-secondary {
		background: transparent;
		font-style: italic;
		color: oklch(0.7 0.012 270);
		border-color: transparent;
	}

	.action-bar-pill-icon {
		font-size: 0.875rem;
		line-height: 1;
	}
	.action-bar-pill-label {
		white-space: nowrap;
	}

	/* Free-text form */
	.action-bar-form {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		width: 100%;
		flex-basis: 100%;
	}
	.action-bar-form-label {
		font-size: 0.6875rem;
		color: oklch(0.58 0.012 270);
	}
	.action-bar-form-row {
		display: flex;
		gap: 0.375rem;
		align-items: center;
	}
	.action-bar-form-input {
		flex: 1;
		padding: 0.4375rem 0.625rem;
		font-size: 0.8125rem;
		border: 1px solid oklch(0.3 0.015 270);
		border-radius: 0.4375rem;
		background: oklch(0.22 0.012 270);
		color: oklch(0.94 0.008 270);
		min-height: 2rem;
	}
	.action-bar-form-input:focus-visible {
		outline: 2px solid oklch(0.62 0.18 255);
		outline-offset: 1px;
	}
	.action-bar-form-submit {
		padding: 0.4375rem 0.875rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: oklch(0.99 0.005 240);
		background: oklch(0.62 0.18 255);
		border: 0;
		border-radius: 0.4375rem;
		cursor: pointer;
		min-height: 2rem;
	}
	.action-bar-form-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-bar-form-cancel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4375rem;
		border: 1px solid oklch(0.3 0.015 270);
		border-radius: 0.4375rem;
		background: transparent;
		color: oklch(0.7 0.012 270);
		cursor: pointer;
		min-height: 2rem;
		min-width: 2rem;
	}
</style>
