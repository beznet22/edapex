/**
 * Editor Copilot Agent — EdApex
 *
 * Produces short inline writing continuations for editor ghost text suggestions.
 * The system prompt uses gathered tenant context (studentName, examType,
 * subject, documentHeaders, cursorPosition) to build richer instructions.
 * Standalone agent — no memory.
 */
import { Agent } from '@mastra/core/agent';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { buildDefaultModelForRole, type RequestContextValues } from './shared';
import type { RequestContext } from '@mastra/core/request-context';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { EditorCopilotContext } from '../editor/schemas';

/**
 * Builds the copilot system prompt from the gathered context.
 * Mirrors the cursorPosition-aware prompt building in the client-side
 * `gatherContext` + `buildSmartSystem` helpers.
 */
export function buildCopilotSystemPrompt(ctx: EditorCopilotContext | undefined): string {
	if (!ctx) {
		return 'Continue the text naturally in ≤15 words, ending at a clause break. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".';
	}
	const lines: string[] = [
		'You are a concise writing assistant.',
		'Output ≤15 words ending at a clause break. Do not repeat the input. If context is insufficient, return "0".'
	];
	if (ctx.studentName) lines.push(`You are continuing a marksheet for student: ${ctx.studentName}.`);
	if (ctx.examType) lines.push(`Exam type: ${ctx.examType}.`);
	if (ctx.subject) lines.push(`Subject: ${ctx.subject}.`);
	const headers = ctx.documentHeaders ?? [];
	if (headers.length > 0) {
		lines.push(`Document sections so far: ${headers.join(' | ')}.`);
	}
	const positionHint: Record<EditorCopilotContext['cursorPosition'], string> = {
		'paragraph-start': 'Begin a new paragraph that flows naturally from the previous text.',
		'sentence-mid': 'Complete the current sentence naturally, mid-clause.',
		'sentence-end': 'Begin a new sentence that flows naturally from the previous one.',
		'paragraph-end': 'Begin a new paragraph that flows naturally from the previous one.'
	};
	lines.push(positionHint[ctx.cursorPosition]);
	return lines.join(' ');
}

export const editorCopilotAgent = new Agent({
	id: 'editorCopilot',
	name: 'Editor Copilot Agent',
	description:
		'Produces short inline writing continuations for editor ghost text suggestions. Uses gathered tenant context for richer completions.',
	instructions: ({ requestContext }: { requestContext: RequestContext<RequestContextValues> | undefined }) => {
		const ctx = requestContext?.get('tenantContext');
		const schoolLine = ctx?.schoolId ? `You are working in school #${ctx.schoolId}. ` : '';
		return `${schoolLine}Continue the text naturally in ≤15 words, ending at a clause break. Maintain tone and style. Do not repeat the given text. Do not start a new block. If there is not enough context, return "0".`;
	},
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		const modelId = requestContext?.get('modelId') as string | undefined;
		if (modelId) return modelId;
		return buildDefaultModelForRole('copilot');
	},
	errorProcessors: [new StreamErrorRetryProcessor()]
});
