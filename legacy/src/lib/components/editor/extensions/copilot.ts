/**
 * Enhanced Copilot Extension — EdApex
 *
 * Multi-trigger, context-aware ghost-text completion for the Tiptap editor.
 * Upgrades the previous single-trigger (Mod-Space) implementation with:
 *
 *   1. **Multi-source triggers**
 *      - `Mod-Space` keyboard shortcut (existing)
 *      - Slash command `/continue` typed at the start of a line
 *      - Toolbar/bubble ✨ button via `triggerCopilot` command (existing)
 *      - Auto-debounce 1500ms after typing pause at sentence-end (toggleable)
 *
 *   2. **gatherContext()**
 *      Collects metadata for richer system prompts:
 *      - `cursorText` — last 2000 chars before cursor (was 1000)
 *      - `paragraphContext` — surrounding paragraph structure
 *      - `documentTitle`, `documentHeaders` — from window context + doc scan
 *      - `studentName`, `examType`, `subject` — from window.__editorMentionCtx
 *      - `cursorPosition` — heuristic: paragraph-start | sentence-mid | sentence-end | paragraph-end
 *
 *   3. **Smart prompt builder**
 *      Branches the prompt template on `cursorPosition` so the model
 *      knows whether to start a new paragraph, continue mid-sentence, etc.
 *
 *   4. **Context payload**
 *      Sends the gathered context alongside the prompt to /api/ai/editor/copilot
 *      so the server-side agent can build an even richer system message.
 *
 * Abort handling preserved: each new completion cancels the previous request.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { mount, unmount } from 'svelte';
import CopilotWidget from '../CopilotWidget.svelte';
import type { EditorCursorPosition } from '$lib/server/mastra/editor/schemas';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		copilot: {
			triggerCopilot: () => ReturnType;
			clearCopilot: () => ReturnType;
		};
	}
}

export const copilotPluginKey = new PluginKey('copilot');

export interface CopilotOptions {
	api: string;
	autoTriggerMs?: number;
}

interface CopilotState {
	decoration: Decoration | null;
	text: string | null;
	active: boolean;
	thinking: boolean;
	mode: 'idle' | 'debouncing' | 'fetching' | 'streaming';
}

interface GatheredContext {
	cursorText: string;
	documentTitle: string;
	documentHeaders: string[];
	studentName: string | null;
	examType: string | null;
	subject: string | null;
	cursorPosition: EditorCursorPosition;
}

const SLASH_TRIGGER = '/continue';

function detectCursorPosition(editor: Editor): EditorCursorPosition {
	const { from } = editor.state.selection;
	const lookback = editor.state.doc.textBetween(Math.max(0, from - 8), from, '');
	if (lookback.trim() === '') return 'paragraph-start';
	if (/[.!?]\s*$/.test(lookback)) return 'sentence-end';
	if (/\s+$/.test(lookback)) return 'paragraph-end';
	return 'sentence-mid';
}

function gatherContext(editor: Editor): GatheredContext {
	const { from } = editor.state.selection;
	const start = Math.max(0, from - 2000);
	const cursorText = editor.state.doc.textBetween(start, from, '\n');

	const ctx = ((window as unknown) as { __editorMentionCtx?: Record<string, unknown> })
		.__editorMentionCtx;

	const documentHeaders: string[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === 'heading' && node.attrs.level <= 3) {
			documentHeaders.push(node.textContent);
		}
	});

	return {
		cursorText,
		documentTitle: (ctx?.documentTitle as string | undefined) ?? '',
		documentHeaders,
		studentName: (ctx?.studentName as string | null | undefined) ?? null,
		examType: (ctx?.examType as string | null | undefined) ?? null,
		subject: (ctx?.subject as string | null | undefined) ?? null,
		cursorPosition: detectCursorPosition(editor),
	};
}

function buildSmartPrompt(context: GatheredContext): string {
	const { cursorPosition, cursorText } = context;
	const baseInstruction =
		'Continue the text naturally in ≤15 words, ending at a clause break. ' +
		'Maintain tone. Do not repeat the given text. If context is insufficient, return "0".';

	const positionHint: Record<EditorCursorPosition, string> = {
		'paragraph-start': 'Begin a new paragraph that flows naturally from the previous text.',
		'sentence-mid': 'Complete the current sentence naturally, mid-clause.',
		'sentence-end': 'Begin a new sentence that flows naturally from the previous one.',
		'paragraph-end': 'Begin a new paragraph that flows naturally from the previous one.',
	};

	return `${positionHint[cursorPosition]} ${baseInstruction}\n\n"""\n${cursorText}\n"""`;
}

function buildSmartSystem(context: GatheredContext): string {
	const parts: string[] = [];
	parts.push('You are a concise writing assistant. Output ≤15 words ending at a clause break.');
	if (context.studentName) parts.push(`You are continuing a marksheet for student: ${context.studentName}.`);
	if (context.examType) parts.push(`Exam type: ${context.examType}.`);
	if (context.subject) parts.push(`Subject: ${context.subject}.`);
	if (context.documentHeaders.length > 0) {
		parts.push(`Document sections so far: ${context.documentHeaders.join(' | ')}.`);
	}
	parts.push('Do not repeat input. If context is insufficient, return "0".');
	return parts.join(' ');
}

export const CopilotExtension = Extension.create<CopilotOptions>({
	name: 'copilot',

	addOptions() {
		return {
			api: '/api/ai/editor/copilot',
			autoTriggerMs: 1500,
		};
	},

	addProseMirrorPlugins() {
		const options = this.options;
		return [
			new Plugin<CopilotState>({
				key: copilotPluginKey,
				state: {
					init() {
						return {
							decoration: null,
							text: null,
							active: false,
							thinking: false,
							mode: 'idle',
						};
					},
					apply(tr, value, oldState, newState) {
						const meta = tr.getMeta(copilotPluginKey);

						if (meta) {
							if (meta.action === 'set') {
								const decoration = Decoration.widget(newState.selection.to, (view) => {
									const dom = document.createElement('span');
									const component = mount(CopilotWidget, {
										target: dom,
										props: {
											text: meta.text,
											thinking: false,
											onAccept: () => {
												const editor = (view as unknown as { editor?: Editor }).editor;
												const tx = view.state.tr;
												tx.setMeta(copilotPluginKey, { action: 'clear' });
												view.dispatch(tx);
												if (editor) {
													editor.commands.insertContent(meta.text);
												}
											},
											onDiscard: () => {
												const tx = view.state.tr;
												tx.setMeta(copilotPluginKey, { action: 'clear' });
												view.dispatch(tx);
											},
										},
									});
									(dom as unknown as { __svelte_component: ReturnType<typeof mount> }).__svelte_component =
										component;
									return dom;
								}, {
									side: 1,
									ignoreSelection: true,
									destroy: (dom) => {
										const cmp = (dom as unknown as { __svelte_component?: ReturnType<typeof mount> })
											.__svelte_component;
										if (cmp) unmount(cmp);
									},
								});

								return {
									decoration,
									text: meta.text,
									active: true,
									thinking: false,
									mode: 'streaming',
								};
							}
							if (meta.action === 'clear') {
								return { decoration: null, text: null, active: false, thinking: false, mode: 'idle' };
							}
							if (meta.action === 'thinking') {
								return { ...value, thinking: true, active: true, mode: 'fetching' };
							}
							if (meta.action === 'debouncing') {
								return { ...value, thinking: true, active: true, mode: 'debouncing' };
							}
						}

						// Any doc change or selection move clears the ghost text and resets state.
						if (tr.docChanged || tr.selectionSet) {
							return { decoration: null, text: null, active: false, thinking: false, mode: 'idle' };
						}

						return value;
					},
				},
				props: {
					decorations(state) {
						const { decoration } = this.getState(state) || {};
						if (decoration) return DecorationSet.create(state.doc, [decoration]);
						return DecorationSet.empty;
					},
					handleKeyDown(view, event) {
						const state = this.getState(view.state);
						if (state?.active) {
							if (event.key === 'Tab') {
								event.preventDefault();
								event.stopPropagation();
								const ghostText = state.text || '';
								const tx = view.state.tr;
								tx.setMeta(copilotPluginKey, { action: 'clear' });
								view.dispatch(tx);
								const editor = (view as unknown as { editor?: Editor }).editor;
								if (editor) {
									editor.commands.insertContent(ghostText);
								}
								return true;
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								const tx = view.state.tr;
								tx.setMeta(copilotPluginKey, { action: 'clear' });
								view.dispatch(tx);
								return true;
							}
						}

						// Slash command trigger: typing "/continue" at start of line fires copilot.
						if (event.key === ' ' || event.key === 'Enter') {
							const { $from } = view.state.selection;
							const lineStart = $from.start();
							const lineBefore = view.state.doc.textBetween(lineStart, $from.pos, '\n', '\n');
							if (lineBefore.trim() === SLASH_TRIGGER) {
								event.preventDefault();
								const tx = view.state.tr.delete(lineStart, $from.pos);
								view.dispatch(tx);
								const editor = (view as unknown as { editor?: Editor }).editor;
								if (editor) {
									fetchCompletion(editor, options);
								}
								return true;
							}
						}

						return false;
					},
				},
			}),
		];
	},

	addStorage() {
		return {
			abortController: null as AbortController | null,
			autoTriggerTimer: null as ReturnType<typeof setTimeout> | null,
		};
	},

	addCommands() {
		return {
			clearCopilot: () => ({ tr, dispatch }: { tr: unknown; dispatch: unknown }) => {
				if (typeof dispatch === 'function') {
					(tr as { setMeta: (key: PluginKey, meta: unknown) => unknown }).setMeta(
						copilotPluginKey,
						{ action: 'clear' },
					);
				}
				return true;
			},
			triggerCopilot: () => ({ editor }: { editor: Editor }) => {
				fetchCompletion(editor, this.options);
				return true;
			},
		} as unknown as Record<string, (...args: unknown[]) => boolean>;
	},

	addKeyboardShortcuts() {
		return {
			'Mod-Space': () => this.editor.commands.triggerCopilot(),
		};
	},

	onSelectionUpdate() {
		const storage = this.storage as { autoTriggerTimer: ReturnType<typeof setTimeout> | null };
		const ms = this.options.autoTriggerMs ?? 1500;
		const ctx = gatherContext(this.editor);

		if (storage.autoTriggerTimer) {
			clearTimeout(storage.autoTriggerTimer);
			storage.autoTriggerTimer = null;
		}

		if (ctx.cursorPosition !== 'sentence-end') return;
		if (!ctx.cursorText.trim()) return;

		const tx = this.editor.state.tr.setMeta(copilotPluginKey, { action: 'debouncing' });
		this.editor.view.dispatch(tx);

		storage.autoTriggerTimer = setTimeout(() => {
			storage.autoTriggerTimer = null;
			if (this.editor.isDestroyed) return;
			fetchCompletion(this.editor, this.options);
		}, ms);
	},

	onDestroy() {
		const storage = this.storage as {
			abortController: AbortController | null;
			autoTriggerTimer: ReturnType<typeof setTimeout> | null;
		};
		if (storage.abortController) storage.abortController.abort();
		if (storage.autoTriggerTimer) clearTimeout(storage.autoTriggerTimer);
	},
});

function isMenuOpen(editor: Editor): boolean {
	if (!editor.isFocused) return true;
	const dom = editor.view.dom as HTMLElement | undefined;
	if (!dom) return false;
	return Boolean(
		dom.querySelector('[data-tiptap-slash-menu]') ||
			dom.querySelector('[data-tiptap-mention-menu]') ||
			dom.querySelector('.tippy-box[data-reference]') ||
			dom.querySelector('[role="menu"][data-state="open"]'),
	);
}

async function fetchCompletion(editor: Editor, options: CopilotOptions) {
	if (!editor || isMenuOpen(editor)) return;

	const { selection } = editor.state;
	if (!selection.empty) return;

	const $pos = selection.$anchor;
	const nodeBefore = $pos.nodeBefore;
	if (!nodeBefore || !nodeBefore.isText) return;

	const context = gatherContext(editor);
	if (!context.cursorText.trim()) return;

	{
		const tx = editor.state.tr.setMeta(copilotPluginKey, { action: 'thinking' });
		editor.view.dispatch(tx);
	}

	const storage = (editor.storage as { copilot?: { abortController: AbortController | null } }).copilot;
	if (storage?.abortController) storage.abortController.abort();
	const controller = new AbortController();
	if (storage) storage.abortController = controller;

	try {
		const response = await fetch(options.api, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: buildSmartPrompt(context),
				system: buildSmartSystem(context),
				context: {
					cursorText: context.cursorText,
					documentTitle: context.documentTitle || undefined,
					documentHeaders: context.documentHeaders.length > 0 ? context.documentHeaders : undefined,
					studentName: context.studentName ?? undefined,
					examType: context.examType ?? undefined,
					subject: context.subject ?? undefined,
					cursorPosition: context.cursorPosition,
				},
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			editor.commands.clearCopilot();
			return;
		}

		const data = (await response.json()) as { text?: string };
		const text = data.text;
		if (!text || text === '0') {
			editor.commands.clearCopilot();
			return;
		}

		const prevChar = editor.state.doc.textBetween(Math.max(0, $pos.pos - 1), $pos.pos, ' ');
		const hasSpaceBefore = prevChar ? /^\s$/.test(prevChar) : true;

		let cleanText = text;
		if (hasSpaceBefore) {
			cleanText = text.trimStart();
		} else if (text.match(/^\s/)) {
			cleanText = text;
		} else if (text.match(/^[a-zA-Z0-9]/)) {
			cleanText = ' ' + text;
		}

		const tx = editor.state.tr.setMeta(copilotPluginKey, { action: 'set', text: cleanText });
		editor.view.dispatch(tx);
	} catch (error: unknown) {
		const err = error as { name?: string };
		if (err.name !== 'AbortError') {
			console.error('Copilot completion failed:', error);
		}
		editor.commands.clearCopilot();
	}
}
