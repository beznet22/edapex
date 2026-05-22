import { command, getRequestEvent, query } from "$app/server";
import { allowAnonymousChats, EXTRACTED_DIR } from "$lib/constants";
import { chatVisibilitySchema, fileSchema, type ChatVisibility } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import z from "zod";
import { staffRepo, resultRepo, studentRepo } from "$lib/server/repository";
import { studentFileStorage } from "$lib/server/storage/student-files";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { ChatThread, UploadedData } from "$lib/types/chat-types";
import { existsSync, rmdirSync } from "fs";
import { getMemory, mastra } from "$lib/server/mastra";
import type { StorageThreadType } from "@mastra/core/memory";

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
      const memory = await getMemory() as any;
      if (!memory) return { success: false };

      const thread = await memory.getThreadById({ threadId: chatId });
      if (thread) {
        await memory.saveThread({
          thread: {
            ...thread,
            metadata: { ...(thread.metadata || {}), visibility },
            updatedAt: new Date(),
          }
        });
      }
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
    const memory = await getMemory();
    if (!memory) return null;

    const resourceId = `user-${user.id}`;
    const result = await memory.listThreads({ filter: { resourceId } });

    // Map Mastra threads to the ChatThread shape the UI expects
    return result.threads.map((t: StorageThreadType) => ({
      id: t.id,
      threadId: t.id,
      resourceId: t.resourceId,
      userId: user.id,
      title: t.title || 'New Chat',
      model: t.metadata?.model || 'auto' as any,
      visibility: t.metadata?.visibility || 'PRIVATE' as any,
      createdAt: new Date(t.createdAt).toISOString(),
      updatedAt: new Date(t.updatedAt).toISOString(),
    })) as ChatThread[];
  } catch (error) {
    console.error(error);
    return [];
  }
});

export const deleteChat = command(
  z.object({
    threadId: z.string(),
  }),
  async ({ threadId }) => {
    const { user, session } = getRequestEvent().locals;
    if (!user || !session) return { success: false, message: "Unauthorized" };

    try {
      const memory = await getMemory();
      if (!memory) return { success: false, message: "Storage error" };

      const thread = await memory.getThreadById({ threadId });
      if (thread && thread.resourceId !== `user-${user.id}`) {
        return { success: false, message: "Forbidden" };
      }
      await memory.deleteThread(threadId);
      return { success: true, message: "Chat deleted" };
    } catch (error) {
      console.error("deleteChat error:", error);
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
        // Allow selection of any model ID; the ProviderRouter handles fallbacks if the ID is invalid.
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
    threadId: z.string(),
    visibility: chatVisibilitySchema,
  }),
  async ({ threadId, visibility }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const memory = await getMemory();
      if (!memory) return { success: false, message: "Storage error" };

      const thread = await memory.getThreadById({ threadId });
      if (thread) {
        await memory.saveThread({
          thread: {
            ...thread,
            metadata: { ...(thread.metadata || {}), visibility },
            updatedAt: new Date(),
          }
        });
      }
      return { success: true };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

/**
 * Legacy extractFile command — kept for backward compatibility with the
 * workspace extraction flow. Uses the Mastra gateway for model resolution
 * instead of the legacy resolveProviderForTask.
 */
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
      // TODO: Migrate to Mastra gateway extraction workflow
      // For now, this command is deprecated in favor of the /extract slash command
      return { success: false, message: "Use the /extract slash command in chat instead" };
    } catch {
      return { success: false, message: "An error occurred while processing your request" };
    }
  }
);

/**
 * Suggestion and vote commands are deprecated.
 * Mastra memory handles observational memory natively.
 * These stubs prevent runtime errors from existing UI bindings.
 */
export const suggestion = command(
  z.object({
    documentId: z.string(),
  }),
  async ({ documentId }) => {
    // Suggestions are now managed by Mastra observational memory
    return { success: false, message: "Suggestions are managed by Mastra memory" };
  }
);

export const vote = command(
  z.object({
    chatId: z.string(),
    messageId: z.string(),
    type: z.enum(["up", "down"]),
  }),
  async ({ chatId, messageId, type }) => {
    // Voting is deprecated — Mastra memory handles feedback natively
    return { success: false, message: "Voting is managed by Mastra memory" };
  }
);

export const getResources = query(
  z.object({
    className: z.string().optional(),
    sectionName: z.string().optional(),
  }),
  async ({ className, sectionName }) => {
    const { user } = getRequestEvent().locals;

    const allTokens = new Set<string>();
    const extractedBase = EXTRACTED_DIR;

    // Determine which tokens to search for
    if (className && sectionName) {
      allTokens.add(`${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_"));
    } else if (user?.designation === "class_teacher") {
      const classSection = await resultRepo.getAssignedClassSection(user.staffId || 1);
      if (classSection) {
        allTokens.add(`${classSection.className}(${classSection.sectionName})`.toLowerCase().replaceAll(" ", "_"));
      }
    } else {
      // Admin or no specific filter - find all available tokens in storage/extracted
      if (existsSync(extractedBase)) {
        const dirs = await readdir(extractedBase, { withFileTypes: true });
        dirs.filter(d => d.isDirectory()).forEach(d => allTokens.add(d.name));
      }
    }

    const tokens = Array.from(allTokens);
    if (tokens.length === 0) {
      return { success: true, resources: [] };
    }

    const resources: UploadedData[] = [];

    for (const token of tokens) {
      // Get Extracted Files from Permanent Storage
      try {
        // We need to parse common token format: class(section)
        const match = token.match(/^(.+)\((.+)\)$/);
        if (match) {
          const [, cName, sName] = match;
          const studentFolders = await studentFileStorage.listByClass(cName, sName);

          for (const folderPath of studentFolders) {
            try {
              const assessmentData = await studentFileStorage.load(folderPath);
              if (!assessmentData) continue;

              const resourceId = assessmentData.storagePath || folderPath;
              resources.push({
                id: resourceId,
                filename: assessmentData.data?.studentData?.fullName || assessmentData.originalName || folderPath.split("/").pop() || "Unknown",
                originalName: assessmentData.originalName || folderPath.split("/").pop(),
                token,
                status: assessmentData.status,
                success: ["extracted", "approved", "published"].includes(assessmentData.status),
                type: "image/jpeg",
                url: `/api/uploads/${resourceId}/image.jpg?token=${token}`,
                data: {
                  studentId: assessmentData.data?.studentData?.studentId,
                  examId: assessmentData.data?.studentData?.examTypeId,
                  classId: assessmentData.data?.studentData?.classId,
                  sectionId: assessmentData.data?.studentData?.sectionId,
                  fullName: assessmentData.data?.studentData?.fullName
                },
                error: assessmentData.error
              });
            } catch (e) {
              console.error("Failed to load assessment data for folder:", folderPath, e);
            }
          }
        }
      } catch (error) {
        console.error("Error reading student file storage:", error);
      }
    }

    return { success: true, resources };
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
