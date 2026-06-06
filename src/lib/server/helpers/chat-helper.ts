import type { xUIMessage, ChatMessage } from "$lib/types/chat-types";
import { RequestContext } from "@mastra/core/request-context";
import type { RequestContextValues } from "$lib/server/mastra/agents";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { MastraMemory, StorageThreadType } from "@mastra/core/memory";
import { mastra } from "$lib/server/mastra";
import { ModelRouter } from "$lib/server/mastra/router";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from '$lib/server/mastra/storage/libsql/app-db.schema';

import type { ToolStream } from "@mastra/core/tools";

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
 * Build a minimal `RequestContext` for non-chat routes that only need
 * the workspace filesystem resolver. Skips model resolution and
 * slash-command classification.
 */
export function buildWorkspaceRequestContext(
  context: TenantContext,
): RequestContext<RequestContextValues> {
  const requestContext = new RequestContext<RequestContextValues>();
  requestContext.set('tenantContext', context);
  return requestContext;
}

/**
 * Generate a short title for the thread using the titler agent.
 * Streams the title to the client via a custom stream part, then persists it.
 */
export async function generateThreadTitle({
  resourceId,
  memory,
  threadId,
  prompt,
  writer,
}: {
  resourceId: string;
  memory: MastraMemory | undefined;
  threadId: string;
  prompt: string;
  writer: ToolStream;
}): Promise<string> {
  if (!memory) return "";

  const { thread, isNew } = await resolveThread({
    memory,
    threadId,
    resourceId,
    writer,
  });


  let finalTitle = thread.title;
  if (isNew || finalTitle === 'New Chat') {
    const titleAgent = mastra.getAgent('title');
    const result = await titleAgent.generate(`Summarize: "${prompt}"`);
    if (result.error) {
      throw result.error;
    }
    finalTitle = (result?.text || 'New Chat').slice(0, 20).trim();
  }

  await writer.write({
    id: `thread-title-${threadId}`,
    type: 'data-threadTitle',
    data: { title: finalTitle },
  });

  // Persist the title to the thread metadata
  await memory.createThread({
    threadId,
    resourceId,
    title: finalTitle,
  });

  return finalTitle || "";
}

// ─── Thread Management (adapted from Quintui/openchat) ──────────────────────

/**
 * Resolve (get or create) a thread for the given threadId.
 * If the thread is newly created, emits a `data-new-thread-created` stream part.
 * Returns the thread and whether it was just created.
 */
export async function resolveThread({
  memory,
  threadId,
  resourceId,
  writer,
}: {
  memory: MastraMemory | undefined;
  threadId: string;
  resourceId: string;
  writer: ToolStream;
}): Promise<{ thread: StorageThreadType; isNew: boolean }> {
  if (!memory) {
    throw new Error('Memory is not configured for the agent');
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
