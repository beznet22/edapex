<script lang="ts">
	import type { Editor } from "@tiptap/core";
	import Check from "@lucide/svelte/icons/check";
	import TextQuote from "@lucide/svelte/icons/text-quote";
	import TrashIcon from "@lucide/svelte/icons/trash";
	import * as Command from "$lib/components/ui/command";

	/**
	 * AICompletionCommands — completion-action panel rendered after streaming
	 * finishes in `AISelector`. Ported from Novel.sh's
	 * `apps/web/components/tailwind/generative/ai-completion-command.tsx`.
	 *
	 * Three actions:
	 *   - Replace selection — overwrites the current selection with the completion
	 *   - Insert below — appends after the selection's `to` position
	 *   - Discard — calls `onDiscard` (typically clears the AISelector)
	 *
	 * Uses shadcn-svelte's `Command` primitives (cmdk under the hood) so the
	 * actions inherit the same keyboard nav + a11y as the AISelector's option list.
	 */
	let {
		editor,
		completion,
		onDiscard,
	}: {
		editor: Editor;
		completion: string;
		onDiscard: () => void;
	} = $props();

	const selection = $derived(editor.state.selection);

	function handleReplace() {
		const { from, to } = selection;
		editor
			.chain()
			.focus()
			.insertContentAt({ from, to }, completion)
			.run();
	}

	function handleInsertBelow() {
		editor.chain().focus().insertContentAt(selection.to + 1, completion).run();
	}
</script>

<Command.Group>
	<Command.Item value="replace" onSelect={handleReplace}>
		<Check class="text-muted-foreground" />
		Replace selection
	</Command.Item>
	<Command.Item value="insert" onSelect={handleInsertBelow}>
		<TextQuote class="text-muted-foreground" />
		Insert below
	</Command.Item>
</Command.Group>
<Command.Separator />
<Command.Group>
	<Command.Item value="thrash" onSelect={onDiscard}>
		<TrashIcon class="text-muted-foreground" />
		Discard
	</Command.Item>
</Command.Group>
