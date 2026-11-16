import { error, redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { allowAnonymousChats, CONFIG_COOKIE_MAX_AGE_SEC, STORAGE_DIR, UPLOADS_DIR } from "$lib/constants";
import type { ClassStudent } from "$lib/server/repository/student.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { ChatThread, UploadedData } from "$lib/types/chat-types";
import { existsSync, rm, rmdirSync, type Dirent } from "fs";
import type { ClassSection } from "$lib/types/result-types";
import { generateId } from "ai";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { getAllUserCredentials } from "$lib/server/mastra/provider/credentials";
import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
import {
	getAvailableModelsForUser,
	type AugmentedModelInfo
} from "$lib/server/mastra/provider/availability";
import { getHiddenModelIdsForUser, getEnabledModelIdsForUser } from "$lib/server/mastra/provider/visibility";
import { pickDefaultModelId } from "$lib/server/mastra/provider";
import { getPotluckConfig, parseJsonArray } from "$lib/server/mastra/provider/potluck";
import { getModelById } from "$lib/provider/catalog";
import { env } from "$env/dynamic/private";
import { getMemory, mastra } from "$lib/server/mastra";
import type { StorageThreadType } from "@mastra/core/memory";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext, resolveExamTypeId } from "$lib/server/mastra/tenant-context";

export const load: LayoutServerLoad = async ({ cookies, locals, url }) => {
  const { user, session } = locals;
  if ((!user || !session) && !allowAnonymousChats) {
    redirect(302, "/signin");
  }

  const sidebarCookie = cookies.get("sidebar:state");
  const sidebarCollapsed = sidebarCookie ? sidebarCookie === "false" : true;
  let modelId = cookies.get("selected-model") || "";

  // V2 cookie migration: legacy cookies carry colon-format model ids
  // (`groq:llama-…`). The canonical slash format (`groq/llama-…`) is what
  // the resolver and the Mastra native router expect. If the cookie
  // value uses a colon and resolves via `getModelById`'s legacy alias,
  // rewrite it to slash and persist. Unknown colon ids are left alone
  // so we never silently destroy user state.
  if (modelId.includes(":")) {
    const migrated = getModelById(modelId as Parameters<typeof getModelById>[0]);
    if (migrated && migrated.id !== modelId) {
      const atIdx = modelId.indexOf("@");
      const variantSuffix = atIdx >= 0 ? modelId.slice(atIdx) : "";
      modelId = `${migrated.id}${variantSuffix}`;
      cookies.set("selected-model", modelId, {
        path: "/",
        maxAge: CONFIG_COOKIE_MAX_AGE_SEC,
        httpOnly: false,
        sameSite: "lax"
      });
      console.info(`[layout] migrated legacy colon cookie to slash: ${migrated.id}`);
    }
  }

  // SSR: auto-pick a model when the cookie is empty, so the chat composer
  // and model selector trigger render with a real model name + variant list
  // on the very first paint. The cookie is persisted here so subsequent
  // navigations skip this code path entirely.
  let resolvedModel = null;
  const db = getAppDb();
  if (!modelId && user) {
    try {
      const autoPicked = await pickDefaultModelId(db, env as Record<string, string | undefined>, {
        userId: user.id,
        schoolId: user.schoolId ?? null,
        userRole: user.designation ?? null
      });
      if (autoPicked) {
        modelId = autoPicked;
        cookies.set("selected-model", modelId, {
          path: "/",
          maxAge: CONFIG_COOKIE_MAX_AGE_SEC,
          httpOnly: false,
          sameSite: "lax"
        });
        resolvedModel = getModelById(modelId as Parameters<typeof getModelById>[0]) ?? null;
      }
    } catch (err) {
      console.warn("[layout] SSR auto-pick failed:", err);
    }
  } else if (modelId && user) {
    try {
      resolvedModel = getModelById(modelId as Parameters<typeof getModelById>[0]) ?? null;
    } catch (err) {
      console.warn("[layout] SSR model resolve failed:", err);
    }
  }

  let selectedClassRaw = cookies.get("selected-class");
  const selectedAgentId = cookies.get("selected-agent") || "";
  const potluckAlwaysDonate = cookies.get("potluck-always-donate") || "";

  let students: ClassStudent[] | null = null;
  let classes: ClassSection[] = [];
  let chats: any[] = [];
  // Slice 13c: per-request provider, hoisted so the class_teacher block below
  // can also call assessment.getAssignedClassSection() without re-instantiating.
  const assessment = user
    ? await createAssessmentServiceForRequest(
        createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
        }),
      )
    : null;
  if (user && assessment) {
    classes = await assessment.getClassSections();
    students = await assessment.getStudentsByStaffId(user?.staffId);

    // Load chat history from Mastra memory for the sidebar
    try {
      const memory = await getMemory();
      if (!memory) return null;

      const resourceId = `user-${user.id}`;
      const result = await memory.listThreads({ filter: { resourceId } });
      // Map Mastra threads to the ChatThread shape the UI expects
      chats = result.threads.map((t: StorageThreadType) => ({
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
    } catch (e) {
      console.error('[layout.server] Failed to load chat history:', e);
    }
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
  if (user?.designation === "class_teacher" && assessment) {
    // Slice 13c: per-request provider (built above)
    assignedSection = (await assessment.getAssignedClassSection({ staffId: user.staffId || 1 })) as ClassSection | null;
    if (assignedSection && !token) {
      token = `${assignedSection.className}(${assignedSection.sectionName})`
        .toLowerCase()
        .replaceAll(" ", "_");
    }
  }

  // Auto-seed the `selected-class` cookie for users with a determinable
  // active class so the workspace resolver always has a classId/sectionId.
  // Precedence: never overwrite an explicit user choice. Only seed when
  // the cookie is empty AND the user has a single resolvable class.
  //   - class_teacher with `assignedSection` → seed with that section
  //   - IT / admin with exactly one class in `classes` → seed with it
  //   - everything else (multi-class users, users with no assignment)
  //     falls through to the sidebar dropdown / onboarding modal flow.
  if (user && !selectedClassRaw) {
    const seedSection =
      assignedSection ??
      ((user.designation === "it" || user.designation === "admin") &&
      classes.length === 1
        ? classes[0]
        : null);
    if (
      seedSection &&
      typeof seedSection.classId === "number" &&
      typeof seedSection.sectionId === "number"
    ) {
      cookies.set("selected-class", JSON.stringify(seedSection), {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        maxAge: CONFIG_COOKIE_MAX_AGE_SEC,
      });
      selectedClassRaw = JSON.stringify(seedSection);
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
  let availableModels: AugmentedModelInfo[] = [];
  let hiddenIds: string[] = [];
  let enabledIds: string[] = [];
  let userPriority: string[] = [];

  if (user) {
    const envKeys = env as Record<string, string | undefined>;
    const supportedList = Object.keys(BUILTIN_PROVIDERS) as string[];

    // Same data the getAvailableModels remote command + getModelVisibility
    // return. SSR loaded so the model selector + settings modal render
    // instantly on first paint (no flash, no spinner). The holder keeps
    // hiddenIds + enabledIds as the source of truth; consumers derive
    // visibleModelIds as `(catalog-known && !hidden) || enabled`.
    const [models, hidden, enabled, creds] = await Promise.all([
      getAvailableModelsForUser(db, envKeys, user.id, user.schoolId ?? 1, user.designation ?? null),
      getHiddenModelIdsForUser(db, user.id),
      getEnabledModelIdsForUser(db, user.id),
      getAllUserCredentials(db, envKeys, user.id, supportedList as any)
    ]);

    availableModels = models;
    hiddenIds = [...hidden];
    enabledIds = [...enabled];
    userPriority = creds.filter((p) => p.enabled === 1).map((p) => p.providerId);
    connectedProviders = creds;
  }

  // ─── Pot-luck pool config + donor-role gating ────────────────────────────
  // Used by the user-facing donate flow (Settings → Providers) to decide
  // whether to render the "Also donate to school pool" checkbox and to
  // resolve the current ToS version for the confirmation dialog. Falls back
  // to a "disabled / no donors / no ToS" shape when no row exists.
  let poolConfig: {
    enabled: boolean;
    donorRoles: string[];
    tosVersion: string | null;
  } = { enabled: false, donorRoles: [], tosVersion: null };
  let canDonate = false;
  if (user && typeof user.schoolId === "number") {
    try {
      const cfg = await getPotluckConfig(db, user.schoolId);
      if (cfg) {
        const donorRoles = parseJsonArray(cfg.donorRoles);
        poolConfig = {
          enabled: cfg.enabled === 1,
          donorRoles,
          tosVersion: cfg.tosVersion ?? null
        };
        const userRole = user.designation ?? null;
        canDonate =
          poolConfig.enabled &&
          (donorRoles.length === 0 ||
            (userRole !== null && donorRoles.includes(userRole)));
      }
    } catch (err) {
      console.warn("[layout] failed to load potluck config:", err);
    }
  }

  return {
    user: user || undefined,
    students,
    classes,
    chats,
    sidebarCollapsed,
    modelId,
    resolvedModel,
    selectedClassRaw,
    selectedAgentId,
    potluckAlwaysDonate,
    uploads,
    assignedSection,
    defaultProvider,
    connectedProviders,
    availableModels,
    hiddenIds,
    enabledIds,
    supportedProviders: Object.values(BUILTIN_PROVIDERS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.docUrl ?? ''
    })),
    userPriority,
    poolConfig,
    canDonate,
    examTypeId: await resolveExamTypeId(user?.schoolId ?? 1, null),
  };
};
