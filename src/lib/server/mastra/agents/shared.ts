/**
 * Shared Agent Configuration — EdApex
 *
 * Common schemas, types, and default model resolvers shared across all
 * agent files.
 */
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import type { MastraModelConfig } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { BUILTIN_PROVIDERS } from '$lib/provider/catalog';
import type { ProviderId } from '$lib/provider/types';

// ─── Request Context Schema ─────────────────────────────────────────────────

/**
 * Shared Zod schema for requestContext across all agents.
 *
 * V1 path populates `modelId` (a `<gateway>/<provider>/<model>@<variant>`
 * string) and the agent's `model` callback hands it to Mastra's native
 * router + the registered `EdApexGateway`.
 *
 * V2 path populates `modelConfig` (a pre-resolved `MastraModelConfig` —
 * either a string, an `OpenAICompatibleConfig` object, or a
 * `LanguageModelV2` instance) and optional `providerOptions` (variant
 * options keyed by providerId, e.g. `{ deepseek: { thinking: {...} } }`).
 * The agent's `model` callback reads V2 first, V1 second.
 */
export const requestContextSchema = z.object({
	tenantContext: z.object({
		schoolId: z.number(),
		userId: z.number(),
		designationId: z.number(),
		staffId: z.number(),
		roleId: z.number().nullable(),
		classId: z.number().nullable(),
		sectionId: z.number().nullable(),
		examId: z.number().nullable(),
		examTypeId: z.number().nullable(),
		academicId: z.number().nullable(),
		studentId: z.number().nullable(),
	}),
	modelId: z.string().optional(),
	/** V2: pre-resolved MastraModelConfig. z.unknown() because the shape is
	 *  a discriminated union of three types the agent passes through. */
	modelConfig: z.unknown().optional(),
	/** V2: variant options keyed by providerId. */
	providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
	instructions: z.string().optional(),
	isSlashCommand: z.boolean().optional(),
	lastMessage: z.string().optional(),
	fileManifest: z.string().optional(),
	/** Resolved @mentions from `processMentions`, forwarded by
	 *  /api/chat so `buildAssistantInstructions` can render the
	 *  `RESOLVED @MENTIONS` block (and any focus student derived from
	 *  it). Shape is `MentionTag[]` but typed as `unknown` to
	 *  avoid a circular import — callers cast at the read site. */
	resolvedMentions: z.unknown().optional(),
});

export type RequestContextValues = z.infer<typeof requestContextSchema>;

// ─── Default Model Resolver ────────────────────────────────────────────────

/**
 * Roles for which we ship a default model used as a fallback when the
 * caller does not supply a `requestContext.modelConfig` or
 * `requestContext.modelId`.
 *
 * The default model for each role is built PER-CALL by
 * `buildDefaultModelForRole` so the API key reflects the current
 * `env.<KEY>` value (NOT a module-load-time capture). The base URL is
 * ALWAYS the catalog value — never `env.<URL>` — so the upstream endpoint
 * cannot be redirected by a misconfigured environment variable.
 */
export type ModelRole = 'title' | 'artifact' | 'copilot' | 'editor' | 'formatter';

interface PerRoleModel {
	readonly providerId: ProviderId;
	readonly modelName: string;
	readonly envKey: string | null;
}

const PER_ROLE_MODEL: Readonly<Record<ModelRole, PerRoleModel>> = {
	title: { providerId: 'groq', modelName: 'llama-3.1-8b-instant', envKey: 'GROQ_API_KEY' },
	artifact: { providerId: 'groq', modelName: 'openai/gpt-oss-120b', envKey: 'GROQ_API_KEY' },
	copilot: { providerId: 'groq', modelName: 'llama-3.1-8b-instant', envKey: 'GROQ_API_KEY' },
	editor: { providerId: 'groq', modelName: 'llama-3.3-70b-versatile', envKey: 'GROQ_API_KEY' },
	formatter: { providerId: 'groq', modelName: 'qwen/qwen3.6-27b', envKey: 'GROQ_API_KEY' }
};

/**
 * Build a fresh `MastraModelConfig` for the given role, reading the
 * current `env.<KEY>` value at call time.
 *
 * The base URL is locked to `BUILTIN_PROVIDERS[<providerId>].api.url`
 * (e.g. `https://api.groq.com/openai/v1` for Groq) — never `env.<URL>`.
 * This guarantees the upstream endpoint is the canonical one even when
 * `GROQ_BASE_URL` or any similar env override is misconfigured.
 *
 * Returns a NEW object on every call so callers cannot accidentally
 * share a `LanguageModelV2` instance across requests.
 *
 * Reads from `process.env` directly (not `$env/dynamic/private`) so the
 * function is deterministic in tests. In dev/prod, SvelteKit populates
 * `process.env` from `.env` before the module loads, so the values are
 * equivalent at request time. Tests can mutate `process.env` between
 * calls and observe the new value.
 *
 * The `envIn` parameter lets tests inject a custom env map. When
 * supplied, the function uses it as the primary source and falls back
 * to `process.env` for any key that is missing — this lets a test
 * inject a partial override without losing the rest of the env.
 */
export function buildDefaultModelForRole(
	role: ModelRole,
	envIn: Record<string, string | undefined> = process.env
): MastraModelConfig {
	const cfg = PER_ROLE_MODEL[role];
	const info = BUILTIN_PROVIDERS[cfg.providerId];
	let apiKey: string | undefined;
	if (cfg.envKey) {
		apiKey = envIn[cfg.envKey];
		if (apiKey === undefined) {
			apiKey = process.env[cfg.envKey];
		}
	}
	return {
		id: `${cfg.providerId}/${cfg.modelName}`,
		url: info.api.url,
		apiKey: apiKey ?? '',
		headers: { 'Accept-Encoding': 'identity' }
	};
}

// ─── OpenCode Default (main chat fallback) ─────────────────────────────────

/**
 * Default model used on the main chat agent when no per-request
 * `modelConfig` is supplied.
 *
 * This is the platform OpenCode-Zen key — intentionally captured at
 * module load because OpenCode is the platform fallback for the main
 * chat. The assistant agent's per-request `model` callback
 * (`agents/assistant.ts`) prefers `requestContext.modelConfig` first
 * (which carries the user's personal key from the 4-tier router) and
 * only falls through to this constant when the request context is
 * empty. We do NOT route the user's personal Groq key through this
 * constant — Groq-keyed defaults go through `buildDefaultModelForRole`.
 */
const openCodeProvider = createOpenAICompatible({
	name: 'open-code',
	apiKey: env.OPENCODE_API_KEY,
	baseURL: 'https://opencode.ai/zen/v1',
	headers: { 'Accept-Encoding': 'identity' },
	supportsStructuredOutputs: true
});

// Re-exported for legacy callers (e.g. `routes/api/format-document/+server.ts`)
// that need a `chatModel` instance for an explicit `model` override on
// `agent.generate(...)`. New code should use `buildDefaultModelForRole`.
export { openCodeProvider };

export const DEFAULT_MODEL: MastraModelConfig = {
	id: 'opencode/deepseek-v4-flash',
	url: 'https://opencode.ai/zen/v1',
	apiKey: env.OPENCODE_API_KEY ?? '',
	headers: { 'Accept-Encoding': 'identity' }
};