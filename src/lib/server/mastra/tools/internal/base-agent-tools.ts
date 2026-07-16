/**
 * Base agent tools \u2014 the "static" toolset that is ALWAYS available to the
 * assistant agent regardless of the active skill.
 *
 * These tools are the floor every assistant turn can call. Skill-specific
 * tools (e.g. `validate-marksheet`, `commit-marksheet`, `streamDocument`)
 * are layered on top by `resolveToolsStep` in the chat workflow. The
 * merge order is `{ ...BASE_AGENT_TOOLS, ...skillTools }` so a skill can
 * never shadow a base tool \u2014 the assistant's always-available surface is
 * preserved across every active skill.
 *
 * History: previously the agent's `tools:` resolver lazily resolved the
 * full toolset per request, but Mastra's runtime tool validator runs
 * against the agent's static tool snapshot at validation time, which
 * meant dynamically-resolved skill tools (`validate-marksheet`, etc.)
 * failed with `Tool "..." not found`. Resolving tools in the workflow
 * step and injecting them via `agent.stream({ tools })` \u2014 with this
 * constant as the floor \u2014 fixes that.
 */

import { globalTools } from './global-tools';
import { getContextTool } from './context-tool';

export const BASE_AGENT_TOOLS = {
	...globalTools,
	getContext: getContextTool,
} as const;

export type BaseAgentToolName = keyof typeof BASE_AGENT_TOOLS;
