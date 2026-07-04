/**
 * Assistant Agent — EdApex Expert AI Partner
 *
 * Handles user queries, executes tools, and provides educational support.
 * Tools are dynamically resolved based on slash commands via requestContext,
 * following the Quintui openchat pattern.
 *
 * Dynamic per-request behavior is injected via requestContext:
 * - `modelId`: The gateway-prefixed model string for Mastra's native router
 * - `isSlashCommand`: Whether the current message is a slash command (activates mutation tools)
 * - `tenantContext`: Tenant isolation boundaries
 */
import { Agent, type ToolsInput } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
	StreamErrorRetryProcessor,
	TokenLimiterProcessor
} from '@mastra/core/processors';
import { createTool } from '@mastra/core/tools';
import type { TenantContext } from '../tenant-context';
import { requestContextSchema, DEFAULT_MODEL, DEFAULT_TITLE_MODEL } from './shared';
import { createMastraStorage } from '$lib/server/mastra/storage/libsql/mastra-storage';
import { Memory } from '@mastra/memory';
import { ensureRegistry, resolveToolsForMessage } from '$lib/server/mastra/skill-tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import z from 'zod';

/**
 * Client-side tool: signals the workspace panel to stream the formatted
 * document. The tool has NO execute function — the AI SDK surfaces the
 * tool call to the client, the client streams via /api/artifact, and then
 * calls addToolOutput on the main chat to resume the assistant with the
 * result. Supports two formats via the `format` param: marksheet (default,
 * driven by contentHash of an OCR upload) and transcript (driven by
 * studentId of an @mentioned student).
 */
export const prepareDocumentStreamTool = createTool({
	id: 'prepare-document-stream',
	description:
		'Client-side document streaming trigger. Call this tool when a marksheet (format=marksheet) or transcript (format=transcript) needs to be formatted and shown in the workspace panel. The client streams the formatted markdown token-by-token, persists it to disk, and returns { artifactId, contentHash, fileName, filePath }. Then describe what was produced in ONE short sentence.',
	inputSchema: z.object({
		format: z
			.enum(['marksheet', 'transcript'])
			.optional()
			.describe("Document format. 'marksheet' (default) streams an OCR upload; 'transcript' streams a multi-term student transcript."),
		contentHash: z
			.string()
			.optional()
			.describe('Required when format=marksheet. The contentHash / fileId of the OCR upload (from FILE MANIFEST).'),
		fileName: z
			.string()
			.optional()
			.describe('Required when format=marksheet. The original uploaded file name.'),
		studentId: z
			.number()
			.optional()
			.describe('Required when format=transcript. The studentId of the @mentioned student.'),
		academicId: z
			.number()
			.optional()
			.describe('Optional when format=transcript. Defaults to the active academic year from the tenant context.')
	}),
	outputSchema: z.object({
		artifactId: z.string(),
		contentHash: z.string(),
		fileName: z.string(),
		filePath: z.string()
	})
	// No execute — this is a client-side tool.
});

export const testAgent = new Agent({
	id: 'testAgent',
	name: 'Test Agent',
	description: 'Test Agent',
	model: DEFAULT_MODEL,
	instructions: 'You are a test agent that only replies with "Hello World".',
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
		},
	}),
});


const step1 = createStep({
	id: 'step-1',
	inputSchema: z.object({
		message: z.string(),
	}),
	outputSchema: z.object({
		formatted: z.string(),
	}),
	execute: async ({ inputData, mastra, writer }) => {
		const { message } = inputData


		const agent = mastra.getAgent('testAgent')
		const stream = await agent.stream(inputData.message)
		await stream.textStream.pipeTo(writer!)

		return {
			formatted: message.toUpperCase(),
		}
	},
})

export const testWorkflow = createWorkflow({
	id: "testWorkflow",
	inputSchema: z.object({
		message: z.string()
	}),
	outputSchema: z.object({
		output: z.string()
	}),
	options: {
		onFinish: async (result) => {
			if (result.status === 'success') {
				console.info('[chatWorkflow] completed', {
					runId: result.runId,
					workflowId: result.workflowId,
					fileCount: result.result?.resolvedFiles?.length ?? 0,
					textLength: result.result?.text?.length ?? 0
				});
			}
		},
		onError: async (errorInfo) => {
			console.error('[chatWorkflow] error', {
				runId: errorInfo.runId,
				workflowId: errorInfo.workflowId,
				status: errorInfo.status,
				error: errorInfo.error
			});
		}
	}
})
	.then(step1)
	.commit()

export interface ParsedSlashCommand {
	command: string;
	subcommand?: string;
	args: string[];
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
	const match = text.trim().match(/^\/(\w+)(?:\s+(\w+))?(.*)$/);
	if (!match) return null;
	const [, command, subcommand, rest] = match;
	return {
		command,
		...(subcommand ? { subcommand } : {}),
		args: rest.trim().split(/\s+/).filter(Boolean),
	};
}

export const assistantAgent = new Agent({
	id: 'assistant',
	name: 'Assistant',
	description: 'Handles user queries, executes tools, and provides educational support.',
	model: ({ requestContext }) => {
		const v2Config = requestContext?.get('modelConfig') as MastraModelConfig | undefined;
		if (v2Config) return v2Config;
		return (requestContext?.get('modelId') as string) || DEFAULT_MODEL;
	},
	instructions: ({ requestContext }) => {
		// The agent may inspect requestContext.lastMessage via parseSlashCommand
		// to detect slash commands and their subcommands. Skills already
		// document each command's subcommands, so no system prompt text is
		// appended here.
		const ctx = requestContext?.get('tenantContext') as TenantContext | undefined;
		const fileManifest = requestContext?.get('fileManifest') as string | undefined;

		const instructions = [
			'You are the EdApex Assistant, an expert AI partner for teachers and administrators.',
			'You provide professional, data-driven support within the boundaries of the current workspace.',
			'',
			'### ABSOLUTE RULES (NEVER VIOLATE) ###',
			'',
			'RULE 1: When the FILE MANIFEST contains marksheet(s) (a file with `toolCallId` starting with `doc-`',
			'or a name ending in `.jpeg`/`.jpg`/`.png`/`.pdf` that is a marksheet image), your FIRST action must be to call the `prepareDocumentStream` tool.',
			'',
			'RULE 2: You MUST NOT format or re-render the marksheet content in your text response. The actual formatted content is streamed by the document agent after you call `prepareDocumentStream`. When `prepareDocumentStream` returns with status "success", emit ONE short, helpful sentence that: (a) summarizes what was produced (e.g. student name and number of subjects), (b) tells the user to review it in the workspace panel, and (c) instructs them to click the Validate pill to commit. Example: "Formatted the marksheet for <student name> (<N> subjects). Please review it in the workspace panel and click Validate to commit." Keep it under 25 words.',
			'',
			'RULE 3: If the user uploads a marksheet image and asks to "process", "format", "extract", "render", "show", "review", or similar — ALWAYS call `prepareDocumentStream` with the `contentHash` from the FILE MANIFEST. NEVER describe what you would do; actually do it.',
			'',
			'### END ABSOLUTE RULES ###',
			''
		];

		if (ctx) {
			instructions.push(
				'',
				'TENANT BOUNDARIES (IDs):',
				`- School ID: ${ctx.schoolId}`,
				`- User ID: ${ctx.userId}`,
				`- Designation ID: ${ctx.designationId}`,
				`- Active Class ID: ${ctx.classId || 'None'}`,
				`- Active Section ID: ${ctx.sectionId || 'None'}`,
				`- Active Exam ID: ${ctx.examId || 'None'}`,
				`- Active Exam Type ID: ${ctx.examTypeId || 'None'}`,
				`- Active Academic Year ID: ${ctx.academicId || 'None'}`,
				`- Active Student ID (if @mention resolved): ${ctx.studentId || 'None'}`,
				`- Active Role ID: ${ctx.roleId || 'None'}`,
				'',
				'BEHAVIORAL GUIDELINES:',
				'1. Use the provided domain data to answer accurately.',
				'2. If data is missing but expected, inform the user politely.',
				'3. Maintain a premium, helpful, and professional tone.',
				'4. Never suggest actions that would bypass tenant isolation or school safety rules.',
				'5. When a marksheet file is present, call `prepareDocumentStream` FIRST. Do not call get-academic-context before prepareDocumentStream. Missing examTypeId/academicId can be collected via request-selection AFTER streaming if the user did not mention them.',
				'6. Before executing student-specific commands (/enroll, /admit, /promote, etc.), verify that studentId is resolved. If null, the @mention was not applied — ask the user to @mention the target student.',
				'',
				'OCR <-> STUDENT LINKING (reporting skill only):',
				'- OCR cannot link marksheet images to DB students. The OCR returns whatever text is on the page; only @mentions in the user message can resolve identity before formatting. If the student is unclear, prepareDocumentStream will trigger formatting with the OCR name and the user can resolve identity during validation HITL.',
				'- If multiple marksheets are pending (manifest.documents.filter(d => d.status === "pending").length >= 2), @mentions are AMBIGUOUS. Do NOT ask for student upfront; ask ONLY for examType + academicYear, and let the workflow defer student linking to per-screenshot HITL.',
				'- If a single screenshot is uploaded and the user did NOT @mention a student, FIRST call `prepareDocumentStream` to format the marksheet, THEN use `request-selection` to ask which student the marksheet belongs to if still needed.',
				'',
				"DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).",
				'',
				'FILE CONTEXT:',
				'When files are available (shown in the FILE CONTEXT section of your prompt),',
				'the user may ask you to "extract data", "create document from the image", "process the marksheet",',
				'or similar. You MUST call the `prepareDocumentStream` tool, passing the `contentHash`',
				'shown in the FILE MANIFEST (the same value as the fileId), to transform the raw OCR markdown into',
				'a clean, structured version streamed to the workspace panel.',
				'',
				'DO NOT format the marksheet in your response text. The streaming happens in the workspace panel after prepareDocumentStream returns',
				'stream parts emitted by the tool — not via your text response. Your text response should ONLY',
				'describe what you did and surface validation outcomes (e.g. "I formatted the marksheet. Please',
				'review and validate.").',
				'',
				'If the user uploaded multiple marksheets, call `prepareDocumentStream` once per pending document.',
				'The client will stream the formatted document for each file and the workflow will auto-suspend for',
				'validation after each one (multi-file sequential commit per the reporting skill).',
				'',
				'TRANSCRIPT FORMAT: When the user asks for a student\'s multi-term or yearly transcript (e.g. \"show me {student}\'s transcript for AY4\") and the student is @mentioned, call `prepareDocumentStream` with `format: \"transcript\"`, `studentId`, and (optionally) `academicId`. Do NOT include `contentHash` for transcripts. The client will stream a formatted transcript with a Subject/Term 1/Term 2/Term 3/Total/Grade table and a \"Year Overview\" summary.',
				'',
				'Do not ask the user to provide the data again — it is already available on disk.',
				'FILE MANIFEST is attached below\n\n',
				fileManifest || 'No files attached'
			);
		}

		return instructions.join('\n');
	},
	tools: async ({ requestContext }) => {
		const isSlashCommand = requestContext?.get('isSlashCommand') as boolean | undefined;
		const message = requestContext?.get('lastMessage') as string | undefined;

		// Ensure registry is loaded
		await ensureRegistry();
		const dynamic = (await resolveToolsForMessage(message || '', !!isSlashCommand)) as ToolsInput;
		// Client-side tool: always available so the LLM can signal the workspace
		// panel to stream the formatted document. Execution happens on the client
		// via addToolOutput after /api/chat?step=stream-document-agent completes.
		// Key MUST match the createTool id so the LLM/provider receives the
		// same tool name that tool_choice references.
		return {
			...dynamic,
			'prepare-document-stream': prepareDocumentStreamTool
		};
	},
	workspace: tenantWorkspace,
	memory: new Memory({
		storage: createMastraStorage(),
		options: {
			lastMessages: 10,
			// generateTitle: {
			// 	model: DEFAULT_TITLE_MODEL,
			// 	instructions: 'Generate a concise title (max 5 words). Return ONLY the title text, no quotes, colons, or explanation.',
			// },
		},
	}),
	// `TokenLimiterProcessor` enforces a hard cap on input tokens (truncates
	// the oldest messages to fit). 100_000 leaves ~28_000 for system prompt
	// + output across all builtin models (smallest context = 128_000).
	inputProcessors: [
		new TokenLimiterProcessor({
			limit: 100_000,
			strategy: 'truncate',
			countMode: 'cumulative',
			trimMode: 'contiguous'
		})
	],
	// `StreamErrorRetryProcessor` retries transient stream errors (OpenAI 5xx,
	// Anthropic overloaded, etc.) that fire AFTER the first chunk — our
	// `streamWithAutoRetry` only handles pre-stream 429s, so the two are
	// complementary.
	errorProcessors: [new StreamErrorRetryProcessor()],
	requestContextSchema,
});


