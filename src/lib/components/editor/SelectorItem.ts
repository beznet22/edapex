import type { Component } from "svelte";
import type { Editor } from "@tiptap/core";

/**
 * SelectorItem — shared type for bubble-menu and toolbar items.
 *
 * Ported from Novel.sh's `apps/web/components/tailwind/selectors/node-selector.tsx`.
 * The selector pattern is uniform across the editor:
 *   - `name`     — display label + value passed to cmdk/CommandItem
 *   - `icon`     — Lucide icon Svelte component (e.g. `BoldIcon` from `@lucide/svelte/icons/bold`)
 *   - `command`  — Tiptap command chain (e.g. toggleBold, setLink)
 *   - `isActive` — predicate for current selection state (highlights active item)
 *
 * Usage:
 *   import BoldIcon from "@lucide/svelte/icons/bold";
 *   const items: SelectorItem[] = [
 *     { name: 'bold', icon: BoldIcon, command: (e) => e.chain().focus().toggleBold().run(),
 *       isActive: (e) => e.isActive('bold') },
 *   ];
 */
export type SelectorItem = {
	name: string;
	icon: Component;
	command: (editor: Editor) => void;
	isActive: (editor: Editor) => boolean;
};
