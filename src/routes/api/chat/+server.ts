import { allowAnonymousChats } from "$lib/constants";
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
  generateText,
} from "ai";
import { AgentService, useAgent } from "$lib/server/service/agent.service";
import type { ClassSection } from "$lib/types/result-types";

export const POST: RequestHandler = async ({ request, locals: { user, session }, cookies }) => {
  let { chatId, messages, agentId, selectedClass }: ChatResponse & { selectedClass?: ClassSection } = await request.json();
  if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
  const selectedChatModel = cookies.get("selected-model");
  if (messages.length === 0) error(400, "No user message found");
  if (!selectedChatModel) error(400, "No chat model selected");

  const agentService = useAgent();
  const provider = await agentService.use(CredentialType.QWEN_CODE).geModelProvider();
  if (!provider) error(400, "No provider found");

  let message = messages[messages.length - 1];
  if (user && messages.length === 1) {
    if (!chatId) {
      chatId = await repo.chat.createChat({
        userId: user.id,
        title: "New Chat",
        model: selectedChatModel,
      });
    }
    await repo.chat.upsertMessage({ chatId, message });
    messages = await repo.chat.loadMessages(chatId);
  }

  const tools = AgentService.getTools(user, agentId);
  const systemPrompt = await AgentService.getSystemPrompt(user, agentId, selectedClass);
  const userStopSignal = new AbortController();
  const stream = createUIMessageStream<xUIMessage>({
    execute: async ({ writer }) => {
      if (user && chatId && messages.length === 1) {
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
        stopWhen: stepCountIs(30),
        tools: tools(writer, model),
        experimental_transform: smoothStream({
          delayInMs: 20,
          chunking: "line",
        }),
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