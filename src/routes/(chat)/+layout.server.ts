import { SelectedModel } from "$lib/context/sync.svelte";
import { base } from "$lib/server/repository";
import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { allowAnonymousChats, STORAGE_DIR, UPLOADS_DIR } from "$lib/constants";
import { AgentService } from "$lib/server/service/agent.service";
import { studentRepo, type ClassStudent } from "$lib/server/repository/student.repo";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { UploadedData } from "$lib/types/chat-types";
import { existsSync, rm, rmdirSync, type Dirent } from "fs";

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
  const { user, session } = locals;
  if ((!user || !session) && !allowAnonymousChats) {
    redirect(302, "/signin");
  }

  const sidebarCollapsed = cookies.get("sidebar:state") !== "true";
  let modelId = AgentService.initChatModels();
  let agents = AgentService.getAgentWorkflowByDesignation("examiner");

  let students: ClassStudent[] | null = null;
  if (user) {
    students = await studentRepo.getStudentsByUserId(user?.id);
  }

  let pending: Dirent<string>[] = [];
  const uploadPath = join(UPLOADS_DIR, `${user?.id}-${user?.fullName}`);
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
    id: index.toString(),
    filename: file.name,
    status: "pending",
    success: false,
  }));

  // console.log("Students: ", students);

  return {
    agents,
    user: user || undefined,
    students,
    sidebarCollapsed,
    selectedChatModel: new SelectedModel(modelId),
    uploads,
  };
};
