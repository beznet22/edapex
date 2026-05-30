/**
 * Editor Copilot Agent — EdApex
 *
 * Produces short inline writing continuations for editor ghost text suggestions.
 * Standalone agent — no memory.
 */
import { Agent } from '@mastra/core/agent';
import { DEFAULT_COPILOT_MODEL } from './shared';

export const editorCopilotAgent = new Agent({
	id: 'editorCopilot',
	name: 'Editor Copilot Agent',
	description:
		'Produces short inline writing continuations for editor ghost text suggestions.',
	instructions:
		'Continue the text naturally up to the next punctuation mark. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".',
	model: DEFAULT_COPILOT_MODEL, // Or override with a faster model if desired
});
