/**
 * Editor Copilot Agent — EdApex
 *
 * Produces short inline writing continuations for editor ghost text suggestions.
 * Standalone agent — no memory.
 */
import { Agent } from '@mastra/core/agent';
import { DEFAULT_COPILOT_MODEL } from './shared';
import type { RequestContext } from '@mastra/core/request-context';
import type { RequestContextValues } from './shared';

export const editorCopilotAgent = new Agent({
	id: 'editorCopilot',
	name: 'Editor Copilot Agent',
	description:
		'Produces short inline writing continuations for editor ghost text suggestions.',
	instructions: ({ requestContext }: { requestContext: RequestContext<RequestContextValues> | undefined }) => {
		const ctx = requestContext?.get('tenantContext');
		const schoolLine = ctx?.schoolId ? `You are writing in school #${ctx.schoolId}. ` : '';
		return `${schoolLine}Continue the text naturally in ≤15 words, ending at a clause break. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".`;
	},
	model: DEFAULT_COPILOT_MODEL,
});
