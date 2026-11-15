import { Node, mergeAttributes } from '@tiptap/core';
import { SvelteNodeViewRenderer } from 'svelte-tiptap';
import AiStreamView from '../AiStreamView.svelte';

export const AiStreamNode = Node.create({
	name: 'aiStreamBlock',

	group: 'block',

	atom: true,

	selectable: false,

	addAttributes() {
		return {
			content: {
				default: '',
			},
			status: {
				default: 'streaming', // 'streaming' | 'finished' | 'error'
			},
			toolName: {
				default: 'generate', // 'edit' | 'generate'
			},
			streamId: {
				default: '',
			},
			retryAfter: {
				default: null,
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-ai-stream]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-ai-stream': '' }), 0];
	},

	addStorage() {
		return {
			markdown: {
				serialize(state: any, node: any) {
					state.write('');
					if (node.isBlock) {
						state.closeBlock(node);
					}
				},
				parse: {
					setup(md: any) {
						md.block.ruler.before('html_block', 'ai_stream_block', (state: any, startLine: number, endLine: number) => {
							const start = state.bMarks[startLine] + state.tShift[startLine];
							const max = state.eMarks[startLine];
							const lineText = state.src.slice(start, max);
							if (!/^<div data-ai-stream[^>]*>/.test(lineText)) return false;
							state.line = endLine + 1;
							const token = state.push('html_block', '', 0);
							token.map = [startLine, endLine + 1];
							token.content = state.getLines(startLine, endLine, 0, true);
							return true;
						});
					},
				},
			},
		};
	},

	addNodeView() {
		return SvelteNodeViewRenderer(AiStreamView);
	},
});
