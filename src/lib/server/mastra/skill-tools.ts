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

  return { ...baseTools, ...TOOL_MAP, getContext: getContextTool };
}
