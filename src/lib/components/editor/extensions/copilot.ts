import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { mount, unmount } from 'svelte';
import CopilotWidget from '../CopilotWidget.svelte';

export const copilotPluginKey = new PluginKey('copilot');

export interface CopilotOptions {
	api: string;
}

interface CopilotState {
	decoration: Decoration | null;
	text: string | null;
	active: boolean;
	thinking: boolean;
}

export const CopilotExtension = Extension.create<CopilotOptions>({
	name: 'copilot',

	addOptions() {
		return {
			api: '/api/ai/editor/copilot'
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<CopilotState>({
				key: copilotPluginKey,
				state: {
					init() {
						return { decoration: null, text: null, active: false, thinking: false };
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
												const editor = (view as any).editor;
												const { tr } = view.state;
												tr.setMeta(copilotPluginKey, { action: 'clear' });
												view.dispatch(tr);
												if (editor) {
													editor.commands.insertContent(meta.text);
												}
											},
											onDiscard: () => {
												const { tr } = view.state;
												tr.setMeta(copilotPluginKey, { action: 'clear' });
												view.dispatch(tr);
											}
										}
									});
									(dom as any).__svelte_component = component;
									return dom;
								}, {
									side: 1,
									ignoreSelection: true,
									destroy: (dom) => {
										if ((dom as any).__svelte_component) {
											unmount((dom as any).__svelte_component);
										}
									}
								});

								return { decoration, text: meta.text, active: true, thinking: false };
							}
							if (meta.action === 'clear') {
								return { decoration: null, text: null, active: false, thinking: false };
							}
							if (meta.action === 'thinking') {
								return { ...value, thinking: true, active: true };
							}
						}

						// Any doc change or selection move clears the ghost text and thinking state.
						if (tr.docChanged || tr.selectionSet) {
							return { decoration: null, text: null, active: false, thinking: false };
						}

						return value;
					}
				},
				props: {
					decorations(state) {
						const { decoration } = this.getState(state) || {};
						if (decoration) return DecorationSet.create(state.doc, [decoration]);
						return DecorationSet.empty;
					},
					handleKeyDown(view, event) {
						const state = this.getState(view.state);
						if (!state?.active) return false;

						if (event.key === 'Tab') {
							event.preventDefault();
							event.stopPropagation();

							const ghostText = state.text || '';
							const { tr } = view.state;
							tr.setMeta(copilotPluginKey, { action: 'clear' });
							view.dispatch(tr);

							const editor = (view as any).editor;
							if (editor) {
								editor.commands.insertContent(ghostText);
							}
							return true;
						}

						if (event.key === 'Escape') {
							event.preventDefault();
							const { tr } = view.state;
							tr.setMeta(copilotPluginKey, { action: 'clear' });
							view.dispatch(tr);
							return true;
						}

						return false;
					}
				}
			})
		];
	},

	addStorage() {
		return {
			abortController: null as AbortController | null
		};
	},

	addCommands() {
		return {
			clearCopilot: () => ({ tr, dispatch }: { tr: any; dispatch: any }) => {
				if (dispatch) {
					tr.setMeta(copilotPluginKey, { action: 'clear' });
				}
				return true;
			},
			triggerCopilot: () => ({ editor }: { editor: any }) => {
				fetchCompletion(editor, this.storage, this.options);
				return true;
			}
		} as any;
	},

	addKeyboardShortcuts() {
		return {
			'Mod-Space': () => (this.editor.commands as any).triggerCopilot()
		};
	}
});

function isMenuOpen(editor: any): boolean {
	if (!editor?.isFocused) return true;
	const dom = editor.view?.dom as HTMLElement | undefined;
	if (!dom) return false;
	return Boolean(
		dom.querySelector('[data-tiptap-slash-menu]') ||
		dom.querySelector('[data-tiptap-mention-menu]') ||
		dom.querySelector('.tippy-box[data-reference]') ||
		dom.querySelector('[role="menu"][data-state="open"]')
	);
}

async function fetchCompletion(editor: any, storage: any, options: any) {
	if (!editor || isMenuOpen(editor)) return;

	const { selection } = editor.state;
	if (!selection.empty) return;

	const $pos = selection.$anchor;
	const nodeBefore = $pos.nodeBefore;
	if (!nodeBefore || !nodeBefore.isText) return;

	const startPos = Math.max(0, $pos.pos - 1000);
	const textContext = editor.state.doc.textBetween(startPos, $pos.pos, '\n');
	if (!textContext.trim()) return;

	// Optimistic thinking state — replaced by the actual ghost text when the response lands.
	{
		const tr = editor.state.tr.setMeta(copilotPluginKey, { action: 'thinking' });
		editor.view.dispatch(tr);
	}

	if (storage.abortController) {
		storage.abortController.abort();
	}
	storage.abortController = new AbortController();

	try {
		const response = await fetch(options.api, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: `Continue the text naturally in ≤15 words, ending at a clause break. Maintain tone. Do not repeat the given text. If context is insufficient, return "0".\n\n"""\n${textContext}\n"""`,
				system: 'You are a concise writing assistant. Output ≤15 words ending at a clause break. Do not repeat input. If context is insufficient, return "0".'
			}),
			signal: storage.abortController.signal
		});

		if (!response.ok) {
			editor.commands.clearCopilot();
			return;
		}

		let text = '';
		try {
			const data = await response.json();
			text = data.text;
		} catch {
			editor.commands.clearCopilot();
			return;
		}

		if (!text || text === '0') {
			editor.commands.clearCopilot();
			return;
		}

		const prevChar = editor.state.doc.textBetween(Math.max(0, $pos.pos - 1), $pos.pos, ' ');
		const hasSpaceBefore = prevChar ? !!prevChar.match(/\s/) : true;

		let cleanText = text;
		if (hasSpaceBefore) {
			cleanText = text.trimStart();
		} else if (text.match(/^\s/)) {
			cleanText = text;
		} else if (text.match(/^[a-zA-Z0-9]/)) {
			cleanText = ' ' + text;
		}

		const tr = editor.state.tr.setMeta(copilotPluginKey, {
			action: 'set',
			text: cleanText
		});
		editor.view.dispatch(tr);
	} catch (error: any) {
		if (error.name !== 'AbortError') {
			console.error('Copilot completion failed:', error);
		}
		editor.commands.clearCopilot();
	}
}
