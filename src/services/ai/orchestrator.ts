import { Agent } from '@mastra/core/agent';
import { ProviderRegistry } from './strategy/provider.js';
import { PIIObfuscator } from './middleware/pii.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ service: 'AiOrchestrator' });

export interface AgentOptions {
  domain: string;
  role: string;
  tenantId: string;
  aiService?: {
    updateTask(tenantId: string, taskId: string, data: Record<string, string | number | boolean | null | object>): Promise<void | object>;
  };
}

/**
 * AI Orchestrator Service
 * Responsible for generating provider-agnostic agents and managing their lifecycle.
 */
export class AiOrchestrator {
  private static providerRegistry = new ProviderRegistry();
  private static piiObfuscator = new PIIObfuscator();

  /**
   * Creates a Mastra Agent for the given role, hydrated with domain specific skills.
   */
  static async createAgent(options: AgentOptions, env: Record<string, string | undefined>): Promise<Agent> {
    const { domain, role, tenantId, aiService } = options;

    log.info('Creating high-fidelity agent via UniversalWorker', { domain, role, tenantId });

    // Using the new Hermes-Standard UniversalWorker for dynamic hydration
    const { UniversalWorker } = await import('./skills/universal.worker.js');
    
    return UniversalWorker.createAgent({
      domain,
      role,
      tenantId,
      env
    });
  }

  /**
   * Resolves model configuration based on intent.
   */
  static async resolveModelConfig(intent: "reasoning" | "speed", env: Record<string, string | undefined>): Promise<ModelConfig> {
    return this.providerRegistry.getModel(intent, env);
  }

  /**
   * Initializes a Mastra model instance from configuration.
   */
  static async initializeModel(config: ModelConfig, env: Record<string, string | undefined>) {
    const { provider, model } = config;

    switch (provider) {
      case 'openai': {
        const { OpenaiIntegration } = await import('@mastra/openai');
        const integration = (new OpenaiIntegration({ 
          config: { API_KEY: env?.OPENAI_API_KEY || '' } 
        })) as unknown as { getLanguageModel?: (m: string) => object; getModel?: (m: string) => object };
        // Handle different Mastra integration API versions
        return integration.getLanguageModel?.(model) || integration.getModel?.(model);
      }
      case 'anthropic': {
        throw new Error('Anthropic integration not yet fully implemented in EdApex.');
      }
      default: {
        // Fallback to OpenAI mini if provider not found
        const { OpenaiIntegration } = await import('@mastra/openai');
        const integration = (new OpenaiIntegration({ 
          config: { API_KEY: env?.OPENAI_API_KEY || '' } 
        })) as unknown as { getLanguageModel?: (m: string) => object };
        return integration.getLanguageModel?.('gpt-4o-mini');
      }
    }
  }

  static getPIIObfuscator() {
    return this.piiObfuscator;
  }
}
