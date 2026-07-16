/**
 * Resolve tools workflow step.
 *
 * Runs BEFORE `assistantStep` in `chatWorkflow`. Resolves the
 * skill-specific toolset from the slash command / natural-language
 * intent and merges it with the always-available `BASE_AGENT_TOOLS`,
 * then attaches the merged set to the envelope as `tools`.
 *
 * `assistantStep` reads `inputData.tools` and passes it to
 * `agent.stream({ tools })`. This replaces the previous pattern where
 * the agent's `tools:` resolver ran lazily per request \u2014 that pattern
 * failed at runtime because Mastra's tool validator runs against the
 * agent's static tool snapshot, so dynamically-resolved skill tools
 * (`validate-marksheet`, `commit-marksheet`, etc.) surfaced as
 * `Tool "..." not found` to the model.
 *
 * Merge order: `{ ...BASE_AGENT_TOOLS, ...skillTools }`. A skill can
 * never shadow a base tool \u2014 the assistant's always-available surface
 * is preserved across every active skill.
 */

import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { workflowEnvelopeSchema } from '$lib/server/mastra/utils/chat-schemas';
import { ensureRegistry, resolveToolsForMessage } from '$lib/server/mastra/skill-tools';
import { BASE_AGENT_TOOLS } from '$lib/server/mastra/tools/internal/base-agent-tools';
import type { ToolsetsInput } from '@mastra/core/agent';

const resolveToolsEnvelopeSchema = workflowEnvelopeSchema.extend({
	tools: z.custom<ToolsetsInput>()
});

export const resolveAgentContextStep = createStep({
	id: 'resolve-agent-context',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: resolveToolsEnvelopeSchema,
	execute: async ({ inputData, requestContext }) => {
		if (inputData.fileItems.length > 0) {
			const manifestText = inputData.fileItems
				.map((f) => {
					const contentHash = f.fileId ?? f.contentHash ?? f.toolCallId;
					if ('error' in f) {
						return `- ${f.fileName} (contentHash: ${contentHash}) — Error: ${f.error}`;
					}
					return `- ${f.fileName} (contentHash: ${contentHash})`;
				})
				.join('\n');
			requestContext?.set('fileManifest', manifestText);
		}

		const lastMessage = requestContext?.get('lastMessage') as string | undefined;
		const isSlashCommand = requestContext?.get('isSlashCommand') as boolean | undefined;
		await ensureRegistry();

		const skillTools = resolveToolsForMessage(
			lastMessage ?? '',
			!!isSlashCommand
		);

		return {
			...inputData,
			tools: { default: { ...BASE_AGENT_TOOLS, ...skillTools } }
		};
	}
});
