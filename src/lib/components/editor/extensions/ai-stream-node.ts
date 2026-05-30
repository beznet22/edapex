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
				default: 'streaming', // 'streaming' | 'finished'
			}
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-ai-stream]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { 'data-ai-stream': '' }), 0];
	},

	addNodeView() {
		return SvelteNodeViewRenderer(AiStreamView);
	},
});
