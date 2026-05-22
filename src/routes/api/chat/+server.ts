/**
 * Chat API Route — EdApex
 *
 * Implements the Quintui/openchat pattern:
 * 1. Parse request, build TenantContext
 * 2. Register per-request EdApexGateway (dynamic credential resolution)
 * 3. Build RequestContext with model/tools/tenant context
 * 4. Call handleChatStream → createUIMessageStreamResponse
 * 5. Thread resolution + title generation via agents/index utilities
 */
import { allowAnonymousChats } from "$lib/constants";
import type { xUIMessage } from "$lib/types/chat-types";
import { error, type RequestHandler } from "@sveltejs/kit";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { createTenantContext, WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import type { ClassSection } from "$lib/types/result-types";
import { processMentions, type MentionTag } from "$lib/server/mastra/mention-processor";
import { TenantContextCache } from "$lib/server/mastra/context-cache";
import type { FileReference } from "$lib/server/mastra/file-context";
import { injectFileContext } from "$lib/server/mastra/file-context";
import { mastra } from "$lib/server/mastra";
import { EdApexGateway } from "$lib/server/mastra/gateway";
import { buildRequestContext, resolveThread, generateThreadTitle } from "$lib/server/helpers/chat-helper";
import { createMastraDb } from "$lib/server/mastra/db";
import { ModelRouter } from "$lib/server/mastra/router";
import { env } from "$env/dynamic/private";

// Module-level cache (singleton)
const tenantContextCache = new TenantContextCache();

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {
  let { threadId, messages, selectedClass, fileReferences, mentions }: {
    threadId: string;
    messages: xUIMessage[];
    selectedClass?: ClassSection;
    fileReferences?: FileReference[];
    mentions?: MentionTag[];
  } = await request.json();

  if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
  if (!user) error(401, "User session required for provider resolution");

  const selectedChatModel = cookies.get("selected-model");
  if (!selectedChatModel) error(400, "No chat model selected");

  const resourceId = `user-${user.id}`;

  // ─── Build Tenant Context ─────────────────────────────────────────────────

  const tenantContext = createTenantContext({
    schoolId: user.schoolId ?? 1,
    userId: user.id ?? 1,
    designationId: (user as any).designationId ?? 1,
    staffId: (user as any).staffId ?? 1,
    roleId: (user as any).roleId ?? null,
    classId: selectedClass?.id ?? null,
    sectionId: selectedClass?.sectionId ?? null,
    examId: null,
    academicId: null
  });

  let activeContext = tenantContext;
  if (mentions && mentions.length > 0) {
    try {
      const sessionId = session?.id ?? `anon-${user.id}`;
      const designationId = (user as any).designationId ?? 1;
      activeContext = await processMentions(
        mentions,
        tenantContext,
        tenantContextCache,
        sessionId,
        designationId
      );
    } catch (e) {
      if (e instanceof WorkspaceMismatchError) {
        return new Response(
          JSON.stringify({ error: 'WORKSPACE_MISMATCH', message: e.message }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw e;
    }
  }

  // ─── Message Augmentation ─────────────────────────────────────────────────

  const lastMessage = messages[messages.length - 1];
  const promptText = lastMessage.parts?.find((p) => p.type === "text")?.text || "";
  const workspace = activeContext.classId && activeContext.sectionId
    ? `${activeContext.classId}_${activeContext.sectionId}`
    : undefined;

  // Inject file-as-context before routing to assistant
  let augmentedPrompt = promptText;
  if (fileReferences?.length && workspace) {
    const fileContext = await injectFileContext(fileReferences, workspace);
    if (fileContext) {
      augmentedPrompt = `${fileContext}\n\n${promptText}`;
    }
  }

  // Update the last message's text part with the augmented prompt
  if (augmentedPrompt !== promptText && lastMessage.parts) {
    const textPart = lastMessage.parts.find((p) => p.type === "text");
    if (textPart && 'text' in textPart) {
      (textPart as any).text = augmentedPrompt;
    }
  }

  const mastraDb = createMastraDb();
  const gateway = new EdApexGateway(mastraDb, user.id);
  mastra.addGateway(gateway);

  // ─── Build Request Context ────────────────────────────────────────────────

  const isSlashCommand = augmentedPrompt.trim().startsWith('/');
  const requestContext = await buildRequestContext({
    context: activeContext,
    userId: user.id,
    modelId: selectedChatModel,
    isSlashCommand,
    lastMessage: augmentedPrompt,
    mastraDb,
  });

  const stream = createUIMessageStream<xUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      try {
        const agent = mastra.getAgent("assistant");
        const memory = await agent.getMemory();
        if (!memory) {
          throw new Error("Memory is not configured for the assistant agent.");
        }

        // Resolve (get or create) thread — emits data-new-thread-created if new
        const { thread, isNew } = await resolveThread(
          memory,
          threadId,
          resourceId,
          writer,
        );

        // Stream via handleChatStream — the core of the openchat pattern
        const chatStream = await handleChatStream<xUIMessage>({
          version: 'v6',
          mastra,
          agentId: agent.id,
          params: {
            messages,
            maxSteps: 20,
            requestContext,
            abortSignal: request.signal,
            memory: {
              thread,
              resource: resourceId,
            },
            onFinish: async ({ text }) => {
              if (!isNew) return;
              try {
                await generateThreadTitle(
                  user.id,
                  memory,
                  threadId,
                  text,
                  writer,
                );
              } catch (err) {
                console.error("Failed to generate thread title:", err);
              }
            },
          },
          sendReasoning: true,
          sendSources: true,
          sendStart: false,
          onError: (e) => {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('AbortError') || msg.includes('aborted')) {
              return "Generation stopped.";
            }
            console.error(`[api/chat] Error: ${msg}`);
            return "Oops! Something went wrong.";
          },
        });

        // Merge the Mastra chat stream into the UI message stream
        writer.merge(chatStream as any);
      } catch (err) {
        console.error("Chat stream error:", err);
        throw err;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
};

/**
 * GET handler for history hydration.
 * When the client navigates to `/chat/[chatId]`, this endpoint returns
 * the persisted messages in AI SDK v5 format for UI hydration.
 *
 * Uses the static assistant agent's Memory instance — the same instance
 * that auto-persists messages during streaming.
 */
export const GET: RequestHandler = async ({ url, locals: { user } }) => {
  if (!user) error(401, 'Unauthorized');

  const chatId = url.searchParams.get('chatId');
  if (!chatId) error(400, 'Missing chatId');

  const resourceId = `user-${user.id}`;
  const assistant = mastra.getAgent('assistant');
  const memory = await assistant.getMemory();

  let response = null;
  try {
    response = await memory?.recall({ threadId: chatId, resourceId });
  } catch {
    console.log('No previous messages found.');
  }

  const uiMessages = toAISdkV5Messages(response?.messages || []);
  return Response.json(uiMessages);
};