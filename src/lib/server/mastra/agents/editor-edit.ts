/**
 * Editor Edit Agent — EdApex
 *
 * Rewrites selected markdown content while preserving structure and intent.
 * Supports multiple toolName variants (edit, improve, fix, shorter, longer)
 * each producing a different system prompt via the option-specific prompt
 * template below. Mirrors Novel.sh's `match(option)` pattern.
 *
 * Standalone agent — not part of the supervisor hierarchy, no memory, no tenant isolation.
 * Temperature is set per-request in the workflow step (0.0 for precise edits).
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { DEFAULT_EDITOR_MODEL } from './shared';
import type { RequestContext } from '@mastra/core/request-context';
import type { RequestContextValues } from './shared';

export type EditorEditOption = 'edit' | 'improve' | 'fix' | 'shorter' | 'longer';

/**
 * Builds the option-specific system prompt fragment for the editor edit agent.
 * Mirrors Novel.sh's `match(option)` branch in `/api/generate/route.ts`.
 */
export function buildEditOptionInstruction(option: EditorEditOption): string {
	switch (option) {
		case 'improve':
			return 'You are improving existing text. Limit your response to no more than 200 characters, but make sure to construct complete sentences. Use Markdown formatting when appropriate.';
		case 'fix':
			return 'You are an AI writing assistant that fixes grammar and spelling errors in existing text. Limit your response to no more than 200 characters, but make sure to construct complete sentences. Use Markdown formatting when appropriate.';
		case 'shorter':
			return 'You are an AI writing assistant that shortens existing text. Use Markdown formatting when appropriate.';
		case 'longer':
			return 'You are an AI writing assistant that lengthens existing text. Limit your response to no more than 200 characters, but make sure to construct complete sentences. Use Markdown formatting when appropriate.';
		case 'edit':
		default:
			return 'You are rewriting existing text according to the user\'s instructions.';
	}
}

export const editorEditAgent = new Agent({
	id: 'editorEdit',
	name: 'Editor Edit Agent',
	description:
		'Rewrites selected editor content while preserving markdown structure and the user\'s intent. Supports improve, fix, shorter, longer, and generic edit.',
	instructions: ({ requestContext }: { requestContext: RequestContext<RequestContextValues> | undefined }) => {
		const ctx = requestContext?.get('tenantContext');
		const schoolLine = ctx?.schoolId ? `You are working in school #${ctx.schoolId}. ` : '';
		return `You are a precise inline editor inside a rich-text editor.

${schoolLine}The user's prompt contains a fragment of their document wrapped in <Selection>…</Selection> tags within a larger <backgroundData> block.

CRITICAL RULES — VIOLATING ANY OF THESE BREAKS THE EDITOR:
1. Return ONLY the rewritten content for the text inside <Selection> tags.
2. Do NOT return the surrounding document, background, or any text outside <Selection>.
3. Do NOT include the <Selection> or </Selection> tags in your output.
4. Do NOT include code fences, preambles, explanations, or trailing commentary.
5. Do NOT add a leading or trailing newline unless the original had one.
6. Preserve the markdown formatting (headings, lists, bold, italic, links) used inside <Selection>.
7. If the user's instruction is unclear, return the original <Selection> content unchanged.

Your entire output is inserted back into the document in place of the original <Selection>. Anything outside the replacement text will appear as duplicated content.`;
	},
	model: DEFAULT_EDITOR_MODEL,
	errorProcessors: [new StreamErrorRetryProcessor()]
});
