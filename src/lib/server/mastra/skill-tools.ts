import {
  coreTools,
  workflowTools,
  searchEntityTool,
} from '$lib/server/mastra/tools/index';
import { globalTools } from '$lib/server/mastra/tools/global-tools';
import { SkillRegistry } from '$lib/server/mastra/skill-registry';
import { getContextTool } from '$lib/server/mastra/tools/context-tool';

const ALL_TOOLS = [
  searchEntityTool,
  ...Object.values(coreTools),
  ...Object.values(workflowTools)
];

export const TOOL_MAP: Record<string, any> = {};
for (const tool of ALL_TOOLS) {
  if (tool && tool.id) {
    TOOL_MAP[tool.id] = tool;
  }
}

export const skillRegistry = new SkillRegistry();
let registryInitialized = false;

const warnedDeprecatedCommands = new Set<string>();

export async function ensureRegistry() {
  if (!registryInitialized) {
    const knownTools = new Set(Object.keys(TOOL_MAP));
    await skillRegistry.loadFromDirectory(process.cwd() + '/src/lib/server/mastra/skills', knownTools);
    registryInitialized = true;
  }
}

export function resolveToolsForMessage(message: string, isSlashCommand: boolean): Record<string, any> {
  const baseTools: Record<string, any> = { ...globalTools };

  if (isSlashCommand) {
    const command = message.trim().split(/\s+/)[0].toLowerCase();

    const skillCommandMap: Record<string, string> = {
      '/grade': 'grading', '/mark': 'grading', '/attendance': 'grading',
      '/enroll': 'onboarding', '/admit': 'onboarding', '/transfer': 'onboarding',
      '/update': 'gov', '/suspend': 'gov', '/delete': 'gov', '/password': 'gov',
      '/extract': 'assistant', '/generate': 'assistant',
      '/validate': 'assistant', '/publish': 'assistant',
      '/search': 'default', '/switch': 'default', '/context': 'default',
    };

    const deprecatedAliasMap: Record<string, { canonical: string; skill: string }> = {
      '/ban': { canonical: '/suspend', skill: 'gov' },
      '/edit': { canonical: '/update', skill: 'gov' },
      '/rename': { canonical: '/update', skill: 'gov' },
      '/find': { canonical: '/search', skill: 'default' },
      '/assign': { canonical: '/transfer', skill: 'onboarding' },
      '/reset': { canonical: '/password', skill: 'gov' },
      '/status': { canonical: '/context', skill: 'default' },
    };

    let resolvedCommand = command;
    const alias = deprecatedAliasMap[command];
    if (alias) {
      resolvedCommand = alias.canonical;
      if (!warnedDeprecatedCommands.has(command)) {
        warnedDeprecatedCommands.add(command);
        console.warn(
          `[SkillTools] Slash command "${command}" is deprecated; use "${alias.canonical}" instead.`,
        );
      }
    }

    const skillName = skillCommandMap[resolvedCommand];
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

        if (['/extract', '/generate', '/validate', '/publish'].includes(resolvedCommand)) {
          for (const tool of Object.values(workflowTools)) {
            if (tool && tool.id) {
              skillTools[tool.id] = tool;
            }
          }
        }

        if (!skillTools['search-school-directory']) {
          skillTools['search-school-directory'] = searchEntityTool;
        }

        return { ...baseTools, ...skillTools, getContext: getContextTool };
      }
    }
  }

  return { ...baseTools, ...TOOL_MAP, getContext: getContextTool };
}
