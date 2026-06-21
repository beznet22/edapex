/**
 * Assistant Agent — EdApex Expert AI Partner
 *
 * Handles user queries, executes tools, and provides educational support.
 * Tools are dynamically resolved based on slash commands via requestContext,
 * following the Quintui openchat pattern.
 *
 * Dynamic per-request behavior is injected via requestContext:
 * - `modelId`: The gateway-prefixed model string for Mastra's native router
 * - `isSlashCommand`: Whether the current message is a slash command (activates mutation tools)
 * - `tenantContext`: Tenant isolation boundaries
 */
import { Agent, type ToolsInput } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
	StreamErrorRetryProcessor,
	TokenLimiterProcessor
} from '@mastra/core/processors';
import type { TenantContext } from '../tenant-context';
import { requestContextSchema, DEFAULT_MODEL, DEFAULT_TITLE_MODEL } from './shared';
import { createMastraStorage } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { Memory } from '@mastra/memory';
import { ensureRegistry, resolveToolsForMessage } from '$lib/server/mastra/skill-tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import z from 'zod';

export const testAgent = new Agent({
	id: 'testAgent',
	name: 'Test Agent',
	description: 'Test Agent',
	model: DEFAULT_MODEL,
	instructions: 'You are a test agent that only replies with "Hello World".',
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
		},
	}),
});


const step1 = createStep({
	id: 'step-1',
	inputSchema: z.object({
		message: z.string(),
	}),
	outputSchema: z.object({
		formatted: z.string(),
	}),
	execute: async ({ inputData, mastra, writer }) => {
		const { message } = inputData


		const agent = mastra.getAgent('testAgent')
		const stream = await agent.stream(inputData.message)
		await stream.textStream.pipeTo(writer!)

		return {
			formatted: message.toUpperCase(),
		}
	},
})

export const testWorkflow = createWorkflow({
	id: "testWorkflow",
	inputSchema: z.object({
		message: z.string()
	}),
	outputSchema: z.object({
		output: z.string()
	}),
	options: {
		onFinish: async (result) => {
			if (result.status === 'success') {
				console.info('[chatWorkflow] completed', {
					runId: result.runId,
					workflowId: result.workflowId,
					fileCount: result.result?.resolvedFiles?.length ?? 0,
					textLength: result.result?.text?.length ?? 0
				});
			}
		},
		onError: async (errorInfo) => {
			console.error('[chatWorkflow] error', {
				runId: errorInfo.runId,
				workflowId: errorInfo.workflowId,
				status: errorInfo.status,
				error: errorInfo.error
			});
		}
	}
})
	.then(step1)
	.commit()

export interface ParsedSlashCommand {
	command: string;
	subcommand?: string;
	args: string[];
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
	const match = text.trim().match(/^\/(\w+)(?:\s+(\w+))?(.*)$/);
	if (!match) return null;
	const [, command, subcommand, rest] = match;
	return {
		command,
		...(subcommand ? { subcommand } : {}),
		args: rest.trim().split(/\s+/).filter(Boolean),
	};
}

export const assistantAgent = new Agent({
	id: 'assistant',
	name: 'Assistant',
	description: 'Handles user queries, executes tools, and provides educational support.',
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
	},
	instructions: ({ requestContext }) => {
		// The agent may inspect requestContext.lastMessage via parseSlashCommand
		// to detect slash commands and their subcommands. Skills already
		// document each command's subcommands, so no system prompt text is
		// appended here.
		const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;
		const fileManifest = requestContext?.get('fileManifest') as string | undefined;

		const instructions = [
			'You are the EdApex Assistant, an expert AI partner for teachers and administrators.',
			'You provide professional, data-driven support within the boundaries of the current workspace.',
		];

		if (ctx) {
			instructions.push(
				'',
				'TENANT BOUNDARIES (IDs):',
				`- School ID: ${ctx.schoolId}`,
				`- User ID: ${ctx.userId}`,
				`- Designation ID: ${ctx.designationId}`,
				`- Active Class ID: ${ctx.classId || 'None'}`,
				`- Active Section ID: ${ctx.sectionId || 'None'}`,
				`- Active Exam ID: ${ctx.examId || 'None'}`,
				`- Active Exam Type ID: ${ctx.examTypeId || 'None'}`,
				`- Active Academic Year ID: ${ctx.academicId || 'None'}`,
				`- Active Student ID (if @mention resolved): ${ctx.studentId || 'None'}`,
				`- Active Role ID: ${ctx.roleId || 'None'}`,
				'',
				'BEHAVIORAL GUIDELINES:',
				'1. Use the provided domain data to answer accurately.',
				'2. If data is missing but expected, inform the user politely.',
				'3. Maintain a premium, helpful, and professional tone.',
				'4. Never suggest actions that would bypass tenant isolation or school safety rules.',
				'5. Before executing /marksheet commands, verify that examTypeId and academicId are resolved. If either is null, call get-academic-context first to populate them.',
				'6. Before executing student-specific commands (/enroll, /admit, /promote, etc.), verify that studentId is resolved. If null, the @mention was not applied — ask the user to @mention the target student.',
				'',
				"DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).",
				'',
				'FILE CONTEXT:',
				'When files are available (shown in the FILE CONTEXT section of your prompt),',
				'the user may ask you to "extract data", "create document from the image", or similar.',
				'The chat workflow auto-streams each file\'s OCR markdown to the UI as a document card;',
				'do not call any tool to retrieve it — it is already available on the client.',
				'Do not ask the user to provide the data again — it is already available.',
				'FILE MANIFEST is attached below\n\n',
				fileManifest || 'No files attached'
			);
		}

		return instructions.join('\n');
	},
	tools: async ({ requestContext }) => {
		const isSlashCommand = requestContext?.get('isSlashCommand') as boolean | undefined;
		const message = requestContext?.get('lastMessage') as string | undefined;

		// Ensure registry is loaded
		await ensureRegistry();
		return resolveToolsForMessage(message || '', !!isSlashCommand) as ToolsInput;

	},
	workspace: tenantWorkspace,
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
			// generateTitle: {
			// 	model: DEFAULT_TITLE_MODEL,
			// 	instructions: 'Generate a concise title (max 5 words). Return ONLY the title text, no quotes, colons, or explanation.',
			// },
		},
	}),
	// `TokenLimiterProcessor` enforces a hard cap on input tokens (truncates
	// the oldest messages to fit). 100_000 leaves ~28_000 for system prompt
	// + output across all builtin models (smallest context = 128_000).
	inputProcessors: [
		new TokenLimiterProcessor({
			limit: 100_000,
			strategy: 'truncate',
			countMode: 'cumulative',
			trimMode: 'contiguous'
		})
	],
	// `StreamErrorRetryProcessor` retries transient stream errors (OpenAI 5xx,
	// Anthropic overloaded, etc.) that fire AFTER the first chunk — our
	// `streamWithAutoRetry` only handles pre-stream 429s, so the two are
	// complementary.
	errorProcessors: [new StreamErrorRetryProcessor()],
	requestContextSchema,
});


