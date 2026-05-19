import {
	getProviderCredentialWithFallback,
	getAllActiveProviders,
	normalizeGatewayRequest,
	decrypt
} from './provider-config';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './db/schema';
import { AgentRouter, type ResolvedModel, type AgentRole } from './router';
import { Agent } from '@mastra/core/agent';
import { resolveModelConfig } from '@mastra/core/llm';
import type { LanguageModel as MastraLanguageModel } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ResultsRepository } from '../repository/result.repo';
import { StudentRepository } from '../repository/student.repo';
import { getDatabase } from '$lib/server/db';
import type { TenantContext } from './tenant-context';
import {
	coreTools,
	workflowTools,
	searchEntityTool,
	systemStatusTool,
	gradingTool,
	onboardTool,
	patchTool,
	manageAccessTool,
	switchWorkspaceTool,
	assignTool,
	extractTool,
	validateTool,
	publishTool,
} from './tools/index';
import { globalTools } from './tools/global-tools';
import { SkillRegistry } from './skill-registry';
import { resultInputSchema, type ResultInput } from '$lib/schema/result-input';
import {
	OCR_SYSTEM_PROMPT,
	MAPPER_SYSTEM_PROMPT,
	legacyExtractPrompt,
} from '../prompts/extract';
import { assessment } from '../service/assessment.service';
import { formatMappingDataToIndex } from '../helpers/extract-helper';
import { injectFileContext, type FileReference } from './file-context';

/** Result of a single-file extraction via the Gateway. */
export type ExtractionResult =
	| { success: true; data: ResultInput; rawText: string; isFallback: boolean }
	| { success: false; error: string };

/**
 * EdApex Sovereign Gateway — Central Orchestration Hub.
 * 
 * Implements the Supervisor/Assistant/Default Agent Role routing logic.
 * Handles context injection, intent classification, and multi-provider failover.
 */
export class EdApexGateway {
	private readonly router: AgentRouter;
	private readonly skillRegistry: SkillRegistry;
	private registryInitialized = false;

	constructor(
		private readonly db: LibSQLDatabase<typeof schema>,
		private readonly userId: number,
		private readonly encryptionKey: string,
		private readonly envKeys: Record<string, string | undefined> = {}
	) {
		this.router = new AgentRouter(db, userId);
		this.skillRegistry = new SkillRegistry();
	}

	/** Map of tool IDs to their Mastra createTool instances for dynamic injection */
	private static readonly TOOL_MAP: Record<string, any> = {
		'search-entity': searchEntityTool,
		'system-status': systemStatusTool,
		'manage-results': gradingTool,
		'onboard-entity': onboardTool,
		'patch-entity': patchTool,
		'manage-access': manageAccessTool,
		'switch-workspace': switchWorkspaceTool,
		'assign-entity': assignTool,
		'extract-document': extractTool,
		'validate-extraction': validateTool,
		'publish-results': publishTool,
	};

	private async ensureRegistry() {
		if (!this.registryInitialized) {
			const knownTools = new Set(Object.keys(EdApexGateway.TOOL_MAP));
			await this.skillRegistry.loadFromDirectory(process.cwd() + '/src/lib/server/mastra/skills', knownTools);
			this.registryInitialized = true;
		}
	}

	readonly id = 'edapex';
	readonly name = 'EdApex Sovereign Gateway';

	/**
	 * Helper that orchestrates classification, discovery, and Agent instantiation.
	 */
	private async executeOrchestration(
		message: string, 
		context: TenantContext,
		options: {
			threadId?: string;
			conversationOverride?: string;
			thinkingEnabled?: boolean;
			profile?: string;
		} = {}
	) {
		await this.ensureRegistry();

		const { threadId, conversationOverride, thinkingEnabled = false, profile } = options;

		// 1. Literal Slash Command Detection (Bypasses Confidence Gate)
		const isSlashCommand = message.trim().startsWith('/');

		// 2. Resolve Supervisor Model
		const supervisorModel = await this.router.resolveModel('supervisor', conversationOverride, thinkingEnabled, profile);
		const resolvedSupervisorModel = await this.getMastraModel(supervisorModel);
		
		// 3. Instantiate Supervisor with getContext tool
		const supervisor = new Agent({
			id: 'supervisor',
			name: 'Supervisor',
			instructions: this.getSupervisorInstructions(context),
			model: resolvedSupervisorModel,
			tools: {
				getContext: this.createGetContextTool(context)
			}
		});

		// 4. Classification & Dynamic Context Discovery
		const classification = await supervisor.generate(
			`Analyze the following user request: "${message}"\nClassify the intent and determine if additional domain context (assessment setups, student lists, or class assignments) is required to fulfill the request.\nIf context is required, call the "getContext" tool with the appropriate "types" (e.g., ['assessment', 'students']) BEFORE finalizing your classification.`,
			{
				structuredOutput: {
					schema: z.object({
						intent: z.enum(['conversational', 'mutation', 'navigation']),
						confidence: z.number().describe('Confidence score from 0 to 1'),
						requiresContext: z.boolean(),
						contextTypes: z.array(z.enum(['assessment', 'students', 'class'])).optional(),
						discoveredData: z.any().optional().describe('Data returned from the getContext tool, if used'),
						toolSelection: z.array(z.string()).optional().describe('Hint for which tools might be required based on the user intent'),
						reasoning: z.string().describe('Explanation for the classification')
					})
				}
			}
		);

		const result = classification.object as any;

		// 5. Enforce Confidence Gate for mutations (Unless it's an explicit slash command)
		const mutationThreshold = 0.9;
		const readThreshold = 0.7;

		if (!isSlashCommand) {
			if (result.intent === 'mutation' && result.confidence < mutationThreshold) {
				const message = `I've detected an intent to modify data, but my confidence is below the ${Math.round(mutationThreshold * 100)}% threshold (${Math.round(result.confidence * 100)}%). \n\nReasoning: ${result.reasoning}\n\nCould you please provide more specific details or use a literal slash command (e.g., /extract) to confirm your intent?`;
				return {
					rejected: true,
					textStream: (async function* () { yield message; })(),
					text: message,
					classification: result,
					confirmation: {
						type: 'mutation' as const,
						confidence: result.confidence,
						threshold: mutationThreshold,
						reasoning: result.reasoning,
						originalMessage: message,
					}
				};
			}

			if (result.intent === 'navigation' && result.confidence < readThreshold) {
				const message = `I'm not entirely sure which information you're looking for (Confidence: ${Math.round(result.confidence * 100)}%). \n\nReasoning: ${result.reasoning}\n\nCould you please clarify your search or use a literal slash command (e.g., /search)?`;
				return {
					rejected: true,
					textStream: (async function* () { yield message; })(),
					text: message,
					classification: result,
					confirmation: {
						type: 'navigation' as const,
						confidence: result.confidence,
						threshold: readThreshold,
						reasoning: result.reasoning,
						originalMessage: message,
					}
				};
			}
		}

		// 6. Resolve Skill-Based Tools and Target Model
		const targetModelType = isSlashCommand || result.intent === 'mutation' ? 'workflow' : 'assistant';
		const targetModel = await this.router.resolveModel(targetModelType, conversationOverride, thinkingEnabled, profile);
		const resolvedTargetModel = await this.getMastraModel(targetModel);

		// Dynamically build toolset from skill registry based on intent routing
		const assistantTools = this.resolveToolsForIntent(result, isSlashCommand, message);

		const assistant = new Agent({
			id: 'assistant',
			name: 'Assistant',
			instructions: this.getAssistantInstructions(context, result.discoveredData, result.toolSelection),
			model: resolvedTargetModel,
			tools: assistantTools
		});

		return {
			rejected: false,
			assistant,
			classification: result
		};
	}

	/**
	 * Resolves the tool map to inject into the Assistant based on the classified intent.
	 * If a specific skill matches the slash command, only that skill's tools are injected.
	 * Otherwise, all core + workflow tools are available.
	 *
	 * Global Tools (web-search, web-fetch) are ALWAYS injected regardless of active skill
	 * and do NOT count toward the 4-tool-per-skill limit.
	 */
	private resolveToolsForIntent(
		classification: { intent: string; toolSelection?: string[] },
		isSlashCommand: boolean,
		message: string
	): Record<string, any> {
		// Global Tools are always available — injected as the base layer
		const baseTools: Record<string, any> = { ...globalTools };

		// For slash commands, try to match to a specific skill
		if (isSlashCommand) {
			const command = message.trim().split(/\s+/)[0].toLowerCase();

			// Direct skill routing based on slash command
			const skillCommandMap: Record<string, string> = {
				'/grade': 'grading', '/mark': 'grading', '/attendance': 'grading',
				'/register': 'onboard', '/enroll': 'onboard', '/assign': 'onboard',
				'/update': 'gov', '/edit': 'gov', '/rename': 'gov',
				'/ban': 'gov', '/suspend': 'gov', '/reset': 'gov',
				'/extract': 'assistant', '/generate': 'assistant',
				'/validate': 'assistant', '/publish': 'assistant',
				'/search': 'default', '/find': 'default',
				'/switch': 'default', '/status': 'default',
			};

			const skillName = skillCommandMap[command];
			if (skillName) {
				const skill = this.skillRegistry.getSkill(skillName);
				if (skill) {
					const skillTools: Record<string, any> = {};
					for (const toolId of skill.tools) {
						const tool = EdApexGateway.TOOL_MAP[toolId];
						if (tool) skillTools[toolId] = tool;
					}

					// For workflow commands (/extract, /publish, /validate), always inject workflow tools
					if (['/extract', '/generate', '/validate', '/publish'].includes(command)) {
						Object.assign(skillTools, workflowTools);
					}

					// Always include search-entity for context discovery
					if (!skillTools['search-entity']) {
						skillTools['search-entity'] = searchEntityTool;
					}

					return { ...baseTools, ...skillTools };
				}
			}
		}

		// If the supervisor hinted at specific tools, prioritize those
		if (classification.toolSelection && classification.toolSelection.length > 0) {
			const hintedTools: Record<string, any> = {};
			for (const toolId of classification.toolSelection) {
				const tool = EdApexGateway.TOOL_MAP[toolId];
				if (tool) hintedTools[toolId] = tool;
			}
			// Merge with search-entity for fallback context
			if (!hintedTools['search-entity']) {
				hintedTools['search-entity'] = searchEntityTool;
			}
			return Object.keys(hintedTools).length > 1
				? { ...baseTools, ...hintedTools }
				: { ...baseTools, ...coreTools, ...workflowTools };
		}

		// Default: inject all available tools (global tools already in baseTools)
		return { ...baseTools, ...coreTools, ...workflowTools };
	}

	/**
	 * Main entry point for chat interactions with streaming support.
	 * Implements the routing flow: Supervisor -> Assistant/Workflow/Default.
	 */
	async stream(
		message: string, 
		context: TenantContext,
		options: {
			threadId?: string;
			conversationOverride?: string;
			thinkingEnabled?: boolean;
			profile?: string;
			onStepFinish?: (step: any) => void;
			fileReferences?: FileReference[];
			workspace?: string;
		} = {}
	) {
		// Inject file-as-context before routing to assistant
		let augmentedMessage = message;
		if (options.fileReferences?.length && options.workspace) {
			const fileContext = await injectFileContext(options.fileReferences, options.workspace);
			if (fileContext) {
				augmentedMessage = `${fileContext}\n\n${message}`;
			}
		}

		const orchestration = await this.executeOrchestration(augmentedMessage, context, options);

		if (orchestration.rejected) {
			return {
				textStream: orchestration.textStream,
				classification: orchestration.classification
			};
		}

		// 7. Execute Target Agent with Streaming and Memory persistence
		return orchestration.assistant!.stream(augmentedMessage, {
			memory: options.threadId ? { 
				thread: options.threadId, 
				resource: `school_${context.schoolId}` 
			} : undefined,
			onStepFinish: options.onStepFinish
		});
	}

	/**
	 * Non-streaming equivalent of stream().
	 */
	async generate(
		message: string, 
		context: TenantContext,
		options: {
			threadId?: string;
			conversationOverride?: string;
			thinkingEnabled?: boolean;
			profile?: string;
			onStepFinish?: (step: any) => void;
			fileReferences?: FileReference[];
			workspace?: string;
		} = {}
	) {
		// Inject file-as-context before routing to assistant
		let augmentedMessage = message;
		if (options.fileReferences?.length && options.workspace) {
			const fileContext = await injectFileContext(options.fileReferences, options.workspace);
			if (fileContext) {
				augmentedMessage = `${fileContext}\n\n${message}`;
			}
		}

		const orchestration = await this.executeOrchestration(augmentedMessage, context, options);

		if (orchestration.rejected) {
			return {
				text: orchestration.text,
				classification: orchestration.classification
			};
		}

		// 7. Execute Target Agent with Memory persistence
		return orchestration.assistant!.generate(augmentedMessage, {
			memory: options.threadId ? { 
				thread: options.threadId, 
				resource: `school_${context.schoolId}` 
			} : undefined,
			onStepFinish: options.onStepFinish
		});
	}

	/**
	 * Execute document extraction using the two-pass pipeline (OCR → structured mapping)
	 * with automatic fallback to single-pass vision extraction.
	 *
	 * Provides a clean API for `+page.server.ts` to call without needing to know
	 * about AgentRouter internals or model resolution.
	 */
	async executeExtraction(
		file: Blob,
		tenantContext: TenantContext,
		options: { staffId: number; classId?: number; sectionId?: number }
	): Promise<ExtractionResult> {
		const { staffId, classId, sectionId } = options;

		// Load mapping context for the target class/section
		const mappingData = await assessment.getMappingData(staffId, classId, sectionId);
		if (!mappingData.subjects || mappingData.subjects.length === 0) {
			return { success: false, error: 'No subjects assigned to this teacher' };
		}
		const mappingIndex = formatMappingDataToIndex(mappingData);

		// Resolve models via AgentRouter
		const ocrModel = await this.router.resolveMastraModel('ocr', this.envKeys, this.encryptionKey);
		const mapperModel = await this.router.resolveMastraModel('chat', this.envKeys, this.encryptionKey);
		const fallbackModel = await this.router.resolveMastraModel('vision', this.envKeys, this.encryptionKey);

		// Create inline agents
		const ocrAgent = new Agent({
			id: 'ocr-agent',
			name: 'OCR Transcription Agent',
			instructions: OCR_SYSTEM_PROMPT,
			model: ocrModel,
		});

		const mapperAgent = new Agent({
			id: 'mapper-agent',
			name: 'Structured Mapping Agent',
			instructions: MAPPER_SYSTEM_PROMPT,
			model: mapperModel,
		});

		const fallbackAgent = new Agent({
			id: 'fallback-vision-agent',
			name: 'Fallback Vision Agent',
			instructions: legacyExtractPrompt,
			model: fallbackModel,
		});

		// --- Pass 1: OCR Transcription ---
		let ocrText: string | undefined;
		try {
			const ocrResponse = await ocrAgent.generate([
				{
					role: 'user',
					content: [
						{
							type: 'file',
							data: await file.arrayBuffer(),
							mediaType: file.type,
						},
					],
				},
			]);
			ocrText = ocrResponse.text;
		} catch (error) {
			console.warn('[EdApexGateway] OCR Pass 1 failed, attempting single-pass fallback', error);
			return this.runFallbackExtraction(file, mappingIndex, fallbackAgent);
		}

		// --- Pass 2: Structured Mapping ---
		try {
			const mapperResponse = await mapperAgent.generate(
				`OCR Transcription:\n${ocrText}\n\nMapping Data (Look up IDs here):\n${mappingIndex}`,
				{
					structuredOutput: {
						schema: resultInputSchema,
					},
				}
			);

			return {
				success: true,
				data: mapperResponse.object as ResultInput,
				rawText: ocrText,
				isFallback: false,
			};
		} catch (error) {
			console.warn('[EdApexGateway] Mapping Pass 2 failed, attempting single-pass fallback', error);
			return this.runFallbackExtraction(file, mappingIndex, fallbackAgent);
		}
	}

	/**
	 * Single-pass fallback using a vision model that extracts structured data
	 * directly from the document image.
	 */
	private async runFallbackExtraction(
		file: Blob,
		mappingIndex: string,
		fallbackAgent: Agent<any, any, any, any>
	): Promise<ExtractionResult> {
		try {
			const response = await fallbackAgent.generate(
				[
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: `Extract data using this mapping context:\n${mappingIndex}`,
							},
							{
								type: 'file',
								data: await file.arrayBuffer(),
								mediaType: file.type,
							},
						],
					},
				],
				{
					structuredOutput: {
						schema: resultInputSchema,
					},
				}
			);

			return {
				success: true,
				data: response.object as ResultInput,
				rawText: '',
				isFallback: true,
			};
		} catch (error) {
			console.error('[EdApexGateway] Critical: All extraction attempts failed', error);
			return {
				success: false,
				error: 'All extraction attempts failed',
			};
		}
	}

	/**
	 * Creates a dynamic context discovery tool scoped to the active tenant.
	 */
	private createGetContextTool(context: TenantContext) {
		return createTool({
			id: 'getContext',
			description: 'Fetches specific domain context (assessment setups, students, subjects, etc.) on demand. Use this if the user asks about assessments, marks, students, or class assignments.',
			inputSchema: z.object({
				types: z.array(z.enum(['assessment', 'students', 'class'])).describe('The specific categories of context needed'),
				query: z.string().optional().describe('Optional filter/search term for students or assessments')
			}),
			execute: async ({types, query}) => {
				const staffId = context.userId;
				const db = await getDatabase();
				const resultRepo = new ResultsRepository(db, context);
				const studentRepo = new StudentRepository(db, context);
				
				const results: any = {};

				try {
					if (types.includes('assessment')) {
						const [examTypes, subjects, classSection] = await Promise.all([
							resultRepo.getCurrentTerm(),
							resultRepo.getSubjectsAssignedToStaff(staffId),
							resultRepo.getAssignedClassSection(staffId)
						]);

						const activeClassId = context.classId || classSection?.classId;
						const activeSectionId = context.sectionId || classSection?.sectionId;

						let examSetups: any[] = [];
						if (activeClassId && activeSectionId) {
							examSetups = await resultRepo.getExamSetupsByClassSection(activeClassId, activeSectionId);
						} else {
							examSetups = await resultRepo.getExamSetupsByStaffId(staffId);
						}

						results.assessment = {
							examTypes,
							subjects,
							examSetups,
							activeClassSection: {
								classId: activeClassId,
								sectionId: activeSectionId
							}
						};
					}

					if (types.includes('students')) {
						const activeClassId = context.classId;
						const activeSectionId = context.sectionId;

						if (!activeClassId || !activeSectionId) {
							results.students = { error: 'No active class/section context found. Please ensure a class is selected.' };
						} else {
							const students = await studentRepo.getStudentsByClassSection({ 
								classId: activeClassId, 
								sectionId: activeSectionId 
							}, query);

							results.students = {
								count: students?.length || 0,
								list: students?.map(s => ({
									id: s.id,
									name: s.name,
									admissionNumber: s.admissionNo
								})) || []
							};
						}
					}

					if (types.includes('class')) {
						const classSection = await resultRepo.getAssignedClassSection(staffId);
						results.classAssignment = {
							assignedClassSection: classSection
						};
					}

					return results;
				} catch (error) {
					console.error('[EdApexGateway] getContext tool failed:', error);
					return { error: 'Failed to fetch domain context from repositories.' };
				}
			}
		});
	}

	/**
	 * Context Injection for Supervisor
	 */
	private getSupervisorInstructions(context: TenantContext): string {
		const skill = this.skillRegistry.getSkill('supervisor');
		const baseInstructions = skill ? skill.instructions : `You are the EdApex Supervisor, the orchestration brain of a modular monolith educational platform.
Your primary role is to classify user intent, discover necessary domain context, and route requests safely to specialized Agents.`;

		return `${baseInstructions}

DOMAIN CONTEXT (IDs):
- School ID: ${context.schoolId}
- User ID: ${context.userId}
- Designation ID: ${context.designationId}
- Active Class ID: ${context.classId || 'None'}
- Active Section ID: ${context.sectionId || 'None'}
- Active Exam ID: ${context.examId || 'None'}

ORCHESTRATION RULES:
1. ALWAYS use the "getContext" tool if the user's request involves assessments, students, or marks and you don't already have the specific names, IDs or setups in your context.
2. For any intent that results in a "mutation" (e.g., /extract, /validate, /publish, or natural language requests to "update", "create", or "delete" marks/students), you MUST achieve a confidence score of >= 0.9.
3. If confidence is low, or if the intent is ambiguous, stay in "conversational" mode and ask for clarification.
4. "navigation" intent is for switching views or searching for specific items without modifying them.
5. "conversational" intent is for general questions or pedagogical support.

DO NOT hallucinate data. If you don't know the assessment setups for a class or the names of the students, use getContext(types: ['assessment', 'students']).`;
	}

	/**
	 * Context Injection for Assistant
	 */
	private getAssistantInstructions(context: TenantContext, discoveredData?: any, toolSelection?: string[]): string {
		const skill = this.skillRegistry.getSkill('assistant');
		let instructions = skill ? skill.instructions : `You are the EdApex Assistant, an expert AI partner for teachers and administrators.
You provide professional, data-driven support within the boundaries of the current workspace.`;

		instructions += `

TENANT BOUNDARIES (IDs):
- School ID: ${context.schoolId}
- User ID: ${context.userId}
- Class ID: ${context.classId || 'N/A'}
- Section ID: ${context.sectionId || 'N/A'}
- Exam ID: ${context.examId || 'N/A'}`;

		if (discoveredData) {
			instructions += `

DYNAMIC DOMAIN CONTEXT (Fetched by Supervisor):
${JSON.stringify(discoveredData, null, 2)}`;
		}

		if (toolSelection && toolSelection.length > 0) {
			instructions += `

TOOL HINTS:
The Supervisor suggested that the following tools might be relevant: ${toolSelection.join(', ')}. Prioritize using these tools if applicable.`;
		}

		instructions += `

BEHAVIORAL GUIDELINES:
1. Use the provided domain data (assessment setups, subjects, student lists) to answer accurately.
2. If data is missing but expected, inform the user politely.
3. Maintain a premium, helpful, and professional tone ("Gold on Slate").
4. Never suggest actions that would bypass tenant isolation or school safety rules.`;

		return instructions;
	}

	/**
	 * Helper to get a Mastra-compatible model instance with injected credentials.
	 */
	private async getMastraModel(resolved: ResolvedModel): Promise<MastraLanguageModel> {
		const apiKey = await this.getApiKey(resolved.provider);
		
		// resolved.model already contains the full provider/model ID (e.g., "opengateway/mimo-v2.5-pro")
		// Do NOT prepend provider again to avoid duplication like "opengateway/opengateway/mimo-v2.5-pro"
		const modelId = resolved.model.includes('/') ? resolved.model : `${resolved.provider}/${resolved.model}`;
		
		// For opengateway: use createOpenAICompatible directly since "opengateway" is not in
		// Mastra's built-in ModelsDevGateway registry. The gateway is OpenAI-compatible and keyless.
		// See docs/gitlawb-opengateway.md for full protocol specification.
		if (resolved.provider === 'opengateway') {
			const bareModel = modelId.startsWith('opengateway/') ? modelId.slice('opengateway/'.length) : modelId;
			const baseURL = resolved.baseUrl || this.envKeys['OPENGATEWAY_BASE_URL'] || 'https://opengateway.gitlawb.com/v1';
			
			const provider = createOpenAICompatible({
				name: 'opengateway',
				apiKey: apiKey || 'keyless',
				baseURL,
				// Disable gzip to work around gateway returning malformed gzip responses
				// (content-encoding: gzip header present but body not properly compressed)
				headers: { 'Accept-Encoding': 'identity' },
			});
			return provider.chatModel(bareModel) as unknown as MastraLanguageModel;
		}
		
		const baseOptions = {
			id: modelId as `${string}/${string}`,
			apiKey,
			baseURL: resolved.baseUrl || undefined
		};

		// Apply transport normalization (Stripping headers, ensuring /v1)
		const config = normalizeGatewayRequest(resolved.provider, baseOptions);
		
		const model = await resolveModelConfig(config);
		return model as MastraLanguageModel;
	}

	/**
	 * Retrieve and decrypt the API key for a given provider.
	 */
	async getApiKey(provider: string): Promise<string> {
		const config = await getProviderCredentialWithFallback(this.db, this.userId, provider, this.envKeys);

		if (!config) {
			throw new Error(`[EdApexGateway] No provider credential found for "${provider}"`);
		}

		if (!config.enabled) {
			throw new Error(`[EdApexGateway] Provider "${provider}" is disabled`);
		}

		if (config.source === 'env') {
			return this.envKeys[`${provider.toUpperCase()}_API_KEY`] || '';
		}

		return decrypt(config.apiKeyEncrypted!, this.encryptionKey);
	}

	/**
	 * Execute a request with automatic failover.
	 */
	async withFailover<T>(
		fn: (provider: string, apiKey: string, baseUrl?: string) => Promise<T>
	): Promise<T> {
		const configs = await getAllActiveProviders(this.db, this.userId, this.envKeys, ['anthropic', 'openai', 'deepseek', 'groq']);
		const errors: Array<{ provider: string; error: unknown }> = [];

		for (const config of configs) {
			try {
				const apiKey = await this.getApiKey(config.provider);
				return await fn(config.provider, apiKey, config.baseUrl || undefined);
			} catch (error: unknown) {
				errors.push({ provider: config.provider, error });
				continue;
			}
		}

		throw new Error(
			`[EdApexGateway] All providers exhausted. Errors: ${errors.map((e) => `${e.provider}: ${e.error}`).join(', ')}`
		);
	}
}

