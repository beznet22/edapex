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
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import MentionSuggestionList from '../MentionSuggestions.svelte';

export interface MentionSearchResult {
	id: number | string;
	name: string;
	category: string;
	typeBadge: string;
	parentContext?: string;
	/**
	 * Structured fields for `students` mentions. Populated by the backend
	 * /api/mentions/search endpoint and threaded through to the mention
	 * node attrs so the markdown serialization can write the MAPPED format
	 * `{{studentName:<fullName>|student:<id>|admissionNo:<num>}}` directly
	 * without an extra lookup round-trip.
	 */
	admissionNo?: string;
	studentId?: number;
	studentName?: string;
	/** File size in bytes (file category only). */
	size?: number;
	/** Absolute path on the file API for download/preview (file category only). */
	url?: string;
	/** Best-effort MIME-type guess (file category only). */
	mimeType?: string;
	/** Resolved exam-type title for paths under `exams/examType-N/`. */
	examTypeTitle?: string | null;
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
		designationId: ctx?.designationId ?? ALLOWED_DESIGNATIONS.IT,
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
			// Structured fields for `students` mentions — embedded in the markdown
			// as `{{studentName:<fullName>|student:<id>|admissionNo:<num>}}` so
			// the backend workflow can resolve the document to a `sm_students`
			// row without an extra lookup round-trip, AND so the markdown stays
			// human-readable when viewed outside the editor. Populated by the
			// mention-menu command when a student row is picked from the list.
			studentName: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute('data-student-name'),
				renderHTML: (attrs: { studentName: string | null }) =>
					attrs.studentName ? { 'data-student-name': attrs.studentName } : {},
			},
			admissionNo: {
				default: null,
				parseHTML: (el: HTMLElement) => el.getAttribute('data-admission-no'),
				renderHTML: (attrs: { admissionNo: string | number | null }) =>
					attrs.admissionNo != null && attrs.admissionNo !== ''
						? { 'data-admission-no': String(attrs.admissionNo) }
						: {},
			},
			studentId: {
				default: null,
				parseHTML: (el: HTMLElement) => {
					const raw = el.getAttribute('data-student-id');
					return raw == null ? null : Number(raw);
				},
				renderHTML: (attrs: { studentId: number | null }) =>
					attrs.studentId != null ? { 'data-student-id': String(attrs.studentId) } : {},
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
		const attrs = node.attrs as {
			id: string | null;
			label: string | null;
			category: string | null;
			studentName: string | null;
		};
		// Render the mention as plain text `@<label>` so the markdown the user
		// sees reads naturally: `@John Doe`, `@2026`, `@First term`. The
		// structured data (id, category, admissionNo, studentName) is preserved
		// in the editor's internal attrs and used by the backend resolver for
		// entity lookups — the markdown text is purely for human consumption.
		const label = attrs.label ?? attrs.studentName ?? attrs.id ?? '';
		return label ? `@${label}` : '';
	},

	renderHTML({ node, HTMLAttributes }: any) {
		const attrs = node.attrs as {
			id: string | null;
			label: string | null;
			category: string | null;
			admissionNo: string | number | null;
			studentId: number | null;
			studentName: string | null;
		};
		const label = attrs.label ?? attrs.id ?? '';
		const htmlAttrs: Record<string, string> = {
			...HTMLAttributes,
			'data-type': 'mention',
			'data-id': attrs.id ?? '',
			'data-label': attrs.label ?? '',
			'data-category': attrs.category ?? '',
			class: 'mention',
		};
		if (attrs.admissionNo != null && attrs.admissionNo !== '') {
			htmlAttrs['data-admission-no'] = String(attrs.admissionNo);
		}
		if (attrs.studentId != null) htmlAttrs['data-student-id'] = String(attrs.studentId);
		if (attrs.studentName) htmlAttrs['data-student-name'] = attrs.studentName;
		return ['span', htmlAttrs, label];
	},

	addStorage() {
		return {
			markdown: {
				serialize(state: { write: (s: string) => void }, node: { attrs: { id: string | null; label: string | null; category: string | null; admissionNo: string | number | null; studentId: number | null; studentName: string | null } }) {
					const attrs = node.attrs;
					const label = attrs.label ?? attrs.studentName ?? attrs.id ?? '';
					if (!label) return;
					// Serialize as an HTML inline `<span>` with the structured
					// data as data-* attributes. Tiptap preserves the span
					// during markdown round-trips so the backend resolver can
					// extract id/category/admissionNo/studentName without a
					// name-based lookup. The span content is `@<label>` so the
					// user sees plain text when the markdown is rendered.
					const spanAttrs = [
						`data-type="mention"`,
						`data-id="${escapeHtml(attrs.id ?? label)}"`,
						`data-label="${escapeHtml(label)}"`,
						`data-category="${escapeHtml(attrs.category ?? 'custom')}"`,
					];
					if (attrs.admissionNo != null && attrs.admissionNo !== '') {
						spanAttrs.push(`data-admission-no="${escapeHtml(String(attrs.admissionNo))}"`);
					}
					if (attrs.studentId != null) {
						spanAttrs.push(`data-student-id="${escapeHtml(String(attrs.studentId))}"`);
					}
					if (attrs.studentName) {
						spanAttrs.push(`data-student-name="${escapeHtml(attrs.studentName)}"`);
					}
					state.write(`<span ${spanAttrs.join(' ')}>@${escapeHtml(label)}</span>`);
				},
				parse: {
					setup(md: { inline: { ruler: { after: (name: string, ruleName: string, fn: (state: any, silent: boolean) => boolean) => void } } }) {
						md.inline.ruler.after('emphasis', 'mention_inline', (state: any, silent: boolean) => {
							const start = state.pos;
							const src = state.src;
							// Match the structured `<span data-type="mention" ...>@<label></span>`
							// form first — this is the round-tripped output of our
							// serialize function and carries the full structured
							// context (id, category, admissionNo, studentName).
							const spanMatch = src.slice(start).match(/^<span\s+([^>]*data-type="mention"[^>]*)>@([^<]+)<\/span>/);
							if (spanMatch) {
								const attrString = spanMatch[1];
								const label = spanMatch[2];
								const get = (key: string): string | null => {
									const m = attrString.match(new RegExp(`data-${key}="([^"]*)"`));
									return m ? m[1] : null;
								};
								const id = get('id') ?? label;
								const category = get('category') ?? 'custom';
								const admissionNo = get('admission-no');
								const studentNameRaw = get('student-name');
								const studentIdRaw = get('student-id');
								const studentId = studentIdRaw != null ? Number(studentIdRaw) : null;
								if (silent) return true;
								const token = state.push('html_inline', '', 0);
								const spanAttrs = [
									`data-type="mention"`,
									`data-id="${escapeHtml(id)}"`,
									`data-label="${escapeHtml(label)}"`,
									`data-category="${escapeHtml(category)}"`,
								];
								if (admissionNo) spanAttrs.push(`data-admission-no="${escapeHtml(admissionNo)}"`);
								if (studentId != null && Number.isFinite(studentId)) spanAttrs.push(`data-student-id="${escapeHtml(String(studentId))}"`);
								if (studentNameRaw) spanAttrs.push(`data-student-name="${escapeHtml(studentNameRaw)}"`);
								token.content = `<span ${spanAttrs.join(' ')}>@${escapeHtml(label)}</span>`;
								state.pos = start + spanMatch[0].length;
								return true;
							}

							// Legacy fallback: match plain `@<label>` for backward
							// compat with documents written before the HTML span
							// format was introduced. The backend resolver upgrades
							// these via name-based lookup.
							if (src.charAt(start) !== '@') return false;
							if (start > 0) {
								const prev = src.charAt(start - 1);
								if (prev !== ' ' && prev !== '\t' && prev !== '\n' && prev !== '\r') {
									return false;
								}
							}
							const rest = src.slice(start + 1);
							const labelMatch = rest.match(/^[^\s@]+/);
							if (!labelMatch) return false;
							const label = labelMatch[0];
							if (!label) return false;
							if (silent) return true;
							const token = state.push('html_inline', '', 0);
							token.content = `<span data-type="mention" data-id="${escapeHtml(label)}" data-label="${escapeHtml(label)}" data-category="custom">@${escapeHtml(label)}</span>`;
							state.pos = start + 1 + label.length;
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
		// Set to `null` (the whole option, not an array containing null) so
		// the `@` trigger fires anywhere — including at the start of a line
		// or right after deleting an existing student name / term / year.
		// Previously restricted to `[' ']`, which silently failed: the popup
		// never opened and the user was forced to keep the original text in
		// the document alongside the mention. Tiptap's check is
		// `allowedPrefixes === null` (whole value), so `[' ', null]` is
		// equivalent to `[' ']` — the null element is ignored.
		//
		// Trade-off: `@` also fires inside email addresses (e.g. typing
		// `@example` in `john@example.com` opens the popup). The user can
		// press Escape to dismiss. The parse.setup already guards against
		// email false positives in the markdown itself by requiring the
		// previous char to be whitespace or start-of-document.
		allowedPrefixes: null,
		startOfLine: false,
		items: async ({ query }: { query: string }) => {
			try {
				const params = new URLSearchParams({ q: query, limit: '10' });
				const ctx = getMentionCtx();
				if (ctx.selectedClassId != null) params.set('classId', String(ctx.selectedClassId));
				if (ctx.selectedSectionId != null) params.set('sectionId', String(ctx.selectedSectionId));

				// Smart category routing — strip the keyword prefix from the search
				// query and send it as a routing directive, otherwise the backend
				// filter rejects every result (e.g. "year" doesn't appear in "2024-2025",
				// so `academic_year` filter `includes("year")` matches nothing).
				//
				// Behavior:
				//   @               -> q='', category='students'        → all students
				//   @year           -> q='', category='academic_year'   → all academic years
				//   @year 2025      -> q='2025', category='academic_year' → years matching "2025"
				//   @term           -> q='', category='exam'            → all exam types
				//   @term mid       -> q='mid', category='exam'         → exam types matching "mid"
				//   @class          -> q='', category='class_section'   → all class-section combos
				//   @class A        -> q='A', category='class_section'  → classes/sections matching "A"
				//   @adm            -> q='', category='students'        → all students (sorted by adm)
				//   @adm 123        -> q='123', category='students'     → students whose name or adm# matches "123"
				//   @anything else  -> q=<original>, no category        → default multi-category search
				const trimmedQuery = query.trim().toLowerCase();
				let actualQuery = query;
				let categoryToSend: string | null = null;

				if (trimmedQuery === '') {
					categoryToSend = 'students';
					actualQuery = '';
				} else if (trimmedQuery === 'year' || trimmedQuery.startsWith('year ')) {
					categoryToSend = 'academic_year';
					actualQuery = trimmedQuery.startsWith('year ')
						? trimmedQuery.slice('year '.length).trim()
						: '';
				} else if (trimmedQuery === 'term' || trimmedQuery.startsWith('term ')) {
					categoryToSend = 'exam';
					actualQuery = trimmedQuery.startsWith('term ')
						? trimmedQuery.slice('term '.length).trim()
						: '';
				} else if (trimmedQuery === 'class' || trimmedQuery.startsWith('class ')) {
					categoryToSend = 'class_section';
					actualQuery = trimmedQuery.startsWith('class ')
						? trimmedQuery.slice('class '.length).trim()
						: '';
				} else if (trimmedQuery === 'adm' || trimmedQuery.startsWith('adm')) {
					categoryToSend = 'students';
					actualQuery = trimmedQuery === 'adm' ? '' : trimmedQuery.replace(/^adm#?\s*/, '').trim();
				}

				params.set('q', actualQuery);
				if (categoryToSend != null) params.set('category', categoryToSend);

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
			const isStudent = mention.category === 'students';
			// The Tiptap suggestion plugin sometimes passes a range that
			// doesn't include the `@` trigger character — e.g. when the user
			// types `@` (empty query), opens the popup, and selects a
			// suggestion. The suggested-plugin's `range.from` can land on the
			// cursor position *after* the `@`, leaving the `@` behind in the
			// document and causing the mention span to serialize with a stray
			// `@` prefix. Extend the range backwards to explicitly include the
			// `@` if it's the character immediately before `range.from` so
			// the deletion is always clean regardless of what the plugin
			// passes.
			const { state } = editor;
			const charBefore = state.doc.textBetween(Math.max(0, range.from - 1), range.from);
			const effectiveRange = charBefore === '@'
				? { from: Math.max(0, range.from - 1), to: range.to }
				: range;
			// Detect @adm trigger by checking the typed text in the range
			const triggerText = state.doc.textBetween(effectiveRange.from, effectiveRange.to).toLowerCase();
			const isAdmTrigger = triggerText.startsWith('@adm');
			const studentLabel = isStudent && mention.admissionNo != null
				? `ADM#${mention.admissionNo}`
				: mention.name;
			const label = isAdmTrigger && isStudent ? studentLabel : mention.name;
			editor
				.chain()
				.focus()
				.deleteRange(effectiveRange)
				.insertContentAt(effectiveRange.from, [
					// FIXME: TEMPORARY WORKAROUND — the Tiptap mention extension's
					// suggestion plugin doesn't reliably include the `@` trigger
					// character in the range it passes to the command function when
					// the user types `@` without any prefix character or query.
					// Despite the `allowedPrefixes: null` fix in #62 and the
					// `effectiveRange` extension in #63, a stray `@` is still
					// occasionally left in the document — which causes the
					// serialized markdown to contain `@<span ...>@<label></span>`
					// instead of just `<span ...>@<label></span>`. To force the
					// mention to be recognized as a complete unit, we wrap the
					// mention node in zero-width spaces (U+200B) on BOTH sides.
					// ZWSPs are invisible to the user (no visual noise), can't
					// be accidentally deleted (user can't see them to target
					// them), survive markdown serialization as text nodes, and
					// act as word boundaries so the mention doesn't merge with
					// adjacent text. This is a workaround, not a fix —
					// investigate the root cause (likely a Tiptap suggestion
					// plugin bug or version incompatibility) and remove the
					// ZWSP wrapping once resolved.
					{
						type: 'text',
						text: '​',
					},
					{
						type: 'mention',
						attrs: {
							id: String(mention.id),
							label,
							category: mention.category,
							// Structured fields for students — embedded in the
							// markdown as `{{studentName:<fullName>|student:<id>|
							// admissionNo:<num>}}` so the backend workflow can
							// resolve the document without an extra lookup.
							studentName: isStudent ? mention.name : null,
							admissionNo: isStudent
								? (mention.admissionNo != null ? String(mention.admissionNo) : null)
								: null,
							studentId: isStudent && typeof mention.studentId === 'number'
								? mention.studentId
								: null,
						},
					},
					{
						type: 'text',
						text: '​',
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
