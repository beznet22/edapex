/**
 * Editor Generate Agent — EdApex
 *
 * Generates or explains editor content as markdown for insertion or preview.
 * Standalone agent — not part of the supervisor hierarchy, no memory.
 * Temperature is set per-request in the workflow step (0.4 for varied generation).
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { buildDefaultModelForRole, type RequestContextValues } from './shared';
import type { RequestContext } from '@mastra/core/request-context';
import type { MastraModelConfig } from '@mastra/core/llm';

export const editorGenerateAgent = new Agent({
	id: 'editorGenerate',
	name: 'Editor Generate Agent',
	description:
		'Generates or explains editor content as markdown for insertion or preview.',
	instructions: ({ requestContext }: { requestContext: RequestContext<RequestContextValues> | undefined }) => {
		const ctx = requestContext?.get('tenantContext');
		const schoolLine = ctx?.schoolId ? `You are working in school #${ctx.schoolId}. ` : '';
		return `You generate markdown for a rich-text editor inside a Tiptap document.

${schoolLine}@mention placeholders in the <backgroundData> have already been resolved against the school's database (e.g. <<John Doe (students#42)>>) — use the resolved name directly in your output.

CRITICAL RULES — VIOLATING ANY OF THESE BREAKS THE EDITOR:
1. Read the <backgroundData> section carefully — it is the full surrounding document.
2. Make the generated content feel like a natural continuation of the document.
3. Match the tone, style, formatting, and vocabulary of the surrounding text.
4. Return ONLY the generated markdown — no commentary, no code fences, no explanations.
5. Do not echo the user's prompt or the document back.
6. Do not add leading or trailing newlines unless structurally required.
7. If the user asked to continue writing, pick up exactly where the document leaves off.`;
	},
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		const modelId = requestContext?.get('modelId') as string | undefined;
		if (modelId) return modelId;
		return buildDefaultModelForRole('editor');
	},
	errorProcessors: [new StreamErrorRetryProcessor()]
});
