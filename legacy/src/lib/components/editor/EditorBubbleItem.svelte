<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Editor } from "@tiptap/core";

	/**
	 * EditorBubbleItem — wrapper component for items inside the editor's
	 * bubble menu (svelte-tiptap's `BubbleMenu`). Ported from Novel.sh's
	 * `packages/headless/src/components/editor-bubble-item.tsx`.
	 *
	 * The wrapper handles the click → onSelect(editor) handoff and applies
	 * the shared hover/focus/active styling so consumers (NodeSelector,
	 * TextButtons, LinkSelector, etc.) only need to render their icon and
	 * any active-state color (novel uses `text-blue-500` when
	 * `item.isActive(editor)` is true).
	 *
	 * Usage:
	 *   <EditorBubbleItem {editor} onSelect={(e) => e.chain().focus().toggleBold().run()}>
	 *     <BoldIcon class="h-4 w-4 {editor.isActive('bold') ? 'text-blue-500' : ''}" />
	 *   </EditorBubbleItem>
	 */
	let {
		editor,
		onSelect,
		class: className = "",
		children,
	}: {
		editor: Editor;
		onSelect: (editor: Editor) => void;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	data-slot="editor-bubble-item"
	class="inline-flex h-8 w-8 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-all duration-150 {className}"
	onclick={() => onSelect(editor)}
>
	{@render children()}
</button>
