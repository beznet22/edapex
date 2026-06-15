/**
 * Supervisor Agent — EdApex Orchestration Brain
 *
 * Classifies user intent, discovers domain context via getContext tool,
 * and delegates to the assistant agent.
 *
 * Dynamic per-request behavior is injected via requestContext:
 * - `modelId`: The gateway-prefixed model string for Mastra's native router
 * - `instructions`: Per-request instructions with tenant context
 * - `isSlashCommand`: Whether the current message is a slash command
 * - `tenantContext`: Tenant isolation boundaries
 */
import { Agent, type ToolsInput } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { z } from 'zod';
import { createMastraStorage } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { createTool } from '@mastra/core/tools';
import { StreamErrorRetryProcessor } from '@mastra/core/processors';
import { ResultsRepository } from '../../repository/result.repo';
import { StudentRepository } from '../../repository/student.repo';
import { getDatabase } from '$lib/server/db';
import type { TenantContext } from '../tenant-context';
import type { MastraModelConfig } from '@mastra/core/llm';
import { requestContextSchema, DEFAULT_MODEL } from './shared';
import { getContextTool } from '../tools/context-tool';

// ─── Supervisor Agent ───────────────────────────────────────────────────────

export const supervisorAgent = new Agent({
	id: 'supervisor',
	name: 'EdApex Supervisor',
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
	},
	instructions: ({ requestContext }) => {
		const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;

		const instructions = [
			'You are the EdApex Supervisor, the orchestration brain of a modular monolith educational platform.',
			'Your primary role is to classify user intent, discover necessary domain context, and route requests safely to specialized Agents.',
		];

		if (ctx) {
			instructions.push(
				'',
				'AVAILABLE AGENTS:',
				'- assistant: Handles all user queries, executes tools, and provides educational support. Delegate ALL user requests to this agent.',
				'',
				'DELEGATION STRATEGY:',
				"1. For EVERY user message, delegate to the \"assistant\" agent. Pass the user's full request as the prompt.",
				"2. Use the \"getContext\" tool ONLY if the user's request involves assessments, students, or marks AND you don't already have the specific names, IDs or setups in your context.",
				'3. After the assistant responds, return its response directly to the user without modification.',
				'',
				'DOMAIN CONTEXT (IDs):',
				`- School ID: ${ctx.schoolId}`,
				`- User ID: ${ctx.userId}`,
				`- Designation ID: ${ctx.designationId}`,
				`- Active Class ID: ${ctx.classId || 'None'}`,
				`- Active Section ID: ${ctx.sectionId || 'None'}`,
				`- Active Exam ID: ${ctx.examId || 'None'}`,
				'',
				'CONFIDENCE GATE:',
				'- For any intent that results in a "mutation", the assistant MUST achieve a confidence score of >= 0.9.',
				'- If confidence is low, or if the intent is ambiguous, ask for clarification before delegating.',
				'',
				"DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).",
			);
		}

		return instructions.join('\n');
	},
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
		},
	}),
	tools: {
		getContext: getContextTool,
	},
	// Retries transient stream errors (OpenAI 5xx, Anthropic overloaded, etc.)
	// that fire AFTER the first chunk. Pairs with `streamWithAutoRetry` for
	// pre-stream 429s.
	errorProcessors: [new StreamErrorRetryProcessor()],
	requestContextSchema,
});
