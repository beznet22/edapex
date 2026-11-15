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
import { Memory } from '@mastra/memory';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
	StreamErrorRetryProcessor,
	TokenLimiterProcessor
} from '@mastra/core/processors';
import { requestContextSchema, DEFAULT_MODEL } from './shared';
import { tenantWorkspace } from '$lib/server/workspace';
import { BASE_AGENT_TOOLS } from '../tools/internal/base-agent-tools';
import { buildAssistantInstructions } from './skill-instructions';

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
			lastMessages: 10
		}
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


