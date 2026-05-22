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
const TOOL_MAP: Record<string, any> = {
  'search-entity': searchEntityTool,
  ...coreTools,
  ...workflowTools,
};

/**
 * Module-level singleton skill registry.
 * Initialized lazily on first request.
 */
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
      '/register': 'onboard', '/enroll': 'onboard', '/assign': 'onboard',
      '/update': 'gov', '/edit': 'gov', '/rename': 'gov',
      '/ban': 'gov', '/suspend': 'gov', '/reset': 'gov',
      '/extract': 'assistant', '/generate': 'assistant',
      '/validate': 'assistant', '/publish': 'assistant',
      '/search': 'default', '/find': 'default',
      '/switch': 'default', '/status': 'default',
    };

    const skillName = skillCommandMap[command];
    if (skillName) {
      const skill = skillRegistry.getSkill(skillName);
      if (skill) {
        const skillTools: Record<string, any> = {};
        for (const toolId of skill.tools) {
          const tool = TOOL_MAP[toolId];
          if (tool) skillTools[toolId] = tool;
        }

        // For workflow commands, always inject workflow tools
        if (['/extract', '/generate', '/validate', '/publish'].includes(command)) {
          Object.assign(skillTools, workflowTools);
        }

        // Always include search-entity for context discovery
        if (!skillTools['search-entity']) {
          skillTools['search-entity'] = searchEntityTool;
        }

        return { ...baseTools, ...skillTools, getContext: getContextTool };
      }
    }
  }

  // Default: inject all available tools
  return { ...baseTools, ...coreTools, ...workflowTools, getContext: getContextTool };
}
