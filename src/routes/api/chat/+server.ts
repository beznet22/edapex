import { allowAnonymousChats } from "$lib/constants";
import type { xUIMessage } from "$lib/types/chat-types";
import { error, type RequestHandler } from "@sveltejs/kit";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
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
      }
  );

  const stream = createUIMessageStream<xUIMessage>({
    execute: async ({ writer }) => {
      // Title generation for new conversations (non-blocking)
      if (chatId && messages.length === 1) {
        const promptText = (message.parts as any)?.find((p: any) => p.type === 'text')?.text || '';
        gateway.generate(
          `Generate a very short title (under 20 characters) summarizing the following user message. Return ONLY the title text, no quotes or colons:\n\n${promptText || 'New Chat'}`,
          activeContext,
          { conversationOverride: selectedChatModel }
        )
          .then(async (titleResult: any) => {
            const title = (titleResult?.text || 'New Chat').slice(0, 20).trim();
            // Emit the chat metadata to the client for sidebar updates
            writer.write({
              type: "data-chat",
              id: chatId,
              data: { id: chatId, title, model: selectedChatModel, createdAt: new Date() },
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

      const result = await gateway.stream(promptText, activeContext, {
          threadId: chatId,
          resourceId,
          conversationOverride: selectedChatModel,
          fileReferences: fileReferences?.length ? fileReferences : undefined,
          workspace,
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

          // Manual streaming for fallback responses
          for await (const chunk of result.textStream as AsyncIterable<string>) {
              writer.write({ type: "text-delta", delta: chunk, id: generateId() } as any);
          }
          writer.write({ type: 'finish', finishReason: 'stop' } as any);
          return;
      }
      
      const vResult = result as any;
      if (vResult.toUIMessageStream) {
          vResult.consumeStream();
          const uiStream = vResult.toUIMessageStream({
              originalMessages: messages,
              sendStart: false,
          });
          writer.merge(uiStream);
      }
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[api/chat] Error: ${msg}`);
      return "Oops! Something went wrong.";
    },
  });

  return createUIMessageStreamResponse({ stream });
};