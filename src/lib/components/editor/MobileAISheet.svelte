<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { Drawer } from 'vaul-svelte';
	import type { ContainerBreakpoint } from './useContainerBreakpoint';
	import AISelector from './AISelector.svelte';

	/**
	 * MobileAISheet — mobile full-screen bottom sheet for AI commands.
	 *
	 * Visible when containerBreakpoint === 'xs' (container < 384px) OR
	 * isMobile on a very narrow device. Uses vaul-svelte Drawer which
	 * provides the bottom-sheet UX (drag handle, scroll trapping,
	 * backdrop, safe-area handling).
	 *
	 * Renders the AISelector inside the drawer so the user gets the same
	 * 5 commands (improve/fix/shorter/longer/continue) + free-text generate
	 * on mobile as on desktop, just in a more touch-friendly full-screen layout.
	 *
	 * On lg+ the bubble menu (GenerativeMenuSwitch) takes over, so this
	 * component renders nothing.
	 */
	type ToolName = 'improve' | 'fix' | 'shorter' | 'longer' | 'continue' | 'generate';

	let {
		editor,
		open = $bindable(false),
		isMobile = false,
		containerBreakpoint = 'lg',
		onAiCommand,
		completion = '',
		isLoading = false,
	}: {
		editor: Editor;
		open?: boolean;
		isMobile?: boolean;
		containerBreakpoint?: ContainerBreakpoint;
		onAiCommand: (option: ToolName, text: string, additionalCommand?: string) => Promise<void> | void;
		completion?: string;
		isLoading?: boolean;
	} = $props();

	const visible = $derived(
		isMobile || containerBreakpoint === 'xs',
	);

	function handleClose() {
		open = false;
	}
</script>

{#if visible}
	<Drawer.Root bind:open>
		<Drawer.Portal>
			<Drawer.Overlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
			<Drawer.Content
				class="fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[85vh] flex-col rounded-t-2xl border border-border bg-popover outline-none"
			>
				<div class="mx-auto mt-3 h-1.5 w-12 flex-shrink-0 rounded-full bg-muted" aria-hidden="true"></div>
				<div class="flex-1 overflow-y-auto p-4">
					<Drawer.Title class="mb-3 text-sm font-semibold text-foreground">Ask AI</Drawer.Title>
					<Drawer.Description class="sr-only">
						Choose an AI command to improve, fix, shorten, lengthen, or continue your text.
					</Drawer.Description>
					<AISelector
						{editor}
						onCommand={onAiCommand}
						onClose={handleClose}
						{completion}
						{isLoading}
					/>
				</div>
				<div
					class="border-t border-border p-2"
					style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
				>
					<Drawer.Close class="bottom-toolbar-btn">Close</Drawer.Close>
				</div>
			</Drawer.Content>
		</Drawer.Portal>
	</Drawer.Root>
{/if}

<style>
	:global(.bottom-toolbar-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 3rem;
		min-width: 3rem;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		color: var(--muted-foreground);
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
	}

	:global(.bottom-toolbar-btn:hover) {
		background: var(--accent);
		color: var(--accent-foreground);
	}
</style>
