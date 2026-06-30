import {
  coreTools,
  searchEntityTool,
} from '$lib/server/mastra/tools/index';
import { globalTools } from '$lib/server/mastra/tools/internal/global-tools';
import { SkillRegistry } from '$lib/server/mastra/skill-registry';
import { getContextTool } from '$lib/server/mastra/tools/internal/context-tool';

const ALL_TOOLS = [
  searchEntityTool,
  ...Object.values(coreTools)
];

export const TOOL_MAP: Record<string, any> = {};
for (const tool of ALL_TOOLS) {
  if (tool && tool.id) {
    TOOL_MAP[tool.id] = tool;
  }
}

export const skillRegistry = new SkillRegistry();
let registryInitialized = false;

export async function ensureRegistry() {
  if (!registryInitialized) {
    const knownTools = new Set(Object.keys(TOOL_MAP));
    await skillRegistry.loadFromDirectory(process.cwd() + '/src/lib/server/mastra/skills', knownTools);
    registryInitialized = true;
  }
}

/**
 * Resolves the toolset for a given user message.
 *
 * Strategy:
 *   - Slash command -> look up the corresponding skill -> return ONLY the tools
 *     that skill declares, plus baseTools (web search/fetch),
 *     search-school-directory (entity resolution), and getContext.
 *   - Plain chat  -> return ONLY baseTools + getContext + search-school-directory.
 *     We deliberately do NOT inject the full TOOL_MAP here. Loading all
 *     ~50 tools blows up the agent's system prompt and inflates every LLM
 *     turn's reasoning, even for trivial prompts like "Say hello".
 *
 *     If a plain-chat user needs a domain tool (e.g. /search), they have to
 *     invoke it as a slash command -- the chatWorkflow has separate skills
 *     for that path. The runtime cost of being explicit is much lower than
 *     the latency cost of always-on 50-tool prompts.
 *
 * Parsing rule: ONLY the first whitespace-separated token of the message is
 * inspected. Tokens after the command name (e.g. `generate`, `publish`,
 * `result`, `view` in `/marksheet generate ...`) are NOT parsed subcommands
 * -- they are freeform natural language the LLM uses to pick a tool. The
 * `CommandDropdown.svelte` UI surfaces a curated verb list for discoverability
 * but the server does not parse it. Examples:
 *
 *     '/marksheet i want you to generate exam report for @AL-azeem'
 *      ^^^^^^^^                                  -> reporting skill
 *                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 *
 *     '/transcript show me a draft of @Alice over @year 2024'
 *      ^^^^^^^^^^                                  -> transcript skill
 *                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 */
export function resolveToolsForMessage(message: string, isSlashCommand: boolean): Record<string, any> {
  const baseTools: Record<string, any> = { ...globalTools };

  if (isSlashCommand) {
    const command = message.trim().split(/\s+/)[0].toLowerCase();

    const skillCommandMap: Record<string, string> = {
      '/marksheet': 'reporting',
      '/enroll': 'write',
      '/admit': 'write',
      '/transfer': 'write',
      '/promote': 'write',
      '/demote': 'write',
      '/update': 'write',
      '/self-assign': 'write',
      '/staff': 'write',
      '/transcript': 'transcript',
      '/grade': 'academic',
      '/mark': 'academic',
      '/attendance': 'academic',
      '/suspend': 'destructive',
      '/reactivate': 'destructive',
      '/password': 'destructive',
      '/search': 'default',
      '/switch': 'default',
      '/context': 'default',
    };

    const skillName = skillCommandMap[command];
    if (skillName) {
      const skill = skillRegistry.getSkill(skillName);
      console.log(`[SkillTools] skillRegistry.getSkill("${skillName}") -> `, skill ? 'Found' : 'Undefined');

      if (skill) {
        const skillTools: Record<string, any> = {};
        for (const toolId of skill.tools) {
          const tool = TOOL_MAP[toolId];
          if (tool) {
            skillTools[toolId] = tool;
          } else {
            console.warn(`[SkillTools] Tool "${toolId}" not found in TOOL_MAP`);
          }
        }

        if (!skillTools['search-school-directory']) {
          skillTools['search-school-directory'] = searchEntityTool;
        }

        return { ...baseTools, ...skillTools, getContext: getContextTool };
      }
    }
  }

  // Plain chat: minimal toolset. The agent should respond conversationally
  // and ask the user to use a slash command for any domain operation.
  return {
    ...baseTools,
    'search-school-directory': searchEntityTool,
    getContext: getContextTool
  };
}
