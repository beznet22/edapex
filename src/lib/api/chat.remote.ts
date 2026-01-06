import { command, getRequestEvent, query } from "$app/server";
import { chatModels } from "$lib/chat/models";
import { allowAnonymousChats, UPLOADS_DIR } from "$lib/constants";
import { chatVisibilitySchema, fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { repo } from "$lib/server/repository";
import { result } from "$lib/server/service/result.service";
import { generateContent } from "$lib/server/helpers/chat-helper";
import z from "zod";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { UploadedData } from "$lib/types/chat-types";
import { existsSync, rmdirSync } from "fs";
import { generateId } from "ai";
import type { Dirent } from "fs";
import { resultRepo } from "$lib/server/repository/result.repo";
import { studentRepo } from "$lib/server/repository/student.repo";

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
      case "selected-class":
        if (!value) return null;
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

export const getResources = query(
  z.object({
    className: z.string().optional(),
    sectionName: z.string().optional(),
  }),
  async ({ className, sectionName }) => {
    const { user } = getRequestEvent().locals;

    let token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    if (user?.designation === "class_teacher") {
      const classSection = await resultRepo.getAssignedClassSection(user.staffId || 1);
      if (!classSection) {
        return { success: false, message: "Class not assigned to any section", resources: [] };
      }
      token = `${classSection.className}(${classSection.sectionName})`.toLowerCase().replaceAll(" ", "_");
    }

    if (!token && className && sectionName) {
      token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    }

    if (!token) {
      return { success: false, message: "No class or section specified", resources: [] };
    }

    const uploadPath = join(UPLOADS_DIR, token);

    if (!existsSync(uploadPath)) {
      return { success: true, resources: [] };
    }

    try {
      const files = await readdir(uploadPath, { withFileTypes: true });
      if (files.length === 0) {
        rmdirSync(uploadPath, { recursive: true });
        return { success: true, resources: [] };
      }

      const isFiles = await Promise.all(
        files.map(async (file) => {
          const filePath = join(uploadPath, file.name);
          const fileStat = await stat(filePath);
          return fileStat.isFile();
        })
      );

      const pending = files.filter((_, index) => isFiles[index]);
      const resources: UploadedData[] = pending.map((file) => ({
        id: generateId(),
        filename: file.name,
        token,
        status: "pending",
        success: false,
      }));

      return { success: true, resources };
    } catch (error) {
      console.error("Error reading upload directory:", error);
      return { success: false, message: "Error reading upload directory", resources: [] };
    }
  }
);

export const getStudents = query(
  z.object({
    classId: z.number().optional(),
    sectionId: z.number().optional(),
  }),
  async ({ classId, sectionId }) => {
    const { user } = getRequestEvent().locals;
    if (!user) return { success: true, message: "Not Authorized" }

    try {
      if (!classId || !sectionId) throw new Error("Class not selected")
      const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
      if (!staff.teacherId) throw new Error("Class not assigned to any teacher")
      const students = await studentRepo.getStudentsByStaffId(staff.teacherId);
      return { success: true, data: students }
    } catch (e: any) {
      return { success: false, message: e.message }
    }
  })
