import type { xUIMessage, ChatMessage } from "$lib/types/chat-types";
import { RequestContext } from "@mastra/core/request-context";
import type { RequestContextValues } from "$lib/server/mastra/agents";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import type { MastraMemory, StorageThreadType } from "@mastra/core/memory";
import type { MastraModelConfig } from "@mastra/core/llm";
import { mastra } from "$lib/server/mastra";
import { resolveModelForRequest, pickDefaultModelId } from "$lib/server/mastra/provider";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { BaseRepository } from "$lib/server/repository/base.repo";
import { getDatabase } from "$lib/server/db";
import { env } from "$env/dynamic/private";

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
 * Builds the per-request RequestContext.
 *
 * Calls `resolveModelForRequest` to build a pre-resolved `MastraModelConfig`
 * (string, `OpenAICompatibleConfig`, or `LanguageModelV2` instance) and
 * stores it in `modelConfig`. Optional `providerOptions` (variant
 * options keyed by providerId) are also stored for the agent's
 * `stream(..., { providerOptions })` call to apply.
 */
export async function buildRequestContext(params: {
  context: TenantContext;
  userId: number;
  modelId: string;
  isSlashCommand: boolean;
  lastMessage: string;
}): Promise<RequestContext<RequestContextValues>> {
  const { context, userId, modelId, isSlashCommand, lastMessage } = params;
  const requestContext = new RequestContext<RequestContextValues>();

  requestContext.set('tenantContext', context);
  requestContext.set('isSlashCommand', isSlashCommand);
  requestContext.set('lastMessage', lastMessage);

  const db = getAppDb();
  const envKeys = env as Record<string, string | undefined>;

  if (modelId) {
    const resolved = await resolveModelForRequest(userId, modelId, db);
    requestContext.set('modelConfig', resolved.config as MastraModelConfig);
    if (resolved.providerOptions) {
      requestContext.set('providerOptions', resolved.providerOptions);
    }
  } else {
    const defaultId = await pickDefaultModelId(db, envKeys, userId);
    if (!defaultId) {
      throw new Error(
        'No model available. Connect a provider in Settings → Providers.'
      );
    }
    const resolved = await resolveModelForRequest(userId, defaultId, db);
    requestContext.set('modelConfig', resolved.config as MastraModelConfig);
    if (resolved.providerOptions) {
      requestContext.set('providerOptions', resolved.providerOptions);
    }
  }

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
 * WorkspaceContextBundle: returned by `resolveWorkspaceContext` so callers
 * can both (a) pass the fully-built tenant context to the workflow /
 * filesystem resolver, AND (b) get a ready-made requestContext that
 * stores it. The string keys are stable across the codebase.
 */
export interface WorkspaceContextBundle {
  tenant: TenantContext;
  requestContext: RequestContext<RequestContextValues>;
}

/**
 * SINGLE SOURCE OF TRUTH for workspace context.
 *
 * Every SvelteKit endpoint that needs to write to or read from a tenant
 * workspace MUST call this helper instead of building the tenant
 * context ad-hoc. The workspace path is computed from
 *   .workspaces/<schoolId>/AY<academicId>-<yearTitle>/<classId>-<slug>_<sectionId>-<slug>/
 * so if you change the path structure here, every endpoint picks it up.
 *
 * Reads three sources:
 *   1. selected-class cookie  — classId/sectionId/className/sectionName
 *      (the canonical/authoritative source; set by class-selector.svelte
 *      and the SharedChatView onboarding modal).
 *   2. DB: active academic year — academicId + academicYearTitle
 *   3. DB: current term         — examTypeId
 *
 * Cookie schema:
 *   { id, classId, className, sectionId, sectionName }
 *   - `id` = ClassSection row id (legacy)
 *   - `classId` = actual class id (USE THIS for workspace scoping;
 *     `id` collides across different section pairings of the same class)
 */
export async function resolveWorkspaceContext(
  cookies: { get: (key: string) => string | undefined },
  user: { id?: number; schoolId?: number | null; staffId?: number | null; designationId?: number | null; roleId?: number | null } | null | undefined
): Promise<WorkspaceContextBundle> {
  // 1. Parse selected-class cookie
  let classId: number | null = null;
  let sectionId: number | null = null;
  let className: string | null = null;
  let sectionName: string | null = null;
  const cookieRaw = cookies.get('selected-class');
  if (cookieRaw) {
    try {
      const parsed = JSON.parse(cookieRaw) as {
        id?: number;
        classId?: number;
        sectionId?: number;
        className?: string;
        sectionName?: string;
      };
      classId = typeof parsed.classId === 'number' ? parsed.classId
              : typeof parsed.id === 'number' ? parsed.id
              : null;
      sectionId = typeof parsed.sectionId === 'number' ? parsed.sectionId : null;
      className = typeof parsed.className === 'string' ? parsed.className : null;
      sectionName = typeof parsed.sectionName === 'string' ? parsed.sectionName : null;
    } catch {
      // ignore parse error, fall through with nulls
    }
  }

  // 2. Resolve academic year + current term from DB (MySQL)
  const db = await getDatabase();
  const baseTenant = createTenantContext({
    schoolId: user?.schoolId ?? 1,
    userId: user?.id ?? 1,
    staffId: user?.staffId ?? 1,
    designationId: user?.designationId ?? 1,
    roleId: user?.roleId ?? null
  });
  const baseRepo = await BaseRepository.build(db, baseTenant);
  const activeYear = await baseRepo.getActiveAcademicYear().catch(() => null);
  const currentTerm = await baseRepo.getCurrentTerm().catch(() => null);

  const tenant: TenantContext = createTenantContext({
    schoolId: user?.schoolId ?? 1,
    userId: user?.id ?? 1,
    designationId: user?.designationId ?? 1,
    staffId: user?.staffId ?? 1,
    roleId: user?.roleId ?? null,
    classId,
    sectionId,
    className,
    sectionName,
    examTypeId: currentTerm?.id ?? null,
    examId: currentTerm?.id ?? null,
    academicId: activeYear?.id ?? null,
    academicYearTitle: activeYear?.title ?? null
  });

  return { tenant, requestContext: buildWorkspaceRequestContext(tenant) };
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
