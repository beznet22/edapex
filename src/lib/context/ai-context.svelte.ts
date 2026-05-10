import { page } from "$app/state";

export class AIContext {
    connectedProviders = $state<string[]>([]);
    availableModels = $state<any[]>([]);

    addProvider(providerId: string) {
        if (!this.connectedProviders.includes(providerId)) {
            this.connectedProviders = [...this.connectedProviders, providerId];
        }
    }

    removeProvider(providerId: string) {
        this.connectedProviders = this.connectedProviders.filter(id => id !== providerId);
    }

    updateModels(models: any[]) {
        this.availableModels = models;
    }

    /**
     * Synchronize context with page data. 
     * This should be called inside an effect in the root layout.
     */
    sync(data: any) {
        if (data.connectedProviders) {
            // Merge or replace depending on needs. 
            // For discovery, we usually want to replace with the server's truth while keeping optimistic ones?
            // Actually, server truth is the most reliable.
            this.connectedProviders = [...data.connectedProviders];
        }
        if (data.availableModels) {
            this.availableModels = [...data.availableModels];
        }
    }
}

// Global singleton instance
export const aiContext = new AIContext();

export function useAI() {
    return aiContext;
}
