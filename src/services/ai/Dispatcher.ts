import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { ProviderRegistry } from "./strategy/provider.js";

const log = logger.child({ layer: "ai", service: "Dispatcher" });

/**
 * Domain types supported by the HMAS orchestration.
 */
export const DomainSchema = z.enum([
  "academic",
  "finance",
  "hr",
  "classroom",
  "communication",
  "core",
]);

export type DomainId = z.infer<typeof DomainSchema>;

const SubGoalSchema = z.object({
  domainId: DomainSchema,
  objective: z.string(),
});

export type SubGoal = z.infer<typeof SubGoalSchema>;

/**
 * Dispatcher Service
 * Responsible for decomposing complex user intent into domain-specific sub-goals.
 */
export class Dispatcher {
  private registry: ProviderRegistry;

  constructor() {
    this.registry = new ProviderRegistry();
  }

  /**
   * Decomposes a raw user prompt into a set of actionable sub-goals.
   * Uses a reasoning-capable model for high-fidelity partitioning.
   */
  async dispatch(prompt: string, env: Record<string, string | undefined>): Promise<SubGoal[]> {
    const config: ModelConfig = await this.registry.getModel("reasoning", env);

    log.info("Partitioning intent", {
      prompt,
      provider: config.provider,
      model: config.model,
    });

    const dispatcherAgent = new Agent({
      id: "dispatcher-core",
      name: "EdApex Intent Dispatcher",
      instructions: `You are the EdApex Intent Dispatcher. 
Your job is to take a user request and break it down into high-level objectives for domain-specific supervisors.
Supported domains: ${DomainSchema.options.join(", ")}.
Output an array of objectives. Be precise and technical.`,
      model: {
        id: config.model,
        provider: config.provider as any, // Cast to any due to provider constant string vs type mismatch
      } as any,
    });

    try {
      const response = await dispatcherAgent.generate(prompt, {
        structuredOutput: {
          schema: z.object({
            subGoals: z.array(SubGoalSchema),
          }),
        },
      });

      const subGoals = response.object?.subGoals || [];

      log.info("Intent partitioned", {
        count: subGoals.length,
        domains: subGoals.map((g) => g.domainId),
      });

      return subGoals;
    } catch (error: unknown) {
      log.error("Dispatch failure", { error: (error as Error).message });
      throw error;
    }
  }
}
