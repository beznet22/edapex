/**
 * Provider & Model Specifications (client-safe)
 *
 * Schema-first definitions of what a provider and a model ARE.
 * Pure Zod schemas — no server-only code, no DB access, no env reads.
 * Safe to import in client and server contexts.
 */
import { z } from 'zod';
import { ProviderIdSchema, ModelIdSchema, VariantIdSchema, FamilySchema } from './types';

export const AISDKApiSchema = z.object({
	type: z.literal('aisdk'),
	package: z.string().min(1),
	url: z.string().url().optional(),
	settings: z.record(z.string(), z.unknown()).optional()
});
export type AISDKApi = z.infer<typeof AISDKApiSchema>;

export const NativeApiSchema = z.object({
	type: z.literal('native'),
	url: z.string().url().optional(),
	settings: z.record(z.string(), z.unknown())
});
export type NativeApi = z.infer<typeof NativeApiSchema>;

export const ApiSchema = z.union([AISDKApiSchema, NativeApiSchema]);
export type Api = z.infer<typeof ApiSchema>;

export const ProviderEnabledSchema = z.union([
	z.literal(false),
	z.object({ via: z.literal('env'), name: z.string().min(1) }),
	z.object({ via: z.literal('credential'), credentialId: z.string().min(1) }),
	z.object({ via: z.literal('custom'), data: z.record(z.string(), z.unknown()) })
]);
export type ProviderEnabled = z.infer<typeof ProviderEnabledSchema>;

export const ProviderRequestSchema = z.object({
	headers: z.record(z.string(), z.string()).default({}),
	body: z.record(z.string(), z.unknown()).default({})
});
export type ProviderRequest = z.infer<typeof ProviderRequestSchema>;

export const ProviderInfoSchema = z.object({
	id: ProviderIdSchema,
	name: z.string().min(1),
	enabled: ProviderEnabledSchema,
	env: z.array(z.string()).default([]),
	api: ApiSchema,
	request: ProviderRequestSchema.default({ headers: {}, body: {} }),
	description: z.string().default(''),
	docUrl: z.string().url().optional()
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const CapabilitiesSchema = z.object({
	tools: z.boolean(),
	input: z.array(z.string()).default([]),
	output: z.array(z.string()).default([]),
	reasoning: z.boolean().default(false),
	vision: z.boolean().default(false)
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

export const CostSchema = z.object({
	input: z.number().nonnegative(),
	output: z.number().nonnegative(),
	cache: z.object({ read: z.number().nonnegative(), write: z.number().nonnegative() }).default({ read: 0, write: 0 })
});
export type Cost = z.infer<typeof CostSchema>;

export const LimitSchema = z.object({
	context: z.number().int().positive(),
	input: z.number().int().positive().optional(),
	output: z.number().int().positive()
});
export type Limit = z.infer<typeof LimitSchema>;

export const ModelRequestSchema = z.object({
	headers: z.record(z.string(), z.string()).default({}),
	body: z.record(z.string(), z.unknown()).default({}),
	generation: z.record(z.string(), z.unknown()).default({}),
	options: z.record(z.string(), z.unknown()).default({}),
	variant: VariantIdSchema.optional()
});
export type ModelRequest = z.infer<typeof ModelRequestSchema>;

export const VariantSchema = z.object({
	id: VariantIdSchema,
	label: z.string().min(1),
	description: z.string().optional(),
	headers: z.record(z.string(), z.string()).default({}),
	body: z.record(z.string(), z.unknown()).default({}),
	generation: z.record(z.string(), z.unknown()).default({}),
	options: z.record(z.string(), z.unknown()).default({})
});
export type Variant = z.infer<typeof VariantSchema>;

export const ModelStatusSchema = z.enum(['alpha', 'beta', 'deprecated', 'active']);
export type ModelStatus = z.infer<typeof ModelStatusSchema>;

export const ModelTierSchema = z.enum([
	'flagship',
	'pro',
	'mid',
	'speed',
	'lite',
	'reasoning',
	'omni',
	'low'
]);
export type ModelTier = z.infer<typeof ModelTierSchema>;

export const ModelSourceSchema = z.enum(['user', 'platform']);
export type ModelSource = z.infer<typeof ModelSourceSchema>;

export const ModelInfoSchema = z.object({
	id: ModelIdSchema,
	providerId: ProviderIdSchema,
	family: FamilySchema.optional(),
	name: z.string().min(1),
	api: ApiSchema.optional(),
	capabilities: CapabilitiesSchema,
	request: ModelRequestSchema.default({ headers: {}, body: {}, generation: {}, options: {} }),
	variants: z.array(VariantSchema).default([]),
	status: ModelStatusSchema.default('active'),
	enabled: z.boolean().default(true),
	limit: LimitSchema,
	tier: ModelTierSchema,
	cost: CostSchema.optional(),
	description: z.string().default(''),
	source: ModelSourceSchema.optional()
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const CustomProviderEncryptedDataSchema = z.object({
	displayName: z.string().min(1),
	baseUrl: z.string().url(),
	apiKey: z.string().optional(),
	models: z
		.array(z.object({ id: z.string().min(1), displayName: z.string().min(1) }))
		.default([]),
	headers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).default([])
});
export type CustomProviderEncryptedData = z.infer<typeof CustomProviderEncryptedDataSchema>;

/**
 * Source discriminator for a model entry: where did it come from?
 *   - 'user'     : discovered via the user's own credential (or BUILTIN fallback)
 *   - 'platform' : env-keyed platform default
 */
export type AugmentedModelInfo = ModelInfo & { source: ModelSource };
