/**
 * Editor Edit Agent — EdApex
 *
 * Rewrites selected markdown content while preserving structure and intent.
 * Standalone agent — not part of the supervisor hierarchy, no memory, no tenant isolation.
 * Temperature is set per-request in the workflow step (0.2 for precise edits).
 */
import { Agent } from '@mastra/core/agent';
import { DEFAULT_EDITOR_MODEL } from './shared';

export const editorEditAgent = new Agent({
	id: 'editorEdit',
	name: 'Editor Edit Agent',
	description:
		'Rewrites selected editor content while preserving markdown structure and the user\'s intent.',
	instructions:
		'You rewrite selected content inside a rich-text editor. Return only the edited markdown content with no commentary, no code fences, and no extra framing.',
	model: DEFAULT_EDITOR_MODEL,
});
