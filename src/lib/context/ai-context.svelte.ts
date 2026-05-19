import { page } from "$app/state";

export class AIContext {
    connectedProviders = $state<Array<{ provider: string; name: string; enabled: boolean; source: 'db' | 'env' }>>([]);
    availableModels = $state<any[]>([]);

    addProvider(config: { provider: string; name: string; enabled: boolean; source: 'db' | 'env' }) {
        const index = this.connectedProviders.findIndex(p => p.provider === config.provider);
        if (index === -1) {
            this.connectedProviders = [...this.connectedProviders, config];
        } else {
            this.connectedProviders[index] = config;
        }
    }

    removeProvider(providerId: string) {
        this.connectedProviders = this.connectedProviders.filter(p => p.provider !== providerId);
    }

    updateModels(models: any[]) {
        this.availableModels = models;
    }

    /**
     * Synchronize context with page data. 
     * This should be called inside an effect in the root layout.
     */
    sync(data: any) {
        if (Array.isArray(data.connectedProviders)) {
            this.connectedProviders = [...data.connectedProviders];
        }
        if (Array.isArray(data.availableModels)) {
            this.availableModels = [...data.availableModels];
        }
    }
}

// Global singleton instance
export const aiContext = new AIContext();

export function useAI() {
    return aiContext;
}
