import { allowAnonymousChats } from "$lib/constants";
import type { xUIMessage } from "$lib/types/chat-types";
import { error, type RequestHandler } from "@sveltejs/kit";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { EdApexGateway } from "$lib/server/mastra/gateway";
import { createTenantContext, WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import { createMastraDb } from "$lib/server/mastra/db";
import { env } from "$env/dynamic/private";
import type { ClassSection } from "$lib/types/result-types";
import { processMentions, type MentionTag } from "$lib/server/mastra/mention-processor";
import { TenantContextCache } from "$lib/server/mastra/context-cache";
import type { FileReference } from "$lib/server/mastra/file-context";

// Module-level cache instance persists across requests for session-based caching
const tenantContextCache = new TenantContextCache();

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {
  const mastraDb = createMastraDb();
  let { chatId, messages, agentId, selectedClass, fileReferences, mentions }: {
    chatId: string;
    messages: xUIMessage[];
    agentId: string;
    selectedClass?: ClassSection;
    fileReferences?: FileReference[];
    mentions?: MentionTag[];
  } = await request.json();

  if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
  if (!user) error(401, "User session required for provider resolution");

  const selectedChatModel = cookies.get("selected-model");
  if (!selectedChatModel) error(400, "No chat model selected");

  if (!agentId) {
    agentId = cookies.get("selected-agent") || "";
  }

  // Generate a thread ID if this is a new conversation.
  // Mastra memory uses threadId + resourceId for persistence.
  if (!chatId && messages.length > 0) {
    chatId = generateId();
  }

  const resourceId = `user-${user.id}`;
  const message = messages[messages.length - 1];

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

  // Process @mention tags to update TenantContext before routing to Gateway
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

  const gateway = new EdApexGateway(
      mastraDb,
      user.id,
      env.ENCRYPTION_KEY || '',
      {
          OPENAI_API_KEY: env.OPENAI_API_KEY,
          ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
          GOOGLE_API_KEY: env.GOOGLE_API_KEY,
          DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
          GROQ_API_KEY: env.GROQ_API_KEY,
          NVIDIA_NIM_API_KEY: env.NVIDIA_NIM_API_KEY,
          MISTRAL_API_KEY: env.MISTRAL_API_KEY,
          OPENCODE_API_KEY: env.OPENCODE_API_KEY,
      }
  );

  const stream = createUIMessageStream<xUIMessage>({
    execute: async ({ writer }) => {
      // Track open message parts so we can close them on abort (Requirement 22.3)
      const openParts: { type: 'text' | 'reasoning'; id: string }[] = [];

      // Emit chatId immediately so the client can navigate to /chat/[chatId]
      // Title will be updated asynchronously via a second data-chat event
      if (chatId && messages.length === 1) {
        writer.write({
          type: "data-chat",
          id: chatId,
          data: {
            id: chatId, title: 'New Chat', model: selectedChatModel, createdAt: new Date(),
            userId: null,
            visibility: ""
          },
          transient: true,
        } as any);

        // Generate title asynchronously (non-blocking)
        const promptText = (message.parts as any)?.find((p: any) => p.type === 'text')?.text || '';
        gateway.generateTitle(
          promptText || 'New Chat',
          activeContext
        )
          .then(async (title: string) => {
            writer.write({
              type: "data-chat",
              id: chatId,
              data: {
                id: chatId, title, model: selectedChatModel, createdAt: new Date(),
                userId: null,
                visibility: ""
              },
              transient: true,
            });
          })
          .catch((e) => {
            console.error('[api/chat] Title generation failed:', e);
          });
      }

      const promptText = (message.parts as any)?.find((p: any) => p.type === 'text')?.text || (message as any).content || "";
      
      // Construct workspace identifier for file-as-context injection (Requirement 9.4)
      const workspace = activeContext.classId && activeContext.sectionId
          ? `${activeContext.classId}_${activeContext.sectionId}`
          : undefined;

      try {
        const result = await gateway.stream(promptText, activeContext, {
            threadId: chatId,
            resourceId,
            conversationOverride: selectedChatModel,
            fileReferences: fileReferences?.length ? fileReferences : undefined,
            workspace,
            abortSignal: request.signal,
            onStepFinish: (step) => {
                if (step.toolCalls && step.toolCalls.length > 0) {
                    for (const call of step.toolCalls) {
                        writer.write({
                            type: "data-workflow",
                            data: { tool: call.toolName, args: call.args }
                        } as any);
                    }
                }
            }
        });
        
        if ('rejected' in result && result.rejected) {
            // Emit confirmation chunk if the gateway provides structured confirmation data
            const gatewayResult = result as any;
            if (gatewayResult.confirmation) {
                writer.write({
                    type: "data-confirmation",
                    data: gatewayResult.confirmation
                } as any);
            }

            // Manual streaming for rejected responses (confidence gate async generator)
            const rejectPartId = generateId();
            openParts.push({ type: 'text', id: rejectPartId });
            writer.write({ type: "text-start", id: rejectPartId } as any);
            for await (const chunk of result.textStream as AsyncIterable<string>) {
                writer.write({ type: "text-delta", id: rejectPartId, delta: chunk } as any);
            }
            writer.write({ type: "text-end", id: rejectPartId } as any);
            openParts.pop();
            writer.write({ type: "finish", finishReason: "stop" } as any);
            return;
        }

        // Use toAISdkStream — the official Mastra adapter for AI SDK v5+ format.
        // This is the documented pattern from https://mastra.ai/reference/streaming/agents/stream
        const chatStream = toAISdkStream(result as any, {
            from: 'agent',
            sendReasoning: true,
            sendSources: true,
        });
        writer.merge(chatStream as any);

        // Manual message persistence — Mastra's auto-persistence in the supervisor
        // pattern doesn't reliably fire with dynamic per-request agents.
        // We persist explicitly after the stream completes to ensure messages
        // survive page refreshes.
        if (chatId && !request.signal.aborted) {
            (async () => {
                try {
                    const { createMastraStorage, ensureStorageInitialized } = await import("$lib/server/mastra/storage");
                    await ensureStorageInitialized();
                    const persistStorage = createMastraStorage();
                    const memoryStore = await persistStorage.getStore('memory');
                    if (!memoryStore) return;

                    // Wait for the assistant's full text to be available
                    let assistantText = '';
                    try {
                        assistantText = await result.text;
                    } catch {
                        return; // Aborted or errored — skip persistence
                    }
                    if (!assistantText) return;

                    // Ensure thread exists
                    let thread = await memoryStore.getThreadById({ threadId: chatId });
                    if (!thread) {
                        thread = await memoryStore.saveThread({
                            thread: {
                                id: chatId,
                                resourceId,
                                title: 'New Chat',
                                metadata: { model: selectedChatModel, visibility: 'private' },
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            }
                        });
                    }

                    // Save user + assistant messages
                    await memoryStore.saveMessages({
                        messages: [
                            {
                                id: generateId(),
                                type: 'text',
                                role: 'user',
                                content: { parts: [{ type: 'text', text: promptText }], format: 2 },
                                createdAt: new Date(),
                                threadId: chatId,
                                resourceId,
                            } as any,
                            {
                                id: generateId(),
                                type: 'text',
                                role: 'assistant',
                                content: { parts: [{ type: 'text', text: assistantText }], format: 2 },
                                createdAt: new Date(Date.now() + 1),
                                threadId: chatId,
                                resourceId,
                            } as any
                        ]
                    });
                } catch (persistErr) {
                    console.error('[api/chat] Manual persistence failed:', persistErr);
                }
            })();
        }
      } catch (e: unknown) {
        // AbortSignal propagation (Requirements 22.1, 22.2, 22.3, 22.4)
        // When the client clicks stop, request.signal fires and the stream aborts.
        // We close any open message parts and emit a clean finish event.
        // Mastra Memory does NOT persist partial messages because the agent stream
        // was cancelled before completion (native abort behavior).
        const isAbort = (e instanceof Error && e.name === 'AbortError') ||
                        (e instanceof DOMException && e.name === 'AbortError') ||
                        request.signal.aborted;

        if (isAbort) {
          // Close any open message parts so the UI transitions out of loading state
          for (const part of openParts) {
            const endType = part.type === 'text' ? 'text-end' : 'reasoning-end';
            writer.write({ type: endType, id: part.id } as any);
          }
          openParts.length = 0;

          // Emit finish with finishReason: "stop" so the client knows the stream ended cleanly
          writer.write({ type: "finish", finishReason: "stop" } as any);
          return;
        }

        // Re-throw non-abort errors to be handled by onError
        throw e;
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      // Don't log abort errors — they are expected user-initiated cancellations
      if (msg.includes('AbortError') || msg.includes('aborted')) {
        return "Generation stopped.";
      }
      console.error(`[api/chat] Error: ${msg}`);
      return "Oops! Something went wrong.";
    },
  });

  return createUIMessageStreamResponse({ stream });
};