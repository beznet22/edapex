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
		academicId: z.number().nullable(),
		studentId: z.number().nullable(),
	}),
	modelId: z.string().optional(),
	instructions: z.string().optional(),
	isSlashCommand: z.boolean().optional(),
	lastMessage: z.string().optional(),
	fileManifest: z.string().optional(),
});

export type RequestContextValues = z.infer<typeof requestContextSchema>;

// ─── Default Models ─────────────────────────────────────────────────────────

/**
 * Default model used on static agent definitions.
 * Overridden at stream time via requestContext modelId.
 *
 * Using opengateway/mimo-v2.5-pro as the default — flagship model
 * always available (keyless opengateway provider).
 */
const groqProvider1 = createOpenAICompatible({
	name: 'groq',
	apiKey: env.GROQ_API_KEY,
	baseURL: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
	headers: { 'Accept-Encoding': 'identity' },
	supportsStructuredOutputs: false,
});

export const DEFAULT_MODEL = groqProvider1.chatModel('llama-3.1-8b-instant');


const groqProvider = createOpenAICompatible({
	name: 'groq',
	apiKey: env.GROQ_API_KEY,
	baseURL: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
	headers: { 'Accept-Encoding': 'identity' },
	supportsStructuredOutputs: false,
});

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