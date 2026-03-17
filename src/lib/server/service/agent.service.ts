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
import { resultRepo } from "../repository";
import { agentWorkflows } from "../agents/index.js";
import { getProviderType } from "../provider/router.js";

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

  getProviderForAgent(agentId?: string): OAuth2Client {
    const { cookies } = getRequestEvent();
    const preferredType = getProviderType(agentId);

    // If preferred is connected, use it
    if (cookies.get(preferredType)) {
      return this.use(preferredType);
    }

    // Try others
    for (const type of Object.values(CredentialType)) {
      if (cookies.get(type)) {
        return this.use(type);
      }
    }

    // Fallback to preferred (will likely throw error downstream but that's expected if nothing is connected)
    return this.use(preferredType);
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

  static async getInstructions(user: AuthUser | null, agentId?: string, selectedClass?: ClassSection): Promise<string> {
    if (!agentId || !user?.designation) return defaultPrompt();
    const designation = user.designation;
    let instructions = agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation.includes(designation as any))?.instructions;

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
    return agentWorkflows.find((work) => work.id === agentId)?.assistants.find((assistant: Assistant) => assistant.designation.includes(designation as any))?.tools || defaultTools;
  }

  static getAgentWorkflows(user: AuthUser | null): AgentWorkflow[] {
    if (!user?.designation) return [];
    const designation = user.designation;
    return agentWorkflows.map((work) => {
      // Filter and strip systemPromptto prevent leaking to browser
      const assistants = work.assistants
        .filter((assistant): assistant is Assistant => assistant.designation.includes(designation as any))
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
}
