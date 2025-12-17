/**
 * Authentication Manager - Handles multiple OAuth2 providers
 */

import { getRequestEvent } from "$app/server";
import { chatModels, DEFAULT_CHAT_MODEL } from "$lib/chat/models.js";
import { CredentialType, type OAuth2Client } from "$lib/schema/chat-schema.js";
import type { AgentWorkflow, Assistant, Designation } from "$lib/types/chat-types.js";
import { agentWorkflows } from "../workflow/index.js";
import { GoogleProvider, QwenProvider } from "../provider/index.js";
import { defaultPrompt } from "../prompts/default.js";

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

  static getSystemPrompt = (designation: Designation, agentId: string): string => {
    if (!agentId) return defaultPrompt();

    return agentWorkflows
      .filter((work) => work.id === agentId)
      .flatMap((work) => work.assistants)
      .find((assistant: Assistant) => assistant.designation === designation)!.systemPrompt!;
  };

  static getAgentWorkflowByDesignation = (designation: Designation): AgentWorkflow[] => {
    return agentWorkflows.map((work) => {
      // Filter and strip systemPromptto prevent leaking to browser
      const assistants = work.assistants
        .filter((assistant): assistant is Assistant => assistant.designation === designation)
        .map(({ systemPrompt, ...safeTask }) => safeTask);

      return {
        ...work,
        assistants,
      };
    });
  };
}

export const useAgent = () => {
  return new AgentService();
};
