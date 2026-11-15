<script lang="ts">
	import type { Editor } from "@tiptap/core";
	import ArrowUp from "@lucide/svelte/icons/arrow-up";
	import Magic from "@lucide/svelte/icons/sparkles";
	import RefreshCcwDot from "@lucide/svelte/icons/refresh-ccw-dot";
	import CheckCheck from "@lucide/svelte/icons/check-check";
	import ArrowDownWideNarrow from "@lucide/svelte/icons/arrow-down-wide-narrow";
	import WrapText from "@lucide/svelte/icons/wrap-text";
	import StepForward from "@lucide/svelte/icons/step-forward";
	import * as Command from "$lib/components/ui/command";
	import { Button } from "$lib/components/ui/button";
	import AICompletionCommands from "./AICompletionCommands.svelte";

	/**
	 * AISelector — cmdk-style command palette for the editor's AI features.
	 * Ported from Novel.sh's `apps/web/components/tailwind/generative/ai-selector.tsx`.
	 *
	 * Commands (matches the `editorToolNameSchema` enum):
	 *   Selection-based: improve, fix, shorter, longer (only shown when selection is non-empty)
	 *   Cursor-based:    continue (operates on previous text at caret, replaces copilot flow)
	 *   Free-text:       generate (uses inputValue as the prompt)
	 *
	 * Streaming state is controlled by the parent via `completion` and `isLoading` props.
	 * When `hasCompletion` is true, the option list is replaced by the streamed
	 * preview plus the `AICompletionCommands` actions (Replace / Insert below / Discard).
	 *
	 * $derived is used everywhere state can be computed; $state only for `inputValue`
	 * which is genuinely user-mutable.
	 */
	type SelectionToolName = "improve" | "fix" | "shorter" | "longer";
	type ToolName = SelectionToolName | "continue" | "generate";

	const SELECTION_COMMANDS: ReadonlyArray<{
		value: SelectionToolName;
		label: string;
		icon: typeof RefreshCcwDot;
	}> = [
		{ value: "improve", label: "Improve writing", icon: RefreshCcwDot },
		{ value: "fix", label: "Fix grammar", icon: CheckCheck },
		{ value: "shorter", label: "Make shorter", icon: ArrowDownWideNarrow },
		{ value: "longer", label: "Make longer", icon: WrapText },
	];

	let {
		editor,
		onCommand,
		onClose,
		completion = "",
		isLoading = false,
	}: {
		editor: Editor;
		onCommand: (option: ToolName, text: string, additionalCommand?: string) => Promise<void> | void;
		onClose: () => void;
		completion?: string;
		isLoading?: boolean;
	} = $props();

	let inputValue = $state("");
	const hasCompletion = $derived(completion.length > 0);
	const selection = $derived(editor.state.selection);
	const hasSelection = $derived(!selection.empty);

	function captureSelectionText(): string {
		if (selection.empty) return "";
		const slice = editor.state.selection.content();
		const markdown = (editor.storage as { markdown?: unknown }).markdown as
			| { serializer?: { serialize?: (node: unknown) => string } }
			| undefined;
		return markdown?.serializer?.serialize?.(slice.content) ?? "";
	}

	function captureCursorText(): string {
		const { from } = selection;
		const start = Math.max(0, from - 2000);
		return editor.state.doc.textBetween(start, from, "\n");
	}

	function handleSelectionCommand(option: SelectionToolName) {
		const text = captureSelectionText();
		if (!text) return;
		onCommand(option, text);
	}

	function handleContinue() {
		const text = captureCursorText();
		if (!text) return;
		onCommand("continue", text);
	}

	function handleGenerate() {
		const trimmed = inputValue.trim();
		if (!trimmed) return;
		onCommand("generate", trimmed, trimmed);
		inputValue = "";
	}

	function handleSubmit() {
		if (hasCompletion || isLoading) return;
		handleGenerate();
	}

	function handleInputKeyDown(e: KeyboardEvent) {
		if (e.key !== "Enter" || e.shiftKey) return;
		if (e.isComposing || e.keyCode === 229) return;
		e.preventDefault();
		e.stopPropagation();
		handleSubmit();
	}
</script>

<Command.Root class="w-[350px]">
	{#if hasCompletion && !isLoading}
		<div class="flex max-h-[400px] overflow-auto">
			<div class="prose prose-sm max-w-none p-2 px-4 dark:prose-invert">
				{completion}
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex h-12 w-full items-center px-4 text-sm font-medium text-purple-500">
			<Magic class="mr-2 size-4 shrink-0" />
			AI is thinking
		</div>
	{:else}
		<div class="relative">
			<Command.Input
				bind:value={inputValue}
				onkeydown={handleInputKeyDown}
				placeholder={hasCompletion ? "Tell AI what to do next" : "Ask AI to edit or generate…"}
			/>
			<Button
				size="icon"
				class="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full"
				onclick={handleSubmit}
				aria-label="Submit"
			>
				<ArrowUp class="size-4" />
			</Button>
		</div>

		{#if hasCompletion}
			<AICompletionCommands {editor} {completion} onDiscard={onClose} />
		{:else}
			{#if hasSelection}
				<Command.Group heading="Edit or review selection">
					{#each SELECTION_COMMANDS as cmd (cmd.value)}
						<Command.Item value={cmd.value} onSelect={() => handleSelectionCommand(cmd.value)}>
							<cmd.icon class="text-purple-500" />
							{cmd.label}
						</Command.Item>
					{/each}
				</Command.Group>
				<Command.Separator />
			{/if}

			<Command.Group heading="Use AI to do more">
				<Command.Item value="continue" onSelect={handleContinue}>
					<StepForward class="text-purple-500" />
					Continue writing
				</Command.Item>
			</Command.Group>
		{/if}
	{/if}
</Command.Root>
