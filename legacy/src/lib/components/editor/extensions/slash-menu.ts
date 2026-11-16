import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';

export interface SlashMenuItem {
	label: string;
	description: string;
	icon: string;
	command: (props: { editor: any; range: any }) => void;
}

export const slashMenuPluginKey = new PluginKey('slashMenu');

const ICON_PATHS: Record<string, string> = {
	'sparkles':
		'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
	'minus':
		'M5 12h14',
	'list-checks':
		'M3 17h2M3 12h2M3 7h2M8 5l1.5 1.5L13 3M8 12l1.5 1.5L13 10M8 19l1.5 1.5L13 17',
	'text':
		'M4 7V5h16v2M9 5v14m6-14v14M7 19h10',
	'heading-1':
		'M4 5v14M12 5v14M4 12h8M18 5l-3 2v12',
	'heading-2':
		'M4 5v14M12 5v14M4 12h8M16 8a3 3 0 0 1 6 0c0 2-6 4-6 9h6',
	'heading-3':
		'M4 5v14M12 5v14M4 12h8M17 8a3 3 0 0 1 0 6 3 3 0 0 1 0 6h-3l3-6',
	'list':
		'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
	'list-ordered':
		'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
	'quote':
		'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
	'code':
		'M16 18l6-6-6-6M8 6l-6 6 6 6',
	'link':
		'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
};

const defaultItems: SlashMenuItem[] = [
	{
		label: 'Generate text', description: 'Write with AI assistance', icon: 'sparkles',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).run();
			editor.view.dom.dispatchEvent(new CustomEvent('ai-prompt-open', { bubbles: true, detail: { mode: 'generate' } }));
		},
	},
	{
		label: 'Divider', description: 'Horizontal rule', icon: 'minus',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
	{
		label: 'Checklist', description: 'Task list with checkboxes', icon: 'list-checks',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
	},
	{
		label: 'Text', description: 'Plain text paragraph', icon: 'text',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
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
		label: 'Numbered list', description: 'Ordered list', icon: 'list-ordered',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		label: 'Bulleted list', description: 'Unordered list', icon: 'list',
		command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
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
		label: 'Link', description: 'Wrap selection in a link', icon: 'link',
		command: ({ editor, range }) => {
			editor.chain().focus().deleteRange(range).run();
			const existing = (editor.getAttributes('link').href as string | undefined) ?? '';
			const url = window.prompt('URL (leave empty to remove)', existing || 'https://');
			if (url === null) return;
			const { from, to } = editor.state.selection;
			if (url === '') {
				editor.chain().focus().extendMarkRange('link').unsetLink().run();
				return;
			}
			if (from === to) {
				const text = window.prompt('Link text', url);
				if (!text) return;
				editor
					.chain()
					.focus()
					.insertContent({
						type: 'text',
						text,
						marks: [{ type: 'link', attrs: { href: url } }],
					})
					.run();
			} else {
				editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
			}
		},
	},
];

export interface SlashMenuOptions {
	suggestion: Partial<SuggestionOptions<SlashMenuItem>>;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c] as string));
}

function renderPopup(popup: HTMLElement, items: SlashMenuItem[], selectedIndex: number, onSelect: (item: SlashMenuItem) => void) {
	const rows = items.map((item, i) => {
		const isAi = item.icon === 'sparkles';
		const path = ICON_PATHS[item.icon] ?? ICON_PATHS['minus'];
		const separator = isAi && i > 0
			? `<div class="border-t border-border/30 mt-1 pt-1"></div>`
			: '';
		const rowClass = [
			'flex items-center gap-3 px-3 py-2.5 text-left transition-colors w-full group',
			i === selectedIndex ? 'bg-secondary/70' : 'hover:bg-secondary/50',
			isAi ? 'hover:bg-primary/5' : '',
		].filter(Boolean).join(' ');
		const iconClass = [
			'flex items-center justify-center size-8 rounded-lg shrink-0',
			isAi
				? 'bg-primary/10 text-primary'
				: 'bg-secondary/50 text-muted-foreground group-hover:text-foreground',
		].join(' ');
		const labelClass = [
			'text-[13px] font-semibold leading-tight',
			isAi ? 'text-primary' : 'text-foreground/90',
		].join(' ');
		return `${separator}<button class="${rowClass}" data-slash-index="${i}">
			<div class="${iconClass}">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>
			</div>
			<div class="flex flex-col gap-0.5 min-w-0">
				<span class="${labelClass}">${escapeHtml(item.label)}</span>
				<span class="text-[11px] text-muted-foreground/80 leading-tight truncate">${escapeHtml(item.description)}</span>
			</div>
		</button>`;
	}).join('');

	const empty = items.length === 0
		? `<div class="px-3 py-6 text-center text-[12px] text-muted-foreground">No matching commands</div>`
		: '';

	popup.innerHTML = `<div class="bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl w-72 overflow-hidden"><div class="py-1.5 max-h-80 overflow-y-auto">${rows}${empty}</div></div>`;

	popup.querySelectorAll('button[data-slash-index]').forEach((btn) => {
		btn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			const idx = parseInt((btn as HTMLElement).dataset.slashIndex ?? '0', 10);
			onSelect(items[idx]);
		});
	});
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
					const q = query.toLowerCase();
					return defaultItems.filter(item =>
						item.label.toLowerCase().includes(q) ||
						item.description.toLowerCase().includes(q)
					);
				},
				command: ({ editor, range, props }: { editor: any; range: any; props: SlashMenuItem }) => {
					props.command({ editor, range });
				},
				render: () => {
					let popup: HTMLElement | null = null;
					let currentItems: SlashMenuItem[] = [];
					let selectedIndex = 0;
					let currentCommand: ((item: SlashMenuItem) => void) | null = null;

					function updatePosition(props: SuggestionProps<SlashMenuItem>) {
						if (!popup) return;
						const rect = props.clientRect?.();
						if (!rect) return;
						popup.style.left = `${rect.left}px`;
						popup.style.top = `${rect.bottom + 8}px`;
					}

					function rerender() {
						if (!popup) return;
						renderPopup(popup, currentItems, selectedIndex, (item) => {
							currentCommand?.(item);
						});
					}

					return {
						onStart(props: SuggestionProps<SlashMenuItem>) {
							popup = document.createElement('div');
							popup.className = 'slash-menu-popup';
							popup.style.position = 'absolute';
							popup.style.zIndex = '9999';
							document.body.appendChild(popup);

							currentItems = props.items;
							currentCommand = (item) => props.command(item);
							updatePosition(props);
							rerender();
						},
						onUpdate(props: SuggestionProps<SlashMenuItem>) {
							if (!popup) return;
							currentItems = props.items;
							updatePosition(props);
							rerender();
						},
						onKeyDown(props: { event: KeyboardEvent }) {
							if (!popup) return false;
							if (props.event.key === 'ArrowDown') {
								selectedIndex = (selectedIndex + 1) % Math.max(currentItems.length, 1);
								rerender();
								return true;
							}
							if (props.event.key === 'ArrowUp') {
								selectedIndex = (selectedIndex - 1 + currentItems.length) % Math.max(currentItems.length, 1);
								rerender();
								return true;
							}
							if (props.event.key === 'Enter') {
								const item = currentItems[selectedIndex];
								if (item) currentCommand?.(item);
								return true;
							}
							if (props.event.key === 'Escape') {
								return true;
							}
							return false;
						},
						onExit() {
							if (popup) {
								popup.remove();
								popup = null;
							}
							currentItems = [];
							selectedIndex = 0;
							currentCommand = null;
						},
					};
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
