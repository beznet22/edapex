import { Agent } from '@mastra/core/agent';

export interface AgentOptions {
  id: string;
  name: string;
  instructions: string;
  capabilities?: string[];
}

/**
 * AI Orchestrator Service
 * Responsible for generating provider-agnostic agents and managing their lifecycle.
 */
export class AiOrchestrator {
  static async createAgent(options: AgentOptions, env: any): Promise<Agent> {
    const { id, name, instructions, capabilities = [] } = options;

    // Runtime Provider Selection Logic
    // 1. Check for PREFER_CLOUDFLARE (Cheapest/Fastest for Edge)
    // 2. Fallback to OpenAI/Anthropic if complex capabilities are requested
    
    let model: any;

    if (capabilities.includes('heavy-reasoning') || env?.PREFER_OPENAI === 'true') {
      const { OpenaiIntegration } = await import('@mastra/openai');
      const integration = new OpenaiIntegration({ config: { API_KEY: env?.OPENAI_API_KEY || '' } });
      model = (integration as any).getLanguageModel?.('gpt-4o') || (integration as any).getModel?.('gpt-4o');
    } else {
      const { OpenaiIntegration } = await import('@mastra/openai');
      const integration = new OpenaiIntegration({ config: { API_KEY: env?.OPENAI_API_KEY || '' } });
      model = (integration as any).getLanguageModel?.('gpt-4o-mini') || (integration as any).getModel?.('gpt-4o-mini');
    }

    return new Agent({
      id,
      name,
      instructions,
      model,
    });
  }
}
