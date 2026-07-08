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
 *   - Plain chat  -> ALSO inspect the message for domain keywords
 *     (marksheet/transcript/academic) and load the corresponding skill's
 *     tools when matched. Per project requirement, all marksheet and
 *     transcript actions are natural-language intents — the LLM deduces
 *     which tool to call from freeform prompt, NOT a sub-command.
 *
 *     Without this, a plain chat message like "process the marksheet for
 *     AL-azeem" only sees baseTools + search-school-directory + getContext
 *     and the assistant falls back to formatting the marksheet inline in
 *     its text response (causing duplicate content in the chat). With
 *     natural-language skill loading, the assistant has access to
 *     `prepareDocumentStream`, `validate-marksheet`, etc. The client-side
 *     tool call drives the workspace panel streaming.
 *
 *     We deliberately do NOT inject the full TOOL_MAP for plain chat.
 *     Loading all ~50 tools blows up the agent's system prompt and
 *     inflates every LLM turn's reasoning. The keyword match is narrow
 *     enough that trivial prompts ("Say hello") don't get the full set.
 *
 * Parsing rule: ONLY the first whitespace-separated token of the message is
 * inspected for slash commands. For plain chat, the FULL message is
 * scanned for skill keywords. Tokens after the command name (e.g.
 * `generate`, `publish`, `result`, `view` in `/marksheet generate ...`)
 * are NOT parsed subcommands — they are freeform natural language the
 * LLM uses to pick a tool. The `CommandDropdown.svelte` UI surfaces a
 * curated verb list for discoverability but the server does not parse
 * it. Examples:
 *
 *     '/marksheet i want you to generate exam report for @AL-azeem'
 *      ^^^^^^^^                                  -> reporting skill
 *                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 *
 *     '/transcript show me a draft of @Alice over @year 2024'
 *      ^^^^^^^^^^                                  -> transcript skill
 *                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ -> freeform LLM context
 *
 *     'process the marksheet for AL-azeem'       -> reporting skill (NL)
 *     'generate transcript for Alice'             -> transcript skill (NL)
 */
const SKILL_KEYWORDS: Array<{ skill: string; patterns: RegExp[] }> = [
  {
    skill: 'reporting',
    patterns: [
      /\bmarksheet\b/i,
      /\bmark\s*sheet\b/i,
      /\bresult\s*card\b/i,
      /\breport\s*card\b/i,
      /\bprocess\s+(?:the\s+)?(?:marksheet|mark\s*sheets?)\b/i,
      /\bformat\s+(?:the\s+)?(?:marksheet|mark\s*sheets?)\b/i,
      /\bextract\s+(?:the\s+)?(?:marks?|scores?|grades?)\b/i,
      /\bvalidate\s+(?:the\s+)?(?:marksheet|mark\s*sheets?)\b/i,
      /\bpublish\s+(?:the\s+)?(?:result|marksheet)/i
    ]
  },
  {
    skill: 'transcript',
    patterns: [
      /\btranscript\b/i,
      /\bacademic\s+report\b/i
    ]
  },
  {
    skill: 'academic',
    patterns: [
      /\battendance\b/i,
      /\benter\s+(?:the\s+)?marks?\b/i,
      /\brecord\s+(?:the\s+)?marks?\b/i,
      /\bgrade\s+(?:a\s+)?student\b/i
    ]
  }
];

function detectNaturalLanguageSkill(message: string): string | null {
  for (const { skill, patterns } of SKILL_KEYWORDS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) return skill;
    }
  }
  return null;
}

export const SKILL_COMMAND_MAP: Record<string, string> = {
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
  '/context': 'default'
};

export function resolveToolsForMessage(message: string, isSlashCommand: boolean): Record<string, any> {
  const baseTools: Record<string, any> = { ...globalTools };

  const skillCommandMap = SKILL_COMMAND_MAP;

  let skillName: string | null = null;
  if (isSlashCommand) {
    const command = message.trim().split(/\s+/)[0].toLowerCase();
    skillName = skillCommandMap[command] ?? null;
  } else {
    // Plain chat: detect natural-language skill intent from the full message.
    skillName = detectNaturalLanguageSkill(message);
  }

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

  // Plain chat with no detected skill intent: minimal toolset. The agent
  // responds conversationally and only the base tools + getContext are
  // available. (For trivial prompts like "Say hello" this avoids
  // injecting all 50 domain tools.)
  return {
    ...baseTools,
    'search-school-directory': searchEntityTool,
    getContext: getContextTool
  };
}
