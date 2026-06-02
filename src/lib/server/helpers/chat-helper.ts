import type { xUIMessage, ChatMessage } from "$lib/types/chat-types";
import { RequestContext } from "@mastra/core/request-context";
import type { RequestContextValues } from "$lib/server/mastra/agents";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { MastraMemory, StorageThreadType } from "@mastra/core/memory";
import type { UIMessageStreamWriter } from "ai";
import { mastra } from "$lib/server/mastra";
import z from "zod";
import { ModelRouter } from "$lib/server/mastra/router";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from '$lib/server/mastra/db/schema';

import {
  coreTools,
  workflowTools,
  searchEntityTool,
} from '$lib/server/mastra/tools/index';
import { globalTools } from '$lib/server/mastra/tools/global-tools';
import { SkillRegistry } from '$lib/server/mastra/skill-registry';
import { getContextTool } from '$lib/server/mastra/tools/context-tool';

export function convertToUIMessages(messages: Array<ChatMessage>): Array<xUIMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as xUIMessage["parts"],
    role: message.role as xUIMessage["role"],
    metadata: message.metadata as xUIMessage["metadata"],
    createdAt: message.createdAt,
  }));
}

// ─── Context Composition ────────────────────────────────────────────────────

/**
 * Builds the per-request RequestContext for the supervisor.
 * This is the single entry point for composing all per-request context.
 *
 * The supervisor's own `instructions` callback reads tenantContext
 * directly from requestContext, so we don't need to pre-build instructions here.
 */
export async function buildRequestContext(params: {
  context: TenantContext;
  userId: number,
  modelId: string;
  isSlashCommand: boolean;
  lastMessage: string;
  mastraDb: LibSQLDatabase<typeof schema>;
}): Promise<RequestContext<RequestContextValues>> {
  const { context, userId, modelId, isSlashCommand, lastMessage, mastraDb } = params;

  const router = new ModelRouter(mastraDb, userId);
  const resolvedModel = await router.resolveModel(
    'supervisor',
    modelId,
    false,
    undefined
  );
  const requestContext = new RequestContext<RequestContextValues>();

  requestContext.set('tenantContext', context);
  requestContext.set('modelId', `edapex/${resolvedModel.provider}/${resolvedModel.model}`);
  requestContext.set('isSlashCommand', isSlashCommand);
  requestContext.set('lastMessage', lastMessage);

  return requestContext;
}

/**
 * Generate a short title for the thread using the titler agent.
 * Streams the title to the client via a custom stream part, then persists it.
 */
export async function generateThreadTitle(
  userId: number,
  memory: MastraMemory | undefined,
  threadId: string,
  text: string,
  writer: UIMessageStreamWriter<xUIMessage>,
): Promise<void> {
  if (!memory) return;

  const titleAgent = mastra.getAgent('title');
  const result = await titleAgent.generate(`Summarize: "${text}"`);
  if (result.error) {
    throw result.error;
  }
  const finalTitle = (result?.text || 'New Chat').slice(0, 20).trim();

  writer.write({
    id: `thread-title-${threadId}`,
    type: 'data-threadTitle' as any,
    data: { title: finalTitle },
  });

  // Persist the title to the thread metadata
  await memory.createThread({
    threadId,
    resourceId: `user-${userId}`,
    title: finalTitle,
  });
}

// ─── Thread Management (adapted from Quintui/openchat) ──────────────────────

/**
 * Resolve (get or create) a thread for the given threadId.
 * If the thread is newly created, emits a `data-new-thread-created` stream part.
 * Returns the thread and whether it was just created.
 */
export async function resolveThread(
  memory: MastraMemory | undefined,
  threadId: string,
  resourceId: string,
  writer: UIMessageStreamWriter<xUIMessage>,
): Promise<{ thread: StorageThreadType; isNew: boolean }> {
  if (!memory) {
    throw new Error('Memory is not configured for the supervisor agent');
  }

  const existing = await memory.getThreadById({ threadId });

  if (existing) {
    return { thread: existing, isNew: false };
  }

  const created = await memory.createThread({
    threadId,
    resourceId,
    title: 'New Chat',
  });

  writer.write({
    id: created.id,
    type: 'data-threadCreated',
    data: {
      threadId: created.id,
      title: created.title ?? 'New Chat',
      resourceId: created.resourceId,
      visibility: 'PRIVATE',
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  } as any);

  return { thread: created, isNew: true };
}

/**
 * Map of tool IDs to their Mastra createTool instances for dynamic injection.
 * Used by the skill-based routing to inject specific tool subsets.
 */
const ALL_TOOLS = [
  searchEntityTool,
  ...Object.values(coreTools),
  ...Object.values(workflowTools)
];

const TOOL_MAP: Record<string, any> = {};
for (const tool of ALL_TOOLS) {
  if (tool && tool.id) {
    TOOL_MAP[tool.id] = tool;
  }
}

/**
 * Module-level singleton skill registry.
 * Initialized lazily on first request.
 */
export const skillRegistry = new SkillRegistry();
let registryInitialized = false;

/**
 * Slice 8: per-process set of deprecated slash commands already warned about.
 * Resets on process restart. Each command is announced at most once per session.
 */
const warnedDeprecatedCommands = new Set<string>();

export async function ensureRegistry() {
  if (!registryInitialized) {
    const knownTools = new Set(Object.keys(TOOL_MAP));
    await skillRegistry.loadFromDirectory(process.cwd() + '/src/lib/server/mastra/skills', knownTools);
    registryInitialized = true;
  }
}

/**
 * Resolves the tool map to inject into the Assistant based on the classified intent.
 * If a specific skill matches the slash command, only that skill's tools are injected.
 * Otherwise, all core + workflow tools are available.
 *
 * Global Tools (web-search, web-fetch) are ALWAYS injected regardless of active skill.
 */
export function resolveToolsForMessage(message: string, isSlashCommand: boolean): Record<string, any> {
  // Global Tools are always available
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

    // Slice 8: deprecated slash-command aliases retained for one minor version.
    // Each entry maps a legacy token to its canonical replacement and the
    // target skill. The user sees a one-shot console warning per session.
    const deprecatedAliasMap: Record<string, { canonical: string; skill: string }> = {
      '/ban':     { canonical: '/suspend',  skill: 'gov' },
      '/edit':    { canonical: '/update',   skill: 'gov' },
      '/rename':  { canonical: '/update',   skill: 'gov' },
      '/find':    { canonical: '/search',   skill: 'default' },
      '/assign':  { canonical: '/transfer', skill: 'onboarding' },
      '/reset':   { canonical: '/password', skill: 'gov' },
      '/status':  { canonical: '/context',  skill: 'default' },
    };

    let resolvedCommand = command;
    const alias = deprecatedAliasMap[command];
    if (alias) {
      resolvedCommand = alias.canonical;
      if (!warnedDeprecatedCommands.has(command)) {
        warnedDeprecatedCommands.add(command);
        console.warn(
          `[ChatHelper] Slash command "${command}" is deprecated; use "${alias.canonical}" instead.`,
        );
      }
    }

    const skillName = skillCommandMap[resolvedCommand];
    console.log(`[ChatHelper] Parsed command: "${command}" -> Skill name: "${skillName}"`);

    if (skillName) {
      let toolIds = [];
      const skill = skillRegistry.getSkill(skillName);
      console.log(`[ChatHelper] skillRegistry.getSkill("${skillName}") -> `, skill ? 'Found' : 'Undefined');

      if (skill) {
        const skillTools: Record<string, any> = {};
        for (const toolId of skill.tools) {
          const tool = TOOL_MAP[toolId];
          if (tool) {
            skillTools[toolId] = tool;
            toolIds.push(toolId);
          } else {
            console.warn(`[ChatHelper] Tool "${toolId}" not found in TOOL_MAP`);
          }
        }

        // For workflow commands, always inject workflow tools
        if (['/extract', '/generate', '/validate', '/publish'].includes(resolvedCommand)) {
          for (const tool of Object.values(workflowTools)) {
            if (tool && tool.id) {
              skillTools[tool.id] = tool;
            }
          }
        }

        // Always include search-school-directory for context discovery
        if (!skillTools['search-school-directory']) {
          skillTools['search-school-directory'] = searchEntityTool;
        }

        const tools = { ...baseTools, ...skillTools, getContext: getContextTool };
        console.log('[ChatHelper] Resolved tool IDs (Slash Command):', Object.keys(tools));
        return tools;
      }
    }
  }

  // Default: inject all available tools, ensuring they are keyed by their actual ID
  const tools = { ...baseTools, ...TOOL_MAP, getContext: getContextTool };
  console.log('[ChatHelper] Resolved tool IDs (Default):', Object.keys(tools));
  return tools;
}
