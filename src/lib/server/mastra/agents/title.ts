/**
 * Titler Agent — Lightweight Title Generator
 *
 * Generates short conversation titles from the initial user message.
 * Uses the titler model (speed-tier) resolved via requestContext.
 */
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { DEFAULT_TITLE_MODEL } from './shared';

export const titleAgent = new Agent({
	id: 'title',
	name: 'Title Generator',
	instructions: 'Generate a very short title at most 4-6 words summarizing the user message. Return ONLY the title text, no quotes, colons, or explanation.',
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		return (requestContext?.get('modelId') as string) || DEFAULT_TITLE_MODEL;
	},
	errorProcessors: [new StreamErrorRetryProcessor()]
});
