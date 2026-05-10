import { getRequestEvent } from "$app/server";
import { chatModels, DEFAULT_CHAT_MODEL } from "$lib/chat/models.js";
import { coordinatorTools, teacherTools, defaultTools } from "$lib/chat/tools/index.js";
import { CredentialType } from "$lib/schema/chat-schema.js";
import type { AuthUser } from "$lib/types/auth-types.js";
import type { AgentWorkflow, Assistant } from "$lib/types/chat-types.js";
import type { ClassSection } from "$lib/types/result-types.js";
import { defaultPrompt } from "../prompts/default.js";
import { resultRepo } from "../repository";
import { agentWorkflows } from "../agents/index.js";
import {
  resolveProvider,
  resolveProviderForTask,
  type TaskType,
} from "../provider/router.js";
// import type { Provider } from "ai";

export class AgentService {
  async getProviderForUser(userId: number, preferredProvider?: string): Promise<any> {
    const { provider } = await resolveProvider(userId, preferredProvider);
    return provider;
  }

  async getProviderForTask(userId: number, task: TaskType): Promise<any> {
    const { provider } = await resolveProviderForTask(userId, task);
    return provider;
  }

  static initChatModels(): string {
    const { cookies } = getRequestEvent();
    let modelId = cookies.get("selected-model");
    if (!modelId) {
      modelId = DEFAULT_CHAT_MODEL;
      cookies.set("selected-model", modelId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
    return modelId;
  }

  static async getInstructions(user: AuthUser | null, agentId?: string, selectedClass?: ClassSection): Promise<string> {
    if (!agentId || !user?.designation) return defaultPrompt();
    const designation = user.designation;
    let instructions = agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation.includes(designation))?.instructions;

    if (!instructions) return defaultPrompt();
    const examTypes = await resultRepo.getCurrentTerm();
    instructions += `\n\nCURRENT TERM: ${examTypes?.title} (Exam Type ID: ${examTypes?.id})`;
    instructions += `\n\nUSER ID: ${user.id}`;
    instructions += `\n\nSTAFF ID: ${user.staffId}`;
    if (selectedClass) {
      instructions += `\n\nCLASS ID: ${selectedClass.classId}`;
      instructions += `\n\nSECTION ID: ${selectedClass.sectionId}`;
      instructions += `\n\nCLASS NAME: ${selectedClass.className}`;
      instructions += `\n\nSECTION NAME: ${selectedClass.sectionName}`;
    }

    return instructions;
  }

  static getTools(user: AuthUser | null, agentId?: string): typeof teacherTools | typeof coordinatorTools | typeof defaultTools {
    if (!agentId || !user?.designation) return defaultTools;
    const designation = user.designation;
    return agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation.includes(designation))?.tools || defaultTools;
  }

  static getAgentWorkflows(user: AuthUser | null): AgentWorkflow[] {
    if (!user?.designation) return [];
    const designation = user.designation;
    return agentWorkflows.map((work) => {
      const assistants = work.assistants
        .filter((assistant): assistant is Assistant => assistant.designation.includes(designation))
        .map(({ instructions, tools, ...safeTask }) => safeTask);

      return {
        ...work,
        assistants,
      };
    });
  }
}

export const useAgent = () => {
  return new AgentService();
};
