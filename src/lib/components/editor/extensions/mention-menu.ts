import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { mount, unmount } from 'svelte';

export interface MentionItem {
	id: string;
	label: string;
	description?: string;
}

export const mentionPluginKey = new PluginKey('mentionMenu');

const defaultMentions: MentionItem[] = [
	{ id: 'studentName', label: 'Student Name', description: 'Inserts current student name' },
	{ id: 'className', label: 'Class Name', description: 'Inserts current class name' },
	{ id: 'date', label: 'Current Date', description: 'Inserts today\'s date' },
	{ id: 'subject', label: 'Subject', description: 'Inserts subject area' },
];

export interface MentionOptions {
	suggestion: Partial<SuggestionOptions<MentionItem>>;
}

export const MentionExtension = Extension.create<MentionOptions>({
	name: 'mentionMenu',

	addOptions() {
		return {
			suggestion: {
				char: '@',
				pluginKey: mentionPluginKey,
				startOfLine: false,
				items: ({ query }: { query: string }) => {
					if (!query) return defaultMentions;
					return defaultMentions.filter(item =>
						item.label.toLowerCase().includes(query.toLowerCase())
					);
				},
				command: ({ editor, range, props }: { editor: any; range: any; props: MentionItem }) => {
					// Increase range.to by one when the previous node is a text node.
					const nodeBefore = editor.view.state.selection.$from.nodeBefore;
					if (nodeBefore && nodeBefore.isText) {
						// This ensures we properly replace the `@query` text
					}
					
					editor
						.chain()
						.focus()
						.insertContentAt(range, [
							{
								type: 'text',
								text: `{{${props.id}}}`, // We insert it as a raw variable template for now
								marks: [{ type: 'bold' }], // Bold it to make it stand out
							},
							{
								type: 'text',
								text: ' ',
							},
						])
						.run();
				},
				render: () => {
					let popup: HTMLElement | null = null;
					let svelteComponent: Record<string, any> | null = null;

					return {
						onStart(props: SuggestionProps<MentionItem>) {
							popup = document.createElement('div');
							popup.className = 'mention-menu-popup';
							popup.style.position = 'absolute';
							popup.style.zIndex = '50';
							document.body.appendChild(popup);

							updatePosition(popup, props);
							renderMenu(popup, props);
						},
						onUpdate(props: SuggestionProps<MentionItem>) {
							if (!popup) return;
							updatePosition(popup, props);
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

					function updatePosition(el: HTMLElement, props: SuggestionProps<MentionItem>) {
						const rect = props.clientRect?.();
						if (!rect) return;
						el.style.left = `${rect.left}px`;
						el.style.top = `${rect.bottom + 8}px`;
					}

					async function renderMenu(container: HTMLElement, props: SuggestionProps<MentionItem>) {
						// Reuse the same popup UI but with our mention items format
						const { default: SlashMenuPopup } = await import('../WysiwygSlashMenu.svelte');

						// Map the MentionItem to SlashMenuItem shape for the generic UI component
						const mappedItems = props.items.map(m => ({
							label: m.label,
							description: m.description || '',
							icon: 'minus', // Fallback icon
							command: () => props.command(m),
						}));

						svelteComponent = mount(SlashMenuPopup, {
							target: container,
							props: {
								items: mappedItems,
								selectedIndex: 0,
								onSelect: (item: any) => {
									item.command();
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
