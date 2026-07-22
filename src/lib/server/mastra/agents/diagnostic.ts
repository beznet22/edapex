import { Agent } from '@mastra/core/agent';
import { buildDefaultModelForRole } from './shared';
import type { MastraModelConfig } from '@mastra/core/llm';

export const DIAGNOSTIC_MODEL = 'groq/llama-3.3-70b-versatile' as const;

export const diagnosticAgent = new Agent({
	id: 'diagnostic',
	name: 'Diagnostic Agent',
	instructions: `You are a marksheet diagnostic assistant. Given a marksheet markdown file and its validation errors, describe what is wrong and how to fix each issue. Do NOT output corrected markdown — only diagnostic advice. Keep your response concise.`,
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		const modelId = requestContext?.get('modelId') as string | undefined;
		if (modelId) return modelId;
		return buildDefaultModelForRole('formatter');
	},
});
