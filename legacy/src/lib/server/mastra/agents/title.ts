/**
 * Titler Agent — Lightweight Title Generator
 *
 * Generates short conversation titles from the initial user message.
 * Uses the per-request `requestContext.modelConfig` (carrying the
 * user's personal key from the 4-tier router). Falls back to a
 * PER-CALL Groq model built from `env.GROQ_API_KEY` when the
 * requestContext is empty.
 */
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { buildDefaultModelForRole } from './shared';

export const titleAgent = new Agent({
	id: 'title',
	name: 'Title Generator',
	instructions:
		'Generate a very short title at most 4-6 words summarizing the user message. Return ONLY the title text, no quotes, colons, or explanation.',
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		const modelId = requestContext?.get('modelId') as string | undefined;
		if (modelId) return modelId;
		return buildDefaultModelForRole('title');
	},
	errorProcessors: [new StreamErrorRetryProcessor()]
});
