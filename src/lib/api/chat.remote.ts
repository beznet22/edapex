import { command, getRequestEvent, query } from "$app/server";
import { allowAnonymousChats, CONFIG_COOKIE_MAX_AGE_SEC } from "$lib/constants";
import { chatVisibilitySchema, fileSchema, type ChatVisibility } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import z from "zod";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { readManifest } from "$lib/server/workspace/manifest";
import type { ChatThread, UploadedData } from "$lib/types/chat-types";
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
      case "potluck-always-donate":
        break;
      default:
        return null;
    }
    cookies.set(key, value, {
      path: "/",
      sameSite: "lax",
      maxAge: CONFIG_COOKIE_MAX_AGE_SEC,
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
    const event = getRequestEvent();
    const { user } = event.locals;
    const cookies = event.cookies;
    if (!user) return { success: true, resources: [] };

    const { tenant, fs } = await resolveTenantWorkspace({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: (user as { staffId?: number }).staffId,
      designationId: (user as { designationId?: number }).designationId,
      selectedClassCookie: cookies.get("selected-class"),
    });
    if (!fs) return { success: true, resources: [] };

    const manifest = await readManifest(tenant);
    const indexedPaths = new Set(Object.keys(manifest.entries));

    const resources: UploadedData[] = [];
    for (const [relPath, entry] of Object.entries(manifest.entries)) {
      if (entry.kind !== "user-file" && entry.kind !== "ocr-markdown") continue;
      const displayName = entry.fileName ?? relPath.split("/").pop() ?? relPath;
      resources.push({
        id: entry.documentId ?? relPath,
        filename: displayName,
        originalName: displayName,
        status: "extracted",
        success: true,
        type: entry.mimeType ?? "application/octet-stream",
        url: `/api/file/${relPath}`,
        data: {
          studentId: entry.studentId,
          examId: entry.examTypeId,
          contentHash: entry.contentHash,
          fullName: displayName,
        },
      });
    }

    // Fallback: scan the workspace for files in uploads/ and ocr/ that
    // aren't yet indexed in the manifest (legacy files or files written
    // by tools that bypass the manifest).
    const seenPaths = new Set(resources.map((r) => (r.url ?? "").replace("/api/file/", "")));
    for (const scanDir of ["uploads", "ocr"]) {
      try {
        const entries = await fs.readdir(scanDir);
        for (const entry of entries) {
          if (entry.type !== "file") continue;
          const relPath = `${scanDir}/${entry.name}`;
          if (indexedPaths.has(relPath) || seenPaths.has(relPath)) continue;
          resources.push({
            id: relPath,
            filename: entry.name,
            originalName: entry.name,
            status: "uploaded",
            success: true,
            type: "application/octet-stream",
            url: `/api/file/${relPath}`,
          });
        }
      } catch {
        // directory may not exist — ignore
      }
    }

    // Also scan exams/*/uploads/ and exams/*/ocr/ for any exam-scoped files
    try {
      const exams = await fs.readdir("exams");
      for (const exam of exams) {
        if (exam.type !== "directory") continue;
        for (const subDir of ["uploads", "ocr"]) {
          try {
            const subEntries = await fs.readdir(`${exam.name}/${subDir}`);
            for (const subEntry of subEntries) {
              if (subEntry.type !== "file") continue;
              const relPath = `${exam.name}/${subDir}/${subEntry.name}`;
              if (indexedPaths.has(relPath) || seenPaths.has(relPath)) continue;
              resources.push({
                id: relPath,
                filename: subEntry.name,
                originalName: subEntry.name,
                status: "uploaded",
                success: true,
                type: "application/octet-stream",
                url: `/api/file/${relPath}`,
              });
            }
          } catch {
            // sub-directory may not exist — ignore
          }
        }
      }
    } catch {
      // exams directory may not exist — ignore
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
