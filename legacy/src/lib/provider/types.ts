/**
 * Provider & Model Identity Types (client-safe)
 *
 * Branded string schemas that prevent string confusion between
 * provider IDs, model IDs, variant IDs, and family names.
 * Pure data — safe to import in client and server contexts.
 */
import { z } from 'zod';

export const ProviderIdSchema = z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Invalid provider id');
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ModelIdSchema = z.string().min(1);
export type ModelId = z.infer<typeof ModelIdSchema>;

export const VariantIdSchema = z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Invalid variant id');
export type VariantId = z.infer<typeof VariantIdSchema>;

export const FamilySchema = z.string().min(1);
export type Family = z.infer<typeof FamilySchema>;

export const modelIdToString = (id: ModelId): string => id;
export const parseModelId = (raw: string): { modelId: ModelId; variantId: VariantId | null } => {
	const atIdx = raw.indexOf('@');
	if (atIdx === -1) return { modelId: raw as ModelId, variantId: null };
	return {
		modelId: raw.slice(0, atIdx) as ModelId,
		variantId: raw.slice(atIdx + 1) as VariantId
	};
};
