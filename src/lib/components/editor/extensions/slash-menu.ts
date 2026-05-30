import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';

export interface SlashMenuItem {
	label: string;
	description: string;
	icon: string;
	command: (props: { editor: any; range: any }) => void;
}

export const slashMenuPluginKey = new PluginKey('slashMenu');

const defaultItems: SlashMenuItem[] = [
	{
		label: 'Generate with AI', description: 'Write with AI assistance', icon: 'sparkles',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).run();
			// Dispatch a custom event the parent component can listen to
			editor.view.dom.dispatchEvent(new CustomEvent('ai-generate', { bubbles: true }));
		},
	},
	{
		label: 'Heading 1', description: 'Large heading', icon: 'heading-1',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
	},
	{
		label: 'Heading 2', description: 'Medium heading', icon: 'heading-2',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
	},
	{
		label: 'Heading 3', description: 'Small heading', icon: 'heading-3',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
	},
	{
		label: 'Bullet List', description: 'Unordered list', icon: 'list',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
	},
	{
		label: 'Ordered List', description: 'Numbered list', icon: 'list-ordered',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		label: 'Blockquote', description: 'Quote block', icon: 'quote',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
	},
	{
		label: 'Code Block', description: 'Syntax highlighted', icon: 'code',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
	},
	{
		label: 'Divider', description: 'Horizontal rule', icon: 'minus',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
];

export interface SlashMenuOptions {
	suggestion: Partial<SuggestionOptions<SlashMenuItem>>;
}

export const SlashMenuExtension = Extension.create<SlashMenuOptions>({
	name: 'slashMenu',

	addOptions() {
		return {
			suggestion: {
				char: '/',
				pluginKey: slashMenuPluginKey,
				startOfLine: false,
				items: ({ query }: { query: string }) => {
					if (!query) return defaultItems;
					return defaultItems.filter(item =>
						item.label.toLowerCase().includes(query.toLowerCase()) ||
						item.description.toLowerCase().includes(query.toLowerCase())
					);
				},
				command: ({ editor, range, props }: { editor: any; range: any; props: SlashMenuItem }) => {
					props.command({ editor, range });
				},
				render: () => {
					let popup: HTMLElement | null = null;
					let svelteComponent: Record<string, any> | null = null;

					return {
						onStart(props: SuggestionProps<SlashMenuItem>) {
							popup = document.createElement('div');
							popup.className = 'slash-menu-popup';
							popup.style.position = 'absolute';
							popup.style.zIndex = '50';
							document.body.appendChild(popup);

							updatePosition(popup, props);
							renderMenu(popup, props);
						},
						onUpdate(props: SuggestionProps<SlashMenuItem>) {
							if (!popup) return;
							updatePosition(popup, props);
							// Re-render the menu with updated items/selection
							if (svelteComponent) {
								unmount(svelteComponent);
								svelteComponent = null;
							}
							renderMenu(popup, props);
						},
						onKeyDown(props: { event: KeyboardEvent }) {
							if (props.event.key === 'Escape') {
								return true;
							}
							return false;
						},
						onExit() {
							if (svelteComponent) {
								unmount(svelteComponent);
								svelteComponent = null;
							}
							if (popup) {
								popup.remove();
								popup = null;
							}
						},
					};

					function updatePosition(el: HTMLElement, props: SuggestionProps<SlashMenuItem>) {
						const rect = props.clientRect?.();
						if (!rect) return;
						el.style.left = `${rect.left}px`;
						el.style.top = `${rect.bottom + 8}px`;
					}

					async function renderMenu(container: HTMLElement, props: SuggestionProps<SlashMenuItem>) {
						// Dynamic import to avoid SSR issues with Svelte component
						const { default: SlashMenuPopup } = await import('../WysiwygSlashMenu.svelte');

						svelteComponent = mount(SlashMenuPopup, {
							target: container,
							props: {
								items: props.items,
								selectedIndex: 0,
								onSelect: (item: SlashMenuItem) => {
									props.command(item);
								},
							},
						});
					}
				},
			},
		};
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion,
			}),
		];
	},
});
