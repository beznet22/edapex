export class AIContext {
    sync(_data: unknown): void {
    }
}

export const aiContext = new AIContext();

export function useAI() {
    return aiContext;
}
