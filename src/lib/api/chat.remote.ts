import { command, getRequestEvent, query } from "$app/server";
import { allowAnonymousChats } from "$lib/constants";
import { chatVisibilitySchema, fileSchema, type ChatVisibility } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import z from "zod";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
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
      model: t.metadata?.model,
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
    if (!user) return { success: true, resources: [] };

    let tenant = createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: user.staffId ?? undefined,
    });

    if (className && sectionName) {
      const assessment = await createAssessmentServiceForRequest(tenant);
      const assigned = await assessment.getAssignedClassSection(user.staffId || 1);
      if (assigned) {
        tenant = createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
          classId: assigned.classId,
          sectionId: assigned.sectionId,
        });
      }
    } else if (user.designation === "class_teacher") {
      const assessment = await createAssessmentServiceForRequest(tenant);
      const assigned = await assessment.getAssignedClassSection(user.staffId || 1);
      if (assigned) {
        tenant = createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
          classId: assigned.classId,
          sectionId: assigned.sectionId,
        });
      }
    }

    const fileStorage = await createTenantFileStorage(tenant);
    const studentFolders = await fileStorage.listStudentFolders();

    if (studentFolders.length === 0) {
      return { success: true, resources: [] };
    }

    const token = `${className ?? ""}(${sectionName ?? ""})`.toLowerCase().replaceAll(" ", "_");
    const displayToken = token === "()" ? "" : token;

    const resources: UploadedData[] = [];
    for (const studentFolder of studentFolders) {
      try {
        const assessmentData = await fileStorage.load(studentFolder);
        if (!assessmentData) continue;

        const resourceId = assessmentData.storagePath || studentFolder;
        resources.push({
          id: resourceId,
          filename: assessmentData.data?.studentData?.fullName || assessmentData.originalName || studentFolder,
          originalName: assessmentData.originalName || studentFolder,
          token: displayToken,
          status: assessmentData.status,
          success: ["extracted", "approved", "published"].includes(assessmentData.status),
          type: "image/jpeg",
          url: `/api/uploads/${resourceId}/image.jpg?token=${displayToken}`,
          data: {
            studentId: assessmentData.data?.studentData?.studentId,
            examId: assessmentData.data?.studentData?.examTypeId,
            classId: assessmentData.data?.studentData?.classId,
            sectionId: assessmentData.data?.studentData?.sectionId,
            fullName: assessmentData.data?.studentData?.fullName,
          },
          error: assessmentData.error,
        });
      } catch (e) {
        console.error("Failed to load assessment data for folder:", studentFolder, e);
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
      // Slice 13c: per-request provider, no module-level singleton
      const assessment = await createAssessmentServiceForRequest(
        createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
          classId,
          sectionId,
        }),
      );
      const staff = await assessment.getStaffByClassSection({ classId, sectionId });
      if (!staff.teacherId) throw new Error("Class not assigned to any teacher")
      const students = await assessment.getStudentsByStaffId(staff.teacherId);
      return { success: true, data: students }
    } catch (e: any) {
      return { success: false, message: e.message }
    }
  })
