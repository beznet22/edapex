/**
 * Parent Assistant Agent — Telegram-only channel
 *
 * Dedicated agent for parent interactions on Telegram. Built with a fixed
 * tool subset (no dynamic resolution) and the School Concierge persona
 * loaded from the parent skill markdown via the skill registry.
 *
 * Hard isolation boundary: this agent MUST NOT be imported by any webapp
 * chat plumbing (chat composer, /api/chat route, etc.). The only consumer
 * is src/lib/server/telegram/gateway.ts.
 */
import { Agent, type ToolsInput } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { Memory } from '@mastra/memory';
import { createMastraStorage } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { ensureRegistry, skillRegistry } from '$lib/server/mastra/skill-tools';
import { parentTools } from '$lib/server/mastra/tools/operations/parent';
import { searchSchoolDirectoryTool } from '$lib/server/mastra/tools/operations/read/search-school-directory';
import { getAcademicContextTool } from '$lib/server/mastra/tools/operations/context/get-academic-context';
import { DEFAULT_MODEL } from './shared';
import { ParentContext } from '$lib/server/mastra/tools/internal/parent-permissions';

// HMR-safe singleton via globalThis
declare global {
	// eslint-disable-next-line no-var
	var __parentAssistantAgent: Agent | undefined;
}

function buildParentAssistantAgent(): Agent {
	return new Agent({
		id: 'parent-assistant',
		name: 'Parent Assistant Agent',
		description:
			'Dedicated Telegram agent for parents of currently enrolled students. ' +
			'Reads the parent\'s bound children, school context, and surfaces only ' +
			'data the parent is entitled to.',
		model: ({ requestContext }) => {
			const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
			if (v2Config) return v2Config;
			return (requestContext?.get('modelId') as string | undefined) ?? DEFAULT_MODEL;
		},
		instructions: async ({ requestContext }) => {
			await ensureRegistry();
			const skill = skillRegistry.getSkill('parent');

			const ctx = requestContext?.get('tenantContext') as ParentContext | undefined;
			const schoolName = ctx?.schoolName;
			const schoolPhone = ctx?.schoolPhone;
			const schoolEmail = ctx?.schoolEmail;

			const schoolContactBlock =
				schoolName || schoolPhone || schoolEmail
					? [
							'',
							'SCHOOL CONTACT (for fallback messages only):',
							...(schoolName ? [`- School: ${schoolName}`] : []),
							...(schoolPhone ? [`- Phone: ${schoolPhone}`] : []),
							...(schoolEmail ? [`- Email: ${schoolEmail}`] : []),
						].join('\n')
					: '';

			const persona = skill?.instructions ?? '';
			return [persona, schoolContactBlock].filter(Boolean).join('\n\n');
		},
		tools: {
			...parentTools,
			searchSchoolDirectoryTool,
			getAcademicContextTool,
		} as ToolsInput,
		memory: new Memory({
			storage: createMastraStorage(),
			options: {
				lastMessages: 10,
			},
		}),
	});
}

export const parentAssistantAgent: Agent =
	globalThis.__parentAssistantAgent ??
	(globalThis.__parentAssistantAgent = buildParentAssistantAgent());