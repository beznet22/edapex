import { Agent } from "@mastra/core/agent";
import { Dispatcher } from "./Dispatcher.js";
import { MemoryManager } from "./MemoryManager.js";
import { AiOrchestrator } from "./orchestrator.js";
import { logger } from "../../utils/logger.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ModelConfig } from "./strategy/provider.js";

const log = logger.child({ layer: "ai", service: "PrincipalAgent" });

export interface ExecutionResult {
  domainId: string;
  objective: string;
  result: string;
  success: boolean;
}

export class PrincipalAgent {
  private dispatcher: Dispatcher;
  private memory: MemoryManager;

  constructor() {
    this.dispatcher = new Dispatcher();
    this.memory = new MemoryManager();
  }

  /**
   * Main entry point for user interaction (Principal Assistant / Executive).
   * Follows the HMAS Protocol: Listen -> Decompose -> Delegate -> Synthesize.
   */
  async execute(params: { prompt: string; sessionId: string; tenantId: string; userId: string; env: Record<string, string | undefined> }) {
    const { prompt, sessionId, tenantId, userId, env } = params;
    log.info("Executing HMAS principal task", { prompt, sessionId, tenantId });

    // 1. Listen & Memory Recall (Recursive Context)
    const context = await this.memory.getContext(sessionId, tenantId);
    await this.memory.addMessage(sessionId, tenantId, { role: "user", parts: [{ text: prompt }] });

    // 2. Decompose (Intent Partitioning)
    const subGoals = await this.dispatcher.dispatch(prompt, env);
    log.debug("Intent decomposed", { goals: subGoals.length });

    // 3. Delegate (Supervisor Orchestration)
    const results: ExecutionResult[] = [];
    for (const goal of subGoals) {
      log.info(`Delegating to ${goal.domainId} supervisor`, { objective: goal.objective });

      try {
        // Hydrate domain supervisor dynamically via SkillLoader (through Orchestrator)
        const supervisor = await AiOrchestrator.createAgent({
          domain: goal.domainId,
          role: "supervisor",
          tenantId,
        }, env);

        const response = await supervisor.generate(goal.objective);
        results.push({
          domainId: goal.domainId,
          objective: goal.objective,
          result: response.text,
          success: true
        });
      } catch (err) {
        log.error("Supervisor delegation failed", { domain: goal.domainId, error: (err as Error).message });
        results.push({
          domainId: goal.domainId,
          objective: goal.objective,
          result: `Error: ${(err as Error).message}`,
          success: false
        });
      }
    }

    // 4. Synthesize & Finalize
    const config: ModelConfig = await AiOrchestrator.resolveModelConfig("reasoning", env);
    
    // Load SOUL alignment for synthesis
    let soul = "";
    try {
      soul = await readFile(join(process.cwd(), "src/services/ai/strategy/SOUL.md"), "utf-8");
    } catch (e) {
      log.warn("SOUL.md not found, using default alignment.");
    }

    const synthesizer = new Agent({
      id: "principal-synthesizer",
      name: "EdApex Executive Synthesizer",
      instructions: `You are the Principal Assistant of EdApex.
${soul}
Synthesize the following sub-goal results into a final response for the user.
Maintain technical precision and supportive personal.`,
      model: {
        id: config.model,
        provider: config.provider as any,
      } as any,
    });

    try {
      const synthesisPrompt = `User Prompt: ${prompt}\n\nSub-Goal Results:\n${JSON.stringify(results, null, 2)}`;
      const finalResponse = await synthesizer.generate(synthesisPrompt);

      await this.memory.addMessage(sessionId, tenantId, { 
        role: "assistant", 
        parts: [{ text: finalResponse.text }] 
      });

      // Optional: Trigger background summarization for long threads
      if (context.length > 10) {
        this.memory.summarize(sessionId, tenantId, env).catch(e => log.error("Post-execute summary failed", { error: e.message }));
      }

      return {
        success: true,
        text: finalResponse.text,
        delegations: results,
      };
    } catch (error) {
      log.error("Synthesis failure", { error: (error as Error).message });
      throw error;
    }
  }
}
