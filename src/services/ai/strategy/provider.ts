import { logger } from '../../../utils/logger.js';

const log = logger.child({ service: 'ProviderRegistry' });

export type AIProvider = 'workers-ai' | 'openai' | 'anthropic' | 'google' | 'ollama';

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export class FallbackManager {
  private providers: AIProvider[] = ['openai', 'google', 'anthropic']; // Default priority

  constructor(preferredProviders?: AIProvider[]) {
    if (preferredProviders) {
      this.providers = preferredProviders;
    }
  }

  /**
   * Returns the next fallback provider based on current failure.
   */
  getFallback(failedProvider: AIProvider): AIProvider | null {
    const currentIndex = this.providers.indexOf(failedProvider);
    if (currentIndex === -1 || currentIndex === this.providers.length - 1) {
      return null;
    }
    return this.providers[currentIndex + 1];
  }

  /**
   * Smart routing based on intent.
   * [HIGH-FIDELITY] reasoning vs speed.
   */
  getInitialProvider(intent: 'reasoning' | 'speed'): ModelConfig {
    if (intent === 'reasoning') {
      return { provider: 'openai', model: 'gpt-4o' };
    }
    return { provider: 'openai', model: 'gpt-4o-mini' };
  }
}

export class ProviderRegistry {
  private fallbackManager: FallbackManager;

  constructor() {
    this.fallbackManager = new FallbackManager();
  }

  async getModel(intent: 'reasoning' | 'speed', env: Record<string, string | undefined>): Promise<ModelConfig> {
    const preferred = env?.PREFER_PROVIDER as AIProvider;
    
    if (preferred) {
      return { provider: preferred, model: this.getDefaultModel(preferred, intent) };
    }

    return this.fallbackManager.getInitialProvider(intent);
  }

  private getDefaultModel(provider: AIProvider, intent: 'reasoning' | 'speed'): string {
    const models: Record<AIProvider, { reasoning: string; speed: string }> = {
      'openai': { reasoning: 'gpt-4o', speed: 'gpt-4o-mini' },
      'google': { reasoning: 'gemini-1.5-pro', speed: 'gemini-1.5-flash' },
      'anthropic': { reasoning: 'claude-3-5-sonnet', speed: 'claude-3-haiku' },
      'workers-ai': { reasoning: '@cf/meta/llama-3-70b-instruct', speed: '@cf/meta/llama-3-8b-instruct' },
      'ollama': { reasoning: 'llama3:70b', speed: 'llama3:8b' },
    };

    return models[provider]?.[intent] || 'gpt-4o-mini';
  }
}
