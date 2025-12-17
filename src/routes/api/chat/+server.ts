import { tools } from "$lib/chat/tools";
import { allowAnonymousChats } from "$lib/utils/constants";
import { CredentialType } from "$lib/schema/chat-schema";
import { repo } from "$lib/server/repository";
import { generateTitle } from "$lib/server/helpers/chat-helper";
import type { ChatResponse, xUIMessage } from "$lib/types/chat-types";
import { error, type RequestHandler } from "@sveltejs/kit";
import {
  convertToModelMessages,
  streamText,
  smoothStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import { AgentService, useAgent } from "$lib/server/service/agent.service";

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {
  let { chatId, messages, agentId }: ChatResponse = await request.json();
  if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
  const selectedChatModel = cookies.get("selected-model");
  if (messages.length === 0) error(400, "No user message found");
  if (!selectedChatModel) error(400, "No chat model selected");

  const agentService = useAgent();
  const provider = await agentService.use(CredentialType.QWEN_CODE).geModelProvider();
  if (!provider) error(400, "No provider found");

  let systemPrompt = AgentService.getSystemPrompt("examiner", agentId);
  let message = messages[messages.length - 1];
  if (user && messages.length === 1) {
    if (!chatId) {
      chatId = await repo.chat.createChat({
        userId: user?.id ?? null, // allow null if anon allowed
        title: "New Chat",
        model: selectedChatModel,
      });
    }
    await repo.chat.upsertMessage({ chatId, message });
    messages = await repo.chat.loadMessages(chatId);
    const examTypes = await repo.result.getExamTypes();
    
    systemPrompt += `\n\nEXAM TYPES: ${examTypes.map((e) => `- ${e.title} (ID: ${e.id})`).join("\n")}`;
    systemPrompt += `\n\nUSER ID: ${user.id}`;
  }

  const userStopSignal = new AbortController();
  const stream = createUIMessageStream<xUIMessage>({
    execute: async ({ writer }) => {
      if (user && chatId) {
        generateTitle({ message, provider })
          .then(async (title) => {
            const chat = await repo.chat.updateChat({ id: chatId, title, model: selectedChatModel });
            writer.write({
              type: "data-chat",
              id: chatId,
              data: chat,
              transient: true,
            });
          })
          .catch((e) => {
            console.error(e);
          });
      }
      const model = provider.languageModel(selectedChatModel);
      const result = streamText({
        model,
        system: systemPrompt,
        messages: convertToModelMessages(messages),
        abortSignal: userStopSignal.signal,
        tools: agentId ? tools(writer, model) : undefined,
        stopWhen: stepCountIs(5),
        experimental_transform: smoothStream({ chunking: "word" }),
      });

      result.consumeStream();
      const uiStream = result.toUIMessageStream({
        originalMessages: messages,
        sendStart: false,
      });

      writer.merge(uiStream);
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`message: ${message}, error: ${e}`);
      return "Oops!";
    },
    onFinish: async ({ responseMessage }) => {
      if (!user) return;
      try {
        await repo.chat.upsertMessage({
          chatId,
          message: responseMessage,
        });
      } catch (error) {
        console.error(error);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
};
