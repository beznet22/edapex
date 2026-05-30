import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { mount, unmount } from 'svelte';
import CopilotWidget from '../CopilotWidget.svelte';

export const copilotPluginKey = new PluginKey('copilot');

export interface CopilotOptions {
	debounceDelay: number;
	api: string;
}

export const CopilotExtension = Extension.create<CopilotOptions>({
	name: 'copilot',

	addOptions() {
		return {
			debounceDelay: 500,
			api: '/api/ai/editor/copilot',
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<{ decoration: Decoration | null; text: string | null; active: boolean }>({
				key: copilotPluginKey,
				state: {
					init() {
						return { decoration: null as Decoration | null, text: null as string | null, active: false };
					},
					apply(tr, value, oldState, newState) {
						const meta = tr.getMeta(copilotPluginKey);
						
						if (meta) {
							if (meta.action === 'set') {
								const decoration = Decoration.widget(newState.selection.to, (view, getPos) => {
									const dom = document.createElement('span');
									
									const component = mount(CopilotWidget, {
										target: dom,
										props: {
											text: meta.text,
											onAccept: () => {
												const hasMarkdownSyntax = /[*_#`\[\]>-]/.test(meta.text);
												
												if (hasMarkdownSyntax) {
													const { tr } = view.state;
													tr.setMeta(copilotPluginKey, { action: 'clear' });
													view.dispatch(tr);

													const editor = (view as any).editor;
													if (editor) {
														editor.commands.insertContent(meta.text);
													}
												} else {
													const { tr } = view.state;
													tr.insertText(meta.text, view.state.selection.to);
													tr.setMeta(copilotPluginKey, { action: 'clear' });
													view.dispatch(tr);
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
									side: 1, // Render after cursor
									ignoreSelection: true,
									destroy: (dom) => {
										if ((dom as any).__svelte_component) {
											unmount((dom as any).__svelte_component);
										}
									}
								});

								return { decoration, text: meta.text, active: true };
							}
							if (meta.action === 'clear') {
								return { decoration: null, text: null, active: false };
							}
						}

						// Automatically clear ghost text if the user types or selection changes
						if (tr.docChanged || tr.selectionSet) {
							return { decoration: null, text: null, active: false };
						}

						return value;
					},
				},
				props: {
					decorations(state) {
						const { decoration } = this.getState(state) || {};
						if (decoration) {
							return DecorationSet.create(state.doc, [decoration]);
						}
						return DecorationSet.empty;
					},
					handleKeyDown(view, event) {
						const state = this.getState(view.state);
						if (state?.active && event.key === 'Tab') {
							event.preventDefault();
							event.stopPropagation();

							const ghostText = state.text || '';
							const hasMarkdownSyntax = /[*_#`\[\]>-]/.test(ghostText);

							if (hasMarkdownSyntax) {
								const { tr } = view.state;
								tr.setMeta(copilotPluginKey, { action: 'clear' });
								view.dispatch(tr);

								const editor = (view as any).editor;
								if (editor) {
									editor.commands.insertContent(ghostText);
								}
							} else {
								const { tr } = view.state;
								tr.insertText(ghostText, view.state.selection.to);
								tr.setMeta(copilotPluginKey, { action: 'clear' });
								view.dispatch(tr);
							}
							return true;
						}
						
						// If Escape is pressed, explicitly clear it
						if (state?.active && event.key === 'Escape') {
							event.preventDefault();
							const { tr } = view.state;
							tr.setMeta(copilotPluginKey, { action: 'clear' });
							view.dispatch(tr);
							return true;
						}

						return false;
					},
				},
			}),
		];
	},

	addStorage() {
		return {
			timeout: null as ReturnType<typeof setTimeout> | null,
			abortController: null as AbortController | null,
		};
	},

	onUpdate({ editor }) {
		handleDebounce(editor, this.storage, this.options);
	},

	onSelectionUpdate({ editor }) {
		handleDebounce(editor, this.storage, this.options);
	},

	addCommands() {
		return {
			clearCopilot: () => ({ tr, dispatch }: { tr: any, dispatch: any }) => {
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
			'Mod-Space': () => (this.editor.commands as any).triggerCopilot(),
		};
	},
});

function handleDebounce(editor: any, storage: any, options: any) {
	// Clear existing ghost text on any change
	editor.commands.clearCopilot();

	if (storage.timeout) {
		clearTimeout(storage.timeout);
	}
	if (storage.abortController) {
		storage.abortController.abort();
		storage.abortController = null;
	}

	storage.timeout = setTimeout(() => {
		fetchCompletion(editor, storage, options);
	}, options.debounceDelay);
}

async function fetchCompletion(editor: any, storage: any, options: any) {
	// Only trigger if cursor is at the end of a block/line
	const { selection } = editor.state;
	if (!selection.empty) return;

	// Extract the text content of the current block
	const $pos = selection.$anchor;
	const nodeBefore = $pos.nodeBefore;
	
	// If there's no text before the cursor, don't auto-suggest
	if (!nodeBefore || !nodeBefore.isText) return;

	// Extract context (e.g. up to 1000 chars before cursor)
	const startPos = Math.max(0, $pos.pos - 1000);
	const textContext = editor.state.doc.textBetween(startPos, $pos.pos, '\n');

	if (!textContext.trim()) return;

	storage.abortController = new AbortController();

	try {
		const response = await fetch(options.api, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: `Continue the text naturally up to the next punctuation mark. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".\n\n"""\n${textContext}\n"""`,
				system: `You are an advanced writing assistant. Continue the text naturally up to the next punctuation mark. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".`,
			}),
			signal: storage.abortController.signal,
		});

		if (!response.ok) return;

		let text = '';
		try {
			const data = await response.json();
			text = data.text;
		} catch (e) {
			console.warn('Copilot completion returned invalid JSON', e);
			return;
		}
		
		if (text && text !== "0") {
			const prevChar = editor.state.doc.textBetween(Math.max(0, $pos.pos - 1), $pos.pos, ' ');
			const hasSpaceBefore = prevChar ? !!prevChar.match(/\s/) : true;

			let cleanText = text;
			if (hasSpaceBefore) {
				cleanText = text.trimStart();
			} else {
				if (text.match(/^\s/)) {
					cleanText = text;
				} else if (text.match(/^[a-zA-Z0-9]/)) {
					cleanText = ' ' + text;
				}
			}
			
			// Dispatch a transaction to set the ghost text
			const tr = editor.state.tr.setMeta(copilotPluginKey, { 
				action: 'set', 
				text: cleanText 
			});
			editor.view.dispatch(tr);
		}

	} catch (error: any) {
		if (error.name !== 'AbortError') {
			console.error('Copilot completion failed:', error);
		}
	}
}
