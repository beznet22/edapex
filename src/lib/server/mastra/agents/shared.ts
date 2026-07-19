/**
 * Shared Agent Configuration — EdApex
 *
 * Common schemas, types, and default models shared across all agent files.
 */
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { env } from '$env/dynamic/private';

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
	 *  `RESOLVED @MENTIONS` block (and any focus student derived
	 *  from it). Shape is `MentionTag[]` but typed as `unknown` to
	 *  avoid a circular import — callers cast at the read site. */
	resolvedMentions: z.unknown().optional(),
});

export type RequestContextValues = z.infer<typeof requestContextSchema>;

// ─── Default Models ─────────────────────────────────────────────────────────

/**
 * Default model used on static agent definitions.
 *
 * Overridden at stream time via requestContext modelId.
 * Defaults to a platform-provided model that is always available via
 * env-keyed fallback (see provider/credentials.ts for the platform-default
 * synthesis and provider/router.ts for defaultModelForRole).
 */
export const openCodeProvider = createOpenAICompatible({
	name: 'open-code',
	apiKey: env.OPENCODE_API_KEY,
	baseURL: 'https://opencode.ai/zen/v1',
	headers: { 'Accept-Encoding': 'identity' },
	supportsStructuredOutputs: true,
});

export const DEFAULT_MODEL = openCodeProvider.chatModel('opencode/deepseek-v4-flash');


const groqProvider = createOpenAICompatible({
	name: 'groq',
	apiKey: env.GROQ_API_KEY,
	baseURL: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
	headers: { 'Accept-Encoding': 'identity' },
	supportsStructuredOutputs: false,
});


export const DEFAULT_ARTIFACT_MODEL = groqProvider.chatModel('openai/gpt-oss-120b');

/**
 * Default title model — prefers Groq for fast inference.
 */
export const DEFAULT_TITLE_MODEL = groqProvider.chatModel('llama-3.1-8b-instant');

/**
 * Default copilot model — prefers Groq for fast inference.
 */
export const DEFAULT_COPILOT_MODEL = groqProvider.chatModel('llama-3.1-8b-instant');

/**
 * Default editor agent model — uses 70B for instruction-following on inline edits.
 * The 8B instant model was too weak to reliably return ONLY the <Selection> replacement
 * without leaking surrounding document content.
 */
export const DEFAULT_EDITOR_MODEL = groqProvider.chatModel('llama-3.3-70b-versatile');


/**
 * Default formatter agent model — uses Qwen 3.6 27B for instruction-following on inline edits.
 */
export const DEFAULT_FORMATTER_MODEL = groqProvider.chatModel('qwen/qwen3.6-27b');