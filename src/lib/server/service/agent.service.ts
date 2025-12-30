/**
 * Authentication Manager - Handles multiple OAuth2 providers
 */

import { getRequestEvent } from "$app/server";
import { chatModels, DEFAULT_CHAT_MODEL } from "$lib/chat/models.js";
import { coordinatorTools, teacherTools, defaultTools } from "$lib/chat/tools/index.js";
import { CredentialType, type OAuth2Client } from "$lib/schema/chat-schema.js";
import type { AuthUser } from "$lib/types/auth-types.js";
import type { AgentWorkflow, Assistant } from "$lib/types/chat-types.js";
import type { ClassSection } from "$lib/types/result-types.js";
import { defaultPrompt } from "../prompts/default.js";
import { GoogleProvider, QwenProvider } from "../provider/index.js";
import { resultRepo } from "../repository/result.repo.js";
import { agentWorkflows } from "../workflow/index.js";

export class AgentService {
  private providers: Map<CredentialType, OAuth2Client> = new Map();

  constructor() {
    this.providers.set(CredentialType.QWEN_CODE, new QwenProvider());
    this.providers.set(CredentialType.GOOGLE_OAUTH, new GoogleProvider());
  }

  use(type: CredentialType): OAuth2Client {
    if (!this.providers.has(type)) {
      throw new Error(`Provider ${type} not found`);
    }
    return this.providers.get(type)!;
  }

  static initChatModels(): string {
    const { cookies } = getRequestEvent();
    let modelId = cookies.get("selected-model");
    if (!modelId || !chatModels.find((model) => model.id === modelId)) {
      modelId = DEFAULT_CHAT_MODEL;
      cookies.set("selected-model", modelId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
    return modelId;
  }

  static async getSystemPrompt(user: AuthUser | null, agentId?: string, selectedClass?: ClassSection): Promise<string> {
    if (!agentId || !user?.designation) return defaultPrompt();
    const designation = user.designation;
    let systemPrompt = agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation === designation)?.systemPrompt;

    if (!systemPrompt) return defaultPrompt();
    const examTypes = await resultRepo.getExamTypes();
    systemPrompt += `\n\nEXAM TYPES: ${examTypes
      .map((e) => `- ${e.title} (Exam Type ID: ${e.id})`)
      .join("\n")}`;
    systemPrompt += `\n\nUSER ID: ${user.id}`;
    systemPrompt += `\n\nSTAFF ID: ${user.staffId}`;
    if (selectedClass) {
      systemPrompt += `\n\nCLASS ID: ${selectedClass.classId}`;
      systemPrompt += `\n\nSECTION ID: ${selectedClass.sectionId}`;
    }

    return systemPrompt;
  }

  static getTools(user: AuthUser | null, agentId?: string): typeof teacherTools | typeof coordinatorTools | typeof defaultTools {
    if (!agentId || !user?.designation) return defaultTools;
    const designation = user.designation;
    return agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation === designation)?.tools || defaultTools;
  }

  static getAgentWorkflows(user: AuthUser | null): AgentWorkflow[] {
    if (!user?.designation) return [];
    const designation = user.designation;
    return agentWorkflows.map((work) => {
      // Filter and strip systemPromptto prevent leaking to browser
      const assistants = work.assistants
        .filter((assistant): assistant is Assistant => assistant.designation === designation)
        .map(({ systemPrompt, tools, ...safeTask }) => safeTask);

      return {
        ...work,
        assistants,
      };
    });
  }
}

export const useAgent = () => {
  return new AgentService();
}
