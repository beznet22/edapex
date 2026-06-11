/**
 * Mention Extension — EdApex
 *
 * Provides @mention autocomplete for tenant-scoped entities. Backed by
 * /api/mentions/search (see routes/api/mentions/search/+server.ts), which
 * returns structured results scoped to the user's schoolId.
 *
 * The mention is stored in the document as a Node with attrs { id, label,
 * category }. tiptap-markdown round-trips these to the markdown form
 * `{{category:id}}` so the document remains portable.
 *
 * Implementation note: this module intentionally casts the upstream
 * `@tiptap/extension-mention` extension via `as unknown as` to add custom
 * options (api/designationId/schoolId/classId/sectionId). The Tiptap v3
 * generic constraints on `Mention.extend<Options>()` make it impossible to
 * mix custom options with the real `MentionOptions` shape in TypeScript.
 * The runtime shape is what Tiptap expects; the cast only relaxes compile
 * checks for the configuration we layer on top.
 */
import { Mention } from '@tiptap/extension-mention';
import { mount, unmount } from 'svelte';
import MentionSuggestionList from './mention-suggestion-list.svelte';

export interface MentionSearchResult {
	id: number | string;
	name: string;
	category: string;
	typeBadge: string;
	parentContext?: string;
}

export interface MentionExtensionOptions {
	api: string;
	designationId: number;
	schoolId: number;
	classId: number | null;
	sectionId: number | null;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c] as string));
}

function getMentionCtx(): { designationId: number; selectedClassId: number | null; selectedSectionId: number | null; filterLabel: string } {
	const ctx = (window as any).__editorMentionCtx;
	const classId = ctx?.selectedClassId as number | null | undefined;
	const sectionId = ctx?.selectedSectionId as number | null | undefined;
	const className = ctx?.selectedClassName as string | undefined;
	const sectionName = ctx?.selectedSectionName as string | undefined;
	const filterLabel = className || sectionName
		? `${className ?? ''}${className && sectionName ? ' ' : ''}${sectionName ?? ''}`.trim()
		: '';
	return {
		designationId: ctx?.designationId ?? 1,
		selectedClassId: classId ?? null,
		selectedSectionId: sectionId ?? null,
		filterLabel,
	};
}

function renderSuggestionList(
	container: HTMLElement,
	props: {
		items: MentionSearchResult[];
		command: (item: MentionSearchResult) => void;
		query: string;
		clientRect: (() => DOMRect | null) | null;
		filterLabel?: string;
	}
): { update: (next: typeof props) => void; destroy: () => void } {
	let current: ReturnType<typeof mount> | null = null;
	let selectedIndex = 0;

	function apply(next: typeof props) {
		if (current) unmount(current);
		selectedIndex = 0;
		current = mount(MentionSuggestionList, {
			target: container,
			props: {
				items: next.items,
				selectedIndex,
				query: next.query,
				clientRect: next.clientRect,
				filterLabel: next.filterLabel,
				onSelect: next.command,
				onHover: (i: number) => {
					selectedIndex = i;
				},
			},
		});
	}

	apply(props);
	return {
		update: apply,
		destroy: () => {
			if (current) unmount(current);
			current = null;
		},
	};
}

const baseExtension = Mention.extend({
	name: 'mention',

	addAttributes() {
		return {
			id: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute('data-id'),
				renderHTML: (attrs: { id: string | null }) =>
					attrs.id ? { 'data-id': attrs.id } : {},
			},
			label: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute('data-label'),
				renderHTML: (attrs: { label: string | null }) =>
					attrs.label ? { 'data-label': attrs.label } : {},
			},
			category: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute('data-category'),
				renderHTML: (attrs: { category: string | null }) =>
					attrs.category ? { 'data-category': attrs.category } : {},
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span[data-type="mention"]',
			},
		];
	},

	renderText({ node }: any) {
		const attrs = node.attrs as { id: string | null; category: string | null };
		const id = attrs.id ?? '';
		const category = attrs.category ?? '';
		return `{{${category}:${id}}}`;
	},

	renderHTML({ node, HTMLAttributes }: any) {
		const attrs = node.attrs as { id: string | null; label: string | null; category: string | null };
		const label = attrs.label ?? attrs.id ?? '';
		return [
			'span',
			{
				...HTMLAttributes,
				'data-type': 'mention',
				'data-id': attrs.id,
				'data-label': attrs.label,
				'data-category': attrs.category,
				class: 'mention',
			},
			`@${label}`,
		];
	},

	addStorage() {
		return {
			markdown: {
				serialize(state: { write: (s: string) => void }, node: { attrs: { id: string | null; label: string | null; category: string | null } }) {
					const attrs = node.attrs;
					const id = attrs.id ?? '';
					const category = attrs.category ?? '';
					if (!id) {
						state.write(`@${escapeHtml(attrs.label ?? '')}`);
						return;
					}
					state.write(`{{${category}:${id}}}`);
				},
				parse: {
					setup(md: { inline: { ruler: { after: (name: string, ruleName: string, fn: (state: any, silent: boolean) => boolean) => void } } }) {
						md.inline.ruler.after('emphasis', 'mention_inline', (state: any, silent: boolean) => {
							const start = state.pos;
							const src = state.src;
							if (src.charAt(start) !== '{' || src.charAt(start + 1) !== '{') return false;
							const end = src.indexOf('}}', start + 2);
							if (end === -1) return false;
							const content = src.slice(start + 2, end);
							const colon = content.indexOf(':');
							if (colon < 1) return false;
							const category = content.slice(0, colon).trim();
							const id = content.slice(colon + 1).trim();
							if (!category || !id) return false;
							if (silent) return true;

							const token = state.push('html_inline', '', 0);
							token.content = `<span data-type="mention" data-id="${escapeHtml(id)}" data-label="" data-category="${escapeHtml(category)}">@${escapeHtml(id)}</span>`;
							state.pos = end + 2;
							return true;
						});
					},
				},
			},
		};
	},
});

export const MentionExtension = baseExtension.configure({
	HTMLAttributes: {
		class: 'mention',
	},
	deleteTriggerWithBackspace: true,
	suggestion: {
		char: '@',
		allowSpaces: false,
		allowedPrefixes: [' '],
		startOfLine: false,
		items: async ({ query }: { query: string }) => {
			try {
				const params = new URLSearchParams({ q: query, limit: '10' });
				const ctx = getMentionCtx();
				if (ctx.selectedClassId != null) params.set('classId', String(ctx.selectedClassId));
				if (ctx.selectedSectionId != null) params.set('sectionId', String(ctx.selectedSectionId));
				const res = await fetch(`/api/mentions/search?${params.toString()}`);
				if (!res.ok) return [];
				const data = await res.json();
				return (data.results ?? []) as MentionSearchResult[];
			} catch {
				return [];
			}
		},
		command: ({ editor, range, props }: any) => {
			const mention = props as MentionSearchResult;
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContentAt(range.from, [
					{
						type: 'mention',
						attrs: {
							id: String(mention.id),
							label: mention.name,
							category: mention.category,
						},
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
			let controller: { update: (next: any) => void; destroy: () => void } | null = null;
			let cleanupListeners: (() => void) | null = null;

			function positionPopup() {
				if (!popup) return;
				const getRect = (popup as any).__mentionClientRect as
					| (() => DOMRect | null)
					| null;
				const rect = getRect?.();
				if (!rect || (rect.top === 0 && rect.bottom === 0 && rect.left === 0)) {
					popup.style.display = 'none';
					return;
				}
				// Hide if caret is off-screen (scrolled out of view). The rect is
				// viewport-relative (from getBoundingClientRect), so a negative
				// top or a top past the viewport height means it's not visible.
				if (rect.bottom < 0 || rect.top > window.innerHeight) {
					popup.style.display = 'none';
					return;
				}
				popup.style.display = '';
				popup.style.left = `${rect.left}px`;
				popup.style.top = `${rect.bottom + 6}px`;
			}

			return {
				onStart: (props: any) => {
					popup = document.createElement('div');
					popup.className = 'mention-suggestion-popup';
					popup.style.position = 'fixed';
					popup.style.zIndex = '9999';
					document.body.appendChild(popup);
					(popup as any).__mentionClientRect = props.clientRect ?? null;
					positionPopup();

					// The suggestion plugin re-fires onUpdate on every selection
					// change but NOT on raw scroll/resize. Reposition on those
					// events so the popup follows the caret if the user scrolls
					// while it's open.
					const onScrollOrResize = () => positionPopup();
					window.addEventListener('scroll', onScrollOrResize, true);
					window.addEventListener('resize', onScrollOrResize);
					cleanupListeners = () => {
						window.removeEventListener('scroll', onScrollOrResize, true);
						window.removeEventListener('resize', onScrollOrResize);
					};

					controller = renderSuggestionList(popup, {
						items: props.items,
						command: (item) => props.command(item),
						query: props.query,
						clientRect: props.clientRect ?? null,
						filterLabel: getMentionCtx().filterLabel,
					});
				},
				onUpdate: (props: any) => {
					if (!controller || !popup) return;
					(popup as any).__mentionClientRect = props.clientRect ?? null;
					positionPopup();
					controller.update({
						items: props.items,
						command: (item: MentionSearchResult) => props.command(item),
						query: props.query,
						clientRect: props.clientRect ?? null,
						filterLabel: getMentionCtx().filterLabel,
					});
				},
				onKeyDown: (props: { event: KeyboardEvent }) => {
					if (props.event.key === 'Escape') {
						if (controller) {
							controller.destroy();
							controller = null;
						}
						if (popup) {
							popup.remove();
							popup = null;
						}
						cleanupListeners?.();
						cleanupListeners = null;
						return true;
					}
					return false;
				},
				onExit: () => {
					if (controller) {
						controller.destroy();
						controller = null;
					}
					if (popup) {
						popup.remove();
						popup = null;
					}
					cleanupListeners?.();
					cleanupListeners = null;
				},
			};
		},
	} as any,
});
