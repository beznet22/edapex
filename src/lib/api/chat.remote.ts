import { command, getRequestEvent, query } from "$app/server";
import { chatModels } from "$lib/chat/models";
import { allowAnonymousChats } from "$lib/utils/constants";
import { chatVisibilitySchema, fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result";
import { repo } from "$lib/server/repository";
import { result } from "$lib/server/service/result.service";
import { generateContent } from "$lib/server/helpers/chat-helper";
import z from "zod";

export const updateHistory = command(
  z.object({
    chatId: z.string(),
    visibility: chatVisibilitySchema,
  }),
  async ({ chatId, visibility }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false };
    }

    try {
      await repo.chat.updateChatVisibilityById({ chatId, visibility });
      return { success: true };
    } catch {
      return { success: false };
    }
  }
);

export const getHistory = query(z.object({}), async () => {
  const { user, session } = getRequestEvent().locals;

  if (!user || !session) return null;

  try {
    const chats = await repo.chat.getChatsByUserId({ id: user.id });
    return chats;
  } catch {
    return null;
  }
});

export const deleteChat = command(
  z.object({
    chatId: z.string(),
  }),
  async ({ chatId }) => {
    const { user, session } = getRequestEvent().locals;
    if (!user || !session) return { success: false, message: "Unauthorized" };

    try {
      const chat = await repo.chat.getChatById(chatId);
      if (chat && chat.userId !== user.id) return { success: false, message: "Forbidden" };
      await repo.chat.deleteChat(chatId);
      return { success: true, message: "Chat deleted" };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

export const syncCookie = command(
  z.object({
    key: z.string(),
    value: z.string(),
  }),
  async ({ key, value }) => {
    const { cookies } = getRequestEvent();
    if (!value) return null;

    switch (key) {
      case "selected-model":
        if (!chatModels.find((model) => model.id === value)) return null;
        break;
      default:
        return null;
    }
    cookies.set(key, value, {
      path: "/",
      sameSite: "lax",
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      httpOnly: true,
    });

    return true;
  }
);

export const updateVisibility = command(
  z.object({
    chatId: z.string(),
    visibility: chatVisibilitySchema,
  }),
  async ({ chatId, visibility }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      await repo.chat.updateChatVisibilityById({ chatId, visibility });
      return { success: true };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

export const upload = command(
  z.object({
    file: fileSchema,
  }),
  async ({ file }) => {
    const { user } = getRequestEvent().locals;
    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    console.log("Uploading file: ", file);

    try {
      const mappingData = await result.getMappingData(user.staffId || 1);
      const mapString = JSON.stringify(mappingData);
      const content = await generateContent(file, mapString);
      const parsedResult = JSON.parse(content.trim());
      const marks = resultInputSchema.parse(parsedResult);
      const res = await result.upsertStudentResult(marks);
      if (!res.success) {
        return { success: false, message: res.message };
      }

      marks.studentData.studentId = res.data?.studentId || null;
      return { studentData: marks.studentData, marks };
    } catch (error) {
      console.error("Failed to upload file", error);
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

export const extractFile = command(
  z.object({
    file: fileSchema,
  }),
  async ({ file }) => {
    const { user } = getRequestEvent().locals;
    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const content = await generateContent(file);
      return { success: true, content };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

export const suggestion = command(
  z.object({
    documentId: z.string(),
  }),
  async ({ documentId }) => {
    const { user } = getRequestEvent().locals;
    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const suggestions = await repo.chat.getSuggestionsByDocumentId({ documentId });
      const suggestion = suggestions.at(0);
      if (suggestion && suggestion.userId !== user.id) {
        return { success: false, message: "Forbidden" };
      }
      return { success: true, suggestion };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

export const vote = command(
  z.object({
    chatId: z.string(),
    messageId: z.string(),
    type: z.enum(["up", "down"]),
  }),
  async ({ chatId, messageId, type }) => {
    const { user } = getRequestEvent().locals;
    if (!user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const chat = await repo.chat.getChatById(chatId);
      if (chat && chat.userId !== user.id) {
        return { success: false, message: "Forbidden" };
      }
    } catch {
      return { success: false, message: "Not found" };
    }

    try {
      await repo.chat.voteMessage({ chatId, messageId, type });
      return { success: true };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);
