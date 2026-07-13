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

const resolveToolsEnvelopeSchema = workflowEnvelopeSchema.extend({
	tools: z.record(z.string(), z.unknown())
});

export const resolveToolsStep = createStep({
	id: 'resolve-tools',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: resolveToolsEnvelopeSchema,
	execute: async ({ inputData, requestContext }) => {
		const lastMessage = requestContext?.get('lastMessage') as string | undefined;
		const isSlashCommand = requestContext?.get('isSlashCommand') as boolean | undefined;
		await ensureRegistry();

		const skillTools = resolveToolsForMessage(
			lastMessage ?? '',
			!!isSlashCommand
		);

		const merged = { ...BASE_AGENT_TOOLS, ...skillTools };
		console.log('tools: ', Object.keys(merged));

		return {
			...inputData,
			tools: merged
		};
	}
});
