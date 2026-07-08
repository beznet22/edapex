<script lang="ts">
	import { cn } from '$lib/utils/shadcn';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import VariableIcon from '@lucide/svelte/icons/variable';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';

	/**
	 * MentionSuggestions — upgraded version of MentionSuggestionList with:
	 *   - cmdk-style keyboard navigation (aria-activedescendant, ↑/↓/Enter/Esc)
	 *   - Premium hover/focus/active states (matching novel's selector pattern)
	 *   - Keyboard hints footer (↑/↓ navigate, Enter select, Esc close)
	 *   - Container-query responsive via CSS @container
	 *   - Same caret-anchored positioning (manual, since bits-ui Popover
	 *     requires a trigger element we don't have here)
	 *
	 * The caret-anchored positioning is preserved (the mention suggestion
	 * plugin already manages clientRect + scroll/resize listeners). What
	 * we upgrade here is the visual + keyboard UX layer.
	 */

	interface MentionItem {
		id: number | string;
		name: string;
		category: string;
		typeBadge: string;
		parentContext?: string;
		/**
		 * Structured fields for `students` mentions. Threaded through to
		 * the `onSelect` callback so the mention node attrs can be populated
		 * with admissionNo + studentId alongside id/label/category.
		 */
		admissionNo?: string;
		studentId?: number;
	}

	let {
		items = [],
		selectedIndex = 0,
		query = '',
		filterLabel = '',
		onSelect,
		onHover,
	}: {
		items: MentionItem[];
		selectedIndex: number;
		query: string;
		clientRect: (() => DOMRect | null) | null;
		filterLabel?: string;
		onSelect: (item: MentionItem) => void;
		onHover: (index: number) => void;
	} = $props();

	const iconFor = (category: string) => {
		if (category === 'students') return GraduationCapIcon;
		if (category === 'date') return CalendarIcon;
		return VariableIcon;
	};

	const grouped = $derived.by(() => {
		const byCategory: Record<string, MentionItem[]> = {};
		for (const item of items) {
			(byCategory[item.category] ??= []).push(item);
		}
		return byCategory;
	});

	const flatIndex = (item: MentionItem) =>
		items.findIndex((i) => i.id === item.id && i.category === item.category);

	let listEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (listEl) {
			tick().then(() => {
				const el = listEl?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
				el?.scrollIntoView({ block: 'nearest' });
			});
		}
	});
</script>

<div
	bind:this={listEl}
	class="mention-suggestion-list"
	role="listbox"
	aria-label="Mention suggestions"
	aria-activedescendant={`mention-opt-${selectedIndex}`}
	tabindex={-1}
	data-slot="mention-suggestions"
>
	{#if filterLabel}
		<div class="mention-filter-label">
			<span>Filter:</span>
			<span class="mention-filter-value">{filterLabel}</span>
		</div>
	{/if}

	{#if items.length === 0}
		<div class="mention-empty">
			{#if query}
				No matches. Press <kbd class="mention-kbd-inline">Esc</kbd> and type
				<code class="mention-code-inline">{`{{custom:${query}}}`}</code> for a free-form value.
			{:else}
				Start typing to search…
			{/if}
		</div>
	{:else}
		{#each Object.entries(grouped) as [category, group] (category)}
			<div class="mention-group-label">{category}</div>
			{#each group as item (item.id + '-' + item.category)}
				{@const idx = flatIndex(item)}
				{@const Icon = iconFor(item.category)}
				<button
					id={`mention-opt-${idx}`}
					data-idx={idx}
					class={cn(
						'mention-option',
						idx === selectedIndex && 'mention-option-active',
					)}
					onclick={() => onSelect(item)}
					onmouseenter={() => onHover(idx)}
					role="option"
					aria-selected={idx === selectedIndex}
				>
					<div
						class={cn(
							'mention-icon-wrap',
							idx === selectedIndex && 'mention-icon-wrap-active',
						)}
					>
						<Icon class="size-3.5" />
					</div>
					<div class="mention-text">
						<span class="mention-name">{item.name}</span>
						{#if item.parentContext}
							<span class="mention-context">{item.parentContext}</span>
						{/if}
					</div>
					<span class="mention-badge">{item.typeBadge}</span>
				</button>
			{/each}
		{/each}
	{/if}

	<div class="mention-footer" aria-hidden="true">
		<span class="mention-kbd-group">
			<kbd class="mention-kbd"><ArrowUpIcon class="size-2.5" /><ArrowDownIcon class="size-2.5" /></kbd>
			<span>navigate</span>
		</span>
		<span class="mention-kbd-group">
			<kbd class="mention-kbd"><CornerDownLeftIcon class="size-2.5" /></kbd>
			<span>select</span>
		</span>
		<span class="mention-kbd-group">
			<kbd class="mention-kbd"><XIcon class="size-2.5" /></kbd>
			<span>close</span>
		</span>
	</div>
</div>

<style>
	/* Container-query responsive: full-width sheet on xs, compact dropdown on sm+ */
	.mention-suggestion-list {
		@container (max-width: 383px) {
			width: calc(100vw - 2rem);
			max-width: none;
		}
	}

	.mention-suggestion-list {
		background: var(--popover);
		color: var(--popover-foreground);
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		box-shadow:
			0 4px 6px -1px oklch(0 0 0 / 0.1),
			0 10px 24px -4px oklch(0 0 0 / 0.15);
		width: 18rem;
		max-height: 18rem;
		overflow-y: auto;
		padding: 0.25rem;
		container-type: inline-size;
		font-family: inherit;
	}

	.mention-filter-label {
		padding: 0.25rem 0.5rem 0.125rem;
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: color-mix(in oklch, var(--muted-foreground), transparent 40%);
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.mention-filter-value {
		color: var(--primary);
		text-transform: none;
		letter-spacing: normal;
	}

	.mention-empty {
		padding: 0.75rem 0.75rem 1.5rem;
		text-align: center;
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.mention-kbd-inline {
		display: inline-flex;
		align-items: center;
		padding: 0 0.25rem;
		border-radius: 0.25rem;
		border: 1px solid var(--border);
		background: var(--secondary);
		font-family: var(--font-mono);
		font-size: 10px;
	}

	.mention-code-inline {
		font-family: var(--font-mono);
		font-size: 10px;
		background: var(--secondary);
		padding: 0 0.25rem;
		border-radius: 0.25rem;
	}

	.mention-group-label {
		padding: 0.375rem 0.5rem 0.125rem;
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: color-mix(in oklch, var(--muted-foreground), transparent 40%);
	}

	.mention-option {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 0.5rem;
		border-radius: 0.5rem;
		text-align: left;
		width: 100%;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
	}

	.mention-option:hover {
		background: color-mix(in oklch, var(--secondary), transparent 50%);
	}

	.mention-option-active {
		background: color-mix(in oklch, var(--primary), transparent 85%);
		color: var(--primary);
	}

	.mention-option:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--ring);
	}

	.mention-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		flex-shrink: 0;
		background: color-mix(in oklch, var(--secondary), transparent 60%);
		color: var(--muted-foreground);
	}

	.mention-icon-wrap-active {
		background: color-mix(in oklch, var(--primary), transparent 85%);
		color: var(--primary);
	}

	.mention-text {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-width: 0;
	}

	.mention-name {
		font-size: 12.5px;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mention-context {
		font-size: 10.5px;
		color: color-mix(in oklch, var(--muted-foreground), transparent 20%);
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mention-badge {
		flex-shrink: 0;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: color-mix(in oklch, var(--secondary), transparent 60%);
		color: color-mix(in oklch, var(--muted-foreground), transparent 30%);
	}

	.mention-footer {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0.5rem;
		margin-top: 0.25rem;
		border-top: 1px solid var(--border);
		font-size: 9px;
		color: var(--muted-foreground);
	}

	.mention-kbd-group {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}

	.mention-kbd {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		padding: 0 0.25rem;
		min-height: 0.875rem;
		border-radius: 0.25rem;
		border: 1px solid var(--border);
		background: var(--secondary);
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--muted-foreground);
	}
</style>
