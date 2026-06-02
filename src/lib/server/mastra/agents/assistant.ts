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
import type { TenantContext } from '../tenant-context';
import { requestContextSchema, DEFAULT_MODEL } from './shared';
import { createMastraStorage } from '../storage';
import { Memory } from '@mastra/memory';
import { ensureRegistry, resolveToolsForMessage } from '$lib/server/helpers/chat-helper';



export const assistantAgent = new Agent({
	id: 'assistant',
	name: 'Assistant',
	description: 'Handles user queries, executes tools, and provides educational support.',
	model: ({ requestContext }) => {
		return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
	},
	instructions: ({ requestContext }) => {
		const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;

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
				'',
				'BEHAVIORAL GUIDELINES:',
				'1. Use the provided domain data to answer accurately.',
				'2. If data is missing but expected, inform the user politely.',
				'3. Maintain a premium, helpful, and professional tone.',
				'4. Never suggest actions that would bypass tenant isolation or school safety rules.',
				'',
				"DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).",
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
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
		},
	}),
	requestContextSchema,
});
