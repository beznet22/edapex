/**
 * Titler Agent — Lightweight Title Generator
 *
 * Generates short conversation titles from the initial user message.
 * Uses the titler model (speed-tier) resolved via requestContext.
 */
import { Agent } from '@mastra/core/agent';
import { DEFAULT_TITLE_MODEL } from './shared';

export const titleAgent = new Agent({
	id: 'title',
	name: 'Title Generator',
	instructions: 'Generate a very short title (under 20 characters) summarizing the user message. Return ONLY the title text, no quotes, colons, or explanation.',
	model: ({ requestContext }) => {
		return (requestContext?.get('modelId') as string) || DEFAULT_TITLE_MODEL;
	},
});
