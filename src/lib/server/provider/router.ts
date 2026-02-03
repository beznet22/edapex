import { CredentialType } from "$lib/schema/chat-schema";

export const agentProviderMap: Record<string, CredentialType> = {
    "assessment": CredentialType.QWEN_CODE,
    "communicate": CredentialType.QWEN_CODE,
    "document": CredentialType.QWEN_CODE,
    "report": CredentialType.QWEN_CODE,
    // Future mappings
    "coding": CredentialType.GOOGLE_OAUTH,
    "default": CredentialType.QWEN_CODE
};

export function getProviderType(agentId?: string): CredentialType {
    if (!agentId) return agentProviderMap["default"];
    return agentProviderMap[agentId] || agentProviderMap["default"];
}

export function getFallbackProvider(connectedTypes: CredentialType[]): CredentialType | null {
    if (connectedTypes.length === 0) return null;
    return connectedTypes[0];
}
