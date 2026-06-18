<script lang="ts">
	import { ShieldCheck, X } from "@lucide/svelte";

	type OptionItem = {
		id: string;
		label: string;
		icon?: string;
	};

	type Props = {
		question: string;
		options: OptionItem[];
		runId: string;
		stepId: string;
		allowFreeText?: boolean;
		onSelect: (payload: { selectedOptionId: string; freeTextAnswer?: string }) => void;
	};

	let { question, options, runId, stepId, allowFreeText = true, onSelect }: Props = $props();

	let freeTextValue = $state("");
	let showFreeText = $state(false);

	function handlePillClick(option: OptionItem) {
		onSelect({ selectedOptionId: option.id });
	}

	function handleFreeTextSubmit() {
		const trimmed = freeTextValue.trim();
		if (trimmed.length === 0) return;
		onSelect({ selectedOptionId: `free_text_${Date.now()}`, freeTextAnswer: trimmed });
		freeTextValue = "";
		showFreeText = false;
	}
</script>

<div
	class="action-bar"
	role="region"
	aria-label="Action required"
	data-run-id={runId}
	data-step-id={stepId}
>
	<div class="action-bar-header">
		<ShieldCheck class="action-bar-icon" aria-hidden="true" />
		<p class="action-bar-question">{question}</p>
	</div>

	<div class="action-bar-options" role="group" aria-label="Choices">
		{#each options as option (option.id)}
			<button
				type="button"
				class="action-bar-pill"
				onclick={() => handlePillClick(option)}
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
				onclick={() => (showFreeText = true)}
				aria-label="Type your own answer"
			>
				Type your own answer
			</button>
		{/if}
	</div>

	{#if showFreeText}
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
	.action-bar {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		margin: 0.5rem 0;
		border: 1px solid var(--color-border, oklch(0.7 0.05 60));
		border-radius: 0.5rem;
		background: var(--color-card, oklch(0.98 0.01 60));
	}

	.action-bar-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.action-bar-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--color-primary, oklch(0.7 0.15 60));
		flex-shrink: 0;
	}

	.action-bar-question {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-foreground, oklch(0.2 0.02 60));
	}

	.action-bar-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.action-bar-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.875rem;
		font-weight: 500;
		border: 1px solid var(--color-border, oklch(0.7 0.05 60));
		border-radius: 9999px;
		background: var(--color-background, oklch(1 0 0));
		color: var(--color-foreground, oklch(0.2 0.02 60));
		cursor: pointer;
		min-height: 2.5rem;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.action-bar-pill:hover {
		background: var(--color-accent, oklch(0.95 0.02 60));
		border-color: var(--color-primary, oklch(0.7 0.15 60));
	}

	.action-bar-pill:focus-visible {
		outline: 2px solid var(--color-primary, oklch(0.7 0.15 60));
		outline-offset: 2px;
	}

	.action-bar-pill-secondary {
		background: transparent;
		font-style: italic;
	}

	.action-bar-pill-icon {
		font-size: 1rem;
		line-height: 1;
	}

	.action-bar-pill-label {
		white-space: nowrap;
	}

	.action-bar-form {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.action-bar-form-label {
		font-size: 0.75rem;
		color: var(--color-muted-foreground, oklch(0.5 0.02 60));
	}

	.action-bar-form-row {
		display: flex;
		gap: 0.375rem;
		align-items: center;
	}

	.action-bar-form-input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		border: 1px solid var(--color-border, oklch(0.7 0.05 60));
		border-radius: 0.375rem;
		background: var(--color-background, oklch(1 0 0));
		color: var(--color-foreground, oklch(0.2 0.02 60));
		min-height: 2.5rem;
	}

	.action-bar-form-input:focus-visible {
		outline: 2px solid var(--color-primary, oklch(0.7 0.15 60));
		outline-offset: 1px;
	}

	.action-bar-form-submit {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border: 1px solid var(--color-primary, oklch(0.7 0.15 60));
		border-radius: 0.375rem;
		background: var(--color-primary, oklch(0.7 0.15 60));
		color: var(--color-primary-foreground, oklch(0.98 0.01 60));
		cursor: pointer;
		min-height: 2.5rem;
	}

	.action-bar-form-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-bar-form-cancel {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border: 1px solid var(--color-border, oklch(0.7 0.05 60));
		border-radius: 0.375rem;
		background: transparent;
		color: var(--color-muted-foreground, oklch(0.5 0.02 60));
		cursor: pointer;
		min-height: 2.5rem;
		min-width: 2.5rem;
	}
</style>
