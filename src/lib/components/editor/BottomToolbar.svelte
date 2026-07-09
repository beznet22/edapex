<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
	import CodeIcon from '@lucide/svelte/icons/code';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import StepForwardIcon from '@lucide/svelte/icons/step-forward';
	import type { ContainerBreakpoint } from './useContainerBreakpoint.svelte';
	import EditorBubbleItem from './EditorBubbleItem.svelte';

	/**
	 * BottomToolbar — mobile fixed toolbar rendered above the on-screen keyboard.
	 *
	 * Visible when:
	 *   - isMobile === true AND
	 *   - containerBreakpoint is sm or md (>= 384px and < 512px)
	 *
	 * Below sm (xs), the MobileAISheet takes over (full-screen drawer pattern).
	 * At lg+ (desktop), the bubble menu (GenerativeMenuSwitch) is used instead.
	 *
	 * Touch targets are min-h-12 min-w-12 (48x48px) per docs/responsive_design.md.
	 * Position is `fixed` with `bottom: 0` and safe-area-inset-bottom padding so
	 * iOS home indicator / Android gesture bar don't overlap the buttons.
	 *
	 * Keyboard avoidance is handled via the `visualViewport` API — the wrapper's
	 * `bottom` is adjusted to `visualViewport.height - visualViewport.offsetTop`
	 * when the keyboard opens.
	 */
	type ToolName = 'improve' | 'fix' | 'shorter' | 'longer' | 'continue' | 'generate';

	let {
		editor,
		isMobile = false,
		containerBreakpoint = 'lg',
		onAiCommand,
		onOpenMobileSheet,
	}: {
		editor: Editor;
		isMobile?: boolean;
		containerBreakpoint?: ContainerBreakpoint;
		onAiCommand: (option: ToolName, text: string, additionalCommand?: string) => Promise<void> | void;
		onOpenMobileSheet: () => void;
	} = $props();

	const visible = $derived(
		isMobile && (containerBreakpoint === 'sm' || containerBreakpoint === 'md'),
	);

	function captureCursorText(): string {
		const { from } = editor.state.selection;
		const start = Math.max(0, from - 2000);
		return editor.state.doc.textBetween(start, from, '\n');
	}

	function handleContinue() {
		const text = captureCursorText();
		if (!text) return;
		onAiCommand('continue', text);
	}

	const formatActions = [
		{ name: 'bold', icon: BoldIcon, command: (e: Editor) => e.chain().focus().toggleBold().run() },
		{ name: 'italic', icon: ItalicIcon, command: (e: Editor) => e.chain().focus().toggleItalic().run() },
		{
			name: 'underline',
			icon: UnderlineIcon,
			command: (e: Editor) => e.chain().focus().toggleUnderline().run(),
		},
		{
			name: 'strike',
			icon: StrikethroughIcon,
			command: (e: Editor) => e.chain().focus().toggleStrike().run(),
		},
		{ name: 'code', icon: CodeIcon, command: (e: Editor) => e.chain().focus().toggleCode().run() },
	] as const;
</script>

{#if visible}
	<div class="bottom-toolbar" data-slot="bottom-toolbar">
		<div class="bottom-toolbar-row">
			{#each formatActions as action (action.name)}
				<button
					type="button"
					class="bottom-toolbar-btn"
					onclick={() => action.command(editor)}
					title={action.name}
					aria-label={action.name}
				>
					<action.icon class="size-5" />
				</button>
			{/each}

			<div class="bottom-toolbar-divider"></div>

			<button
				type="button"
				class="bottom-toolbar-btn text-primary"
				onclick={handleContinue}
				title="Continue writing"
				aria-label="Continue writing"
			>
				<StepForwardIcon class="size-5" />
			</button>

			<button
				type="button"
				class="bottom-toolbar-btn text-primary"
				onclick={onOpenMobileSheet}
				title="Ask AI"
				aria-label="Ask AI"
			>
				<SparklesIcon class="size-5" />
			</button>
		</div>
	</div>
{/if}

<style>
	.bottom-toolbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		padding: 0.5rem;
		padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
		background: color-mix(in oklch, var(--background), transparent 10%);
		backdrop-filter: blur(16px) saturate(1.6);
		-webkit-backdrop-filter: blur(16px) saturate(1.6);
		border-top: 1px solid var(--border);
		box-shadow: 0 -4px 16px -4px rgb(0 0 0 / 0.15);
	}

	.bottom-toolbar-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
	}

	.bottom-toolbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		min-width: 3rem;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: var(--muted-foreground);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s, transform 0.1s;
	}

	.bottom-toolbar-btn:hover {
		background: var(--accent);
		color: var(--accent-foreground);
	}

	.bottom-toolbar-btn:active {
		transform: scale(0.95);
	}

	.bottom-toolbar-btn:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--ring);
	}

	.bottom-toolbar-divider {
		width: 1px;
		height: 1.5rem;
		background: var(--border);
		margin: 0 0.25rem;
	}
</style>
