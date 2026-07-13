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
import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
	StreamErrorRetryProcessor,
	TokenLimiterProcessor
} from '@mastra/core/processors';
import { requestContextSchema, DEFAULT_MODEL, DEFAULT_TITLE_MODEL } from './shared';
import { createMastraStorage } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { Memory } from '@mastra/memory';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { BASE_AGENT_TOOLS } from '../tools/internal/base-agent-tools';
import { buildAssistantInstructions } from './skill-instructions';
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
	instructions: async ({ requestContext }) => {
		return buildAssistantInstructions(
			requestContext as unknown as { get<T = unknown>(key: string): T | undefined }
		);
	},
	tools: BASE_AGENT_TOOLS,
	workspace: tenantWorkspace,
	memory: new Memory({
		options: {
			lastMessages: 10,
			// generateTitle: {
			// 	model: DEFAULT_TITLE_MODEL,
			// 	instructions: 'Generate a concise title (max 5 words). Return ONLY the title text, no quotes, colons, or explanation.',
			// },
		},
	}),
	inputProcessors: [
		new TokenLimiterProcessor({
			limit: 100_000,
			strategy: 'truncate',
			countMode: 'cumulative',
			trimMode: 'contiguous'
		})
	],
	errorProcessors: [new StreamErrorRetryProcessor()],
	requestContextSchema,
});


