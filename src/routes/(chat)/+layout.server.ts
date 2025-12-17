import { SelectedModel } from "$lib/context/sync.svelte";
import { base } from "$lib/server/repository";
import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { allowAnonymousChats } from "$lib/utils/constants";
import { AgentService } from "$lib/server/service/agent.service";
import { studentRepo, type ClassStudent } from "$lib/server/repository/student.repo";
import type { ExamType } from "$lib/schema/result";

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

  return {
    agents,
    user: user||undefined,
    students,
    sidebarCollapsed,
    selectedChatModel: new SelectedModel(modelId),
  };
};
