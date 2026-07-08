<script lang="ts">
	import type { Editor } from "@tiptap/core";
	import BoldIcon from "@lucide/svelte/icons/bold";
	import ItalicIcon from "@lucide/svelte/icons/italic";
	import UnderlineIcon from "@lucide/svelte/icons/underline";
	import StrikethroughIcon from "@lucide/svelte/icons/strikethrough";
	import CodeIcon from "@lucide/svelte/icons/code";
	import HighlighterIcon from "@lucide/svelte/icons/highlighter";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import StepForwardIcon from "@lucide/svelte/icons/step-forward";
	import * as Popover from "$lib/components/ui/popover";
	import { Separator } from "$lib/components/ui/separator";
	import { cn } from "$lib/utils/shadcn";
	import EditorBubbleItem from "./EditorBubbleItem.svelte";
	import AISelector from "./AISelector.svelte";
	import type { ContainerBreakpoint } from "./useContainerBreakpoint";

	/**
	 * GenerativeMenuSwitch — two-state bubble wrapper rendered inside the
	 * editor's `BubbleMenu`. Ported from Novel.sh's
	 * `apps/web/components/tailwind/generative/generative-menu-switch.tsx`.
	 *
	 * Closed state (always visible when container ≥ sm and not mobile):
	 *   [Format bar: Bold/Italic/Underline/Strikethrough/Code/Highlight]
	 *   [Ask AI ✨]  — opens the AISelector Popover
	 *   [Continue ✨] — dispatches the `continue` command directly (uses
	 *     cursor context — replaces the standalone Copilot trigger)
	 *
	 * Open state: AISelector inside a Radix Popover. The Popover inherits
	 * Radix's `data-[state=open]:animate-in` / `data-[state=closed]:animate-out`
	 * classes (already wired in `ui/popover/popover-content.svelte`), so no
	 * extra animation classes are needed here.
	 *
	 * Spring transition (ease-[cubic-bezier(0.34,1.56,0.64,1)] 1000ms) on the
	 * outer bar matches `WorkspacePaneGroup`'s inspector-pane spring for
	 * consistent motion language across the workspace.
	 *
	 * All visual state is `$derived`; only `open` is `$state`.
	 */
	type ToolName = "improve" | "fix" | "shorter" | "longer" | "continue" | "generate";

	let {
		editor,
		isMobile = false,
		containerBreakpoint = "lg",
		onAiCommand,
		completion = "",
		isLoading = false,
	}: {
		editor: Editor;
		isMobile?: boolean;
		containerBreakpoint?: ContainerBreakpoint;
		onAiCommand: (
			option: ToolName,
			text: string,
			additionalCommand?: string,
		) => Promise<void> | void;
		completion?: string;
		isLoading?: boolean;
	} = $props();

	let open = $state(false);

	const visible = $derived(
		!isMobile &&
			(containerBreakpoint === "sm" ||
				containerBreakpoint === "md" ||
				containerBreakpoint === "lg" ||
				containerBreakpoint === "xl"),
	);

	function captureCursorText(): string {
		const { from } = editor.state.selection;
		const start = Math.max(0, from - 2000);
		return editor.state.doc.textBetween(start, from, "\n");
	}

	function handleContinue() {
		const text = captureCursorText();
		if (!text) return;
		onAiCommand("continue", text);
	}

	function handleClose() {
		open = false;
	}

	const formatActions = [
		{
			name: "bold",
			icon: BoldIcon,
			active: () => editor.isActive("bold"),
			command: (e: Editor) => e.chain().focus().toggleBold().run(),
		},
		{
			name: "italic",
			icon: ItalicIcon,
			active: () => editor.isActive("italic"),
			command: (e: Editor) => e.chain().focus().toggleItalic().run(),
		},
		{
			name: "underline",
			icon: UnderlineIcon,
			active: () => editor.isActive("underline"),
			command: (e: Editor) => e.chain().focus().toggleUnderline().run(),
		},
		{
			name: "strike",
			icon: StrikethroughIcon,
			active: () => editor.isActive("strike"),
			command: (e: Editor) => e.chain().focus().toggleStrike().run(),
		},
		{
			name: "code",
			icon: CodeIcon,
			active: () => editor.isActive("code"),
			command: (e: Editor) => e.chain().focus().toggleCode().run(),
		},
		{
			name: "highlight",
			icon: HighlighterIcon,
			active: () => editor.isActive("highlight"),
			command: (e: Editor) => e.chain().focus().toggleHighlight().run(),
		},
	] as const;
</script>

{#if visible}
	<div
		class="flex w-fit max-w-[90vw] items-center gap-0.5 overflow-hidden rounded-xl border border-border bg-popover px-1.5 py-1 text-popover-foreground shadow-2xl transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
	>
		{#each formatActions as action, i (action.name)}
			<EditorBubbleItem editor={editor} onSelect={action.command}>
				<action.icon class={cn("size-3.5", action.active() && "text-blue-500")} />
			</EditorBubbleItem>
			{#if i === 3}
				<Separator orientation="vertical" class="mx-0.5 h-4 bg-border/50" />
			{/if}
		{/each}

		<Separator orientation="vertical" class="mx-0.5 h-4 bg-border/50" />

		<button
			type="button"
			class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-primary transition-all duration-150 hover:bg-primary/10 group"
			onclick={handleContinue}
			title="Continue writing (uses cursor context)"
		>
			<StepForwardIcon class="size-3.5 group-hover:animate-pulse" />
			<span class="text-[9px] font-black uppercase tracking-widest">Continue</span>
		</button>

		<Separator orientation="vertical" class="mx-0.5 h-4 bg-border/50" />

		<Popover.Root bind:open>
			<Popover.Trigger
				class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-primary transition-all duration-150 hover:bg-primary/10 group"
			>
				<SparklesIcon class="size-3.5 group-hover:animate-pulse" />
				<span class="text-[9px] font-black uppercase tracking-widest">Ask AI</span>
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0" sideOffset={8} align="start">
				<AISelector
					{editor}
					onCommand={onAiCommand}
					onClose={handleClose}
					{completion}
					{isLoading}
				/>
			</Popover.Content>
		</Popover.Root>
	</div>
{/if}
