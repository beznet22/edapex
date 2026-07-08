<script module lang="ts">
	// DragHandle — six-dot block drag handle for the Tiptap editor.
	// Wraps the tiptap-extension-global-drag-handle community extension
	// (npm: tiptap-extension-global-drag-handle ^0.1.16, installed v0.1.18).
	// The library's default export is an already-instantiated Extension, so
	// we wrap the named DragHandlePlugin export in our own Extension.create
	// to allow controlled registration in the editor's extensions list.
	// Visibility is driven by CSS @media (container-width < 640px hides it —
	// see the styles in WysiwygEditor.svelte).
	import { Extension } from '@tiptap/core';
	import { DragHandlePlugin } from 'tiptap-extension-global-drag-handle';

	export const dragHandle = Extension.create({
		name: 'globalDragHandle',

		addProseMirrorPlugins() {
			return [
				DragHandlePlugin({
					pluginKey: 'globalDragHandle',
					dragHandleWidth: 20,
					scrollTreshold: 100,
					excludedTags: [],
					customNodes: [],
				}),
			];
		},
	});
</script>
