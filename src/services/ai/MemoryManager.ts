import { Agent } from "@mastra/core/agent";
import { queryOnce, eq, and } from "@tanstack/db";
import { aiSessionsCollection, aiMessagesCollection } from "../../db/tanstack-db.js";
import { logger } from "../../utils/logger.js";
import { ProviderRegistry, ModelConfig } from "./strategy/provider.js";
import { generateId } from "../../db/utils/id.js";
import { AIChat, AIMessage } from "../../db/sqlite/schema.js";

const log = logger.child({ layer: "ai", service: "MemoryManager" });

export interface Message {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: Record<string, any>[];
  metadata?: Record<string, any>;
}

/**
 * MemoryManager Service
 * Handles recursive session memory, context summarization, and persistence.
 * Essential for Maintaining agent focus over long conversations.
 */
export class MemoryManager {
  private registry: ProviderRegistry;

  constructor() {
    this.registry = new ProviderRegistry();
  }

  async getContext(sessionId: string, tenantId: string): Promise<Message[]> {
     
     const session = await queryOnce((q) =>
       q
         .from({ s: aiSessionsCollection })
         .where(({ s }) => and(eq(s.id, sessionId), eq(s.tenantId, tenantId)))
         .findOne()
     ) as unknown as AIChat | undefined;

     const messagesSnapshot = await queryOnce((q) =>
       q
         .from({ m: aiMessagesCollection })
         .where(({ m }) => and(eq(m.sessionId, sessionId), eq(m.tenantId, tenantId)))
         .orderBy(({ m }) => m.createdAt)
     ) as unknown as AIMessage[];

     const messages: Message[] = messagesSnapshot.map(m => ({
       role: m.role as Message["role"],
       parts: m.parts as Message["parts"],
       metadata: (m.metadata as Record<string, any>) || undefined
     }));

     if (session?.summary) {
       return [
         {
           role: "system",
           parts: [{ text: `Previous conversation summary: ${session.summary}` }]
         },
         ...messages
       ];
     }

     return messages;
  }

  /**
   * Appends a message to the session history.
   */
  async addMessage(sessionId: string, tenantId: string, message: Message): Promise<void> {
    const id = message.id || generateId();
    
    log.debug("Adding message to memory", { sessionId, role: message.role });

    await aiMessagesCollection.insert({
      id,
      sessionId,
      tenantId,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata || null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as AIMessage);
  }

  /**
   * Summarizes the session history and updates the session metadata.
   * [RECURSIVE-CORE]: Compresses context to save tokens and maintain focus.
   */
  async summarize(sessionId: string, tenantId: string, env: any): Promise<void> {
    const config = await this.registry.getModel("speed", env);
    const messages = await this.getContext(sessionId, tenantId);

    if (messages.length < 5) return; // Only summarize longer threads

    log.info("Summarizing session", { sessionId });

    const summarizer = new Agent({
      id: "memory-summarizer",
      name: "EdApex Context Architect",
      instructions: "Condense the following conversation into a technical, high-density summary. Retain key identifiers and decisions.",
      model: {
        id: config.model,
        provider: config.provider as any,
      } as any, // Cast to any due to Mastra internal versioning mismatches in dev
    });

    const contextStr = messages.map(m => `${m.role}: ${JSON.stringify(m.parts)}`).join("\n");
    
    try {
      const response = await summarizer.generate(`Summarize this context:\n${contextStr}`);
      const summary = response.text;

      await aiSessionsCollection.update(sessionId, (draft: any) => {
        const d = draft as unknown as AIChat;
        d.summary = summary;
        d.updatedAt = new Date();
      });

      log.info("Session summarized", { sessionId });
    } catch (error) {
      log.error("Summarization failure", { error: (error as Error).message });
    }
  }
}
