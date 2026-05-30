/**
 * Editor Generate Agent — EdApex
 *
 * Generates or explains editor content as markdown for insertion or preview.
 * Standalone agent — not part of the supervisor hierarchy, no memory.
 * Temperature is set per-request in the workflow step (0.4 for varied generation).
 */
import { Agent } from '@mastra/core/agent';
import { DEFAULT_EDITOR_MODEL } from './shared';

export const editorGenerateAgent = new Agent({
	id: 'editorGenerate',
	name: 'Editor Generate Agent',
	description:
		'Generates or explains editor content as markdown for insertion or preview.',
	instructions:
		'You generate markdown for a rich-text editor. Return only the requested markdown content with no commentary, no code fences, and no extra framing.',
	model: DEFAULT_EDITOR_MODEL,
});
