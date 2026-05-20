import { SelectedModel, SelectedClass } from "$lib/context/sync.svelte";
import { base } from "$lib/server/repository";
import { error, redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { allowAnonymousChats, STORAGE_DIR, UPLOADS_DIR } from "$lib/constants";
import { studentRepo } from "$lib/server/repository";
import type { ClassStudent } from "$lib/server/repository/student.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { UploadedData } from "$lib/types/chat-types";
import { existsSync, rm, rmdirSync, type Dirent } from "fs";
import type { ClassSection } from "$lib/types/result-types";
import { resultRepo } from "$lib/server/repository";
import { repo } from "$lib/server/repository";
import { DESIGNATIONS, type Designation } from "$lib/types/sms-types";
import { generateId } from "ai";
import { createMastraDb } from "$lib/server/mastra/db";
import { getUserProviderKeys } from "$lib/server/mastra/provider-config";
import { SUPPORTED_PROVIDERS, getAvailableModels } from "$lib/server/mastra/registry";
import { env } from "$env/dynamic/private";

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
  const { user, session } = locals;
  if ((!user || !session) && !allowAnonymousChats) {
    redirect(302, "/signin");
  }

  const sidebarCollapsed = false;
  let modelId = cookies.get("selected-model") || "auto";
  let agents: any[] = [];

  const selectedClassRaw = cookies.get("selected-class");
  const selectedAgentId = cookies.get("selected-agent") || "";

  let students: ClassStudent[] | null = null;
  let classes: ClassSection[] = [];
  let chats: any[] = [];
  if (user) {
    classes = await resultRepo.getClassSections();
    students = await studentRepo.getStudentsByStaffId(user?.staffId);
  }

  const className = url.searchParams.get("className");
  const sectionName = url.searchParams.get("sectionName");

  let pending: Dirent<string>[] = [];
  let token = "";

  // Priority for token generation:
  // 1. URL search params (explicit navigation)
  // 2. Cookie (persisted session)
  // 3. Assigned Section (for teachers)
  if (className && sectionName) {
    token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
  } else if (selectedClassRaw) {
    try {
      const cls = JSON.parse(selectedClassRaw) as ClassSection;
      if (cls.className && cls.sectionName) {
        token = `${cls.className}(${cls.sectionName})`.toLowerCase().replaceAll(" ", "_");
      }
    } catch (e) {
      console.error("Error parsing selected-class cookie:", e);
    }
  }

  let assignedSection: ClassSection | null = null;
  if (user?.designation === "class_teacher") {
    assignedSection = (await resultRepo.getAssignedClassSection(user.staffId || 1)) as ClassSection | null;
    if (assignedSection && !token) {
      token = `${assignedSection.className}(${assignedSection.sectionName})`
        .toLowerCase()
        .replaceAll(" ", "_");
    }
  }
  let uploadPath = join(UPLOADS_DIR, token);
  if (existsSync(uploadPath)) {
    try {
      const files = await readdir(uploadPath, { withFileTypes: true });
      if (files.length === 0) rmdirSync(uploadPath, { recursive: true });

      const isFiles = await Promise.all(
        files.map(async (file) => {
          const filePath = join(uploadPath, file.name);
          const fileStat = await stat(filePath);
          return fileStat.isFile();
        })
      );

      pending = files.filter((_, index) => isFiles[index]);
    } catch (error) {
      console.error("Error reading upload directory:", error);
      pending = [];
    }
  }

  const uploads: UploadedData[] = pending.map((file, index) => ({
    id: generateId(),
    filename: file.name,
    token,
    status: "uploaded",
    success: false,
  }));

  const defaultProvider = cookies.get("default-provider");

  // ─── Mastra-Native Provider & Model Resolution ────────────────────────────
  let connectedProviders: any[] = [];
  let availableModels: any[] = [];
  let userPriority: string[] = [];

  if (user) {
    const db = createMastraDb();
    const envKeys = env as Record<string, string | undefined>;
    const supportedList = [...SUPPORTED_PROVIDERS] as string[];

    connectedProviders = await getUserProviderKeys(db, user.id, envKeys, supportedList);
    userPriority = connectedProviders.filter(p => p.enabled).map(p => p.provider);
    availableModels = getAvailableModels(connectedProviders);
  }

  return {
    agents,
    user: user || undefined,
    students,
    classes,
    sidebarCollapsed,
    modelId,
    selectedClassRaw,
    selectedAgentId,
    uploads,
    assignedSection,
    defaultProvider,
    connectedProviders,
    availableModels,
    userPriority,
  };
};
