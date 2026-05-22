import {
    getProviderCredentialWithFallback,
    getAllActiveProviders,
    normalizeGatewayRequest,
    decrypt
} from './provider-config';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './db/schema';
import { AgentRouter, type ResolvedModel } from './router';
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
import { getModelById } from './registry';
import { resultInputSchema, type ResultInput } from '$lib/schema/result-input';
import {
    OCR_SYSTEM_PROMPT,
    MAPPER_SYSTEM_PROMPT,
    legacyExtractPrompt,
} from '../prompts/extract';
import { assessment } from '../service/assessment.service';
import { formatMappingDataToIndex } from '../helpers/extract-helper';
import { injectFileContext, type FileReference } from './file-context';
import { mastra } from './index';
import { RequestContext } from '@mastra/core/request-context';
import { titleAgent, type RequestContextValues } from './agents';

/** Result of a single-file extraction via the Gateway. */
export type ExtractionResult =
    | { success: true; data: ResultInput; rawText: string; isFallback: boolean }
    | { success: false; error: string };

/**
 * EdApex Sovereign Gateway — Central Orchestration Hub.
 * 
 * Thin orchestration wrapper that resolves per-request context (model, instructions,
 * tools) and delegates to the static supervisor agent. No longer creates agents.
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
     * Uses the static supervisor agent from the singleton Mastra instance.
     * Per-request context (model, instructions, tools) is passed via stream options.
     *
     * Mastra's native memory lifecycle (prepare-memory-step → stream → save-messages)
     * auto-persists messages when `memory: { thread, resource }` is provided.
     */
    async stream(
        message: string,
        context: TenantContext,
        options: {
            threadId?: string;
            resourceId?: string;
            conversationOverride?: string;
            thinkingEnabled?: boolean;
            profile?: string;
            onStepFinish?: (step: any) => void;
            fileReferences?: FileReference[];
            workspace?: string;
            abortSignal?: AbortSignal;
        } = {}
    ) {
        await this.ensureRegistry();

        // Inject file-as-context before routing to assistant
        let augmentedMessage = message;
        if (options.fileReferences?.length && options.workspace) {
            const fileContext = await injectFileContext(options.fileReferences, options.workspace);
            if (fileContext) {
                augmentedMessage = `${fileContext}\n\n${message}`;
            }
        }

        // Resolve models for supervisor and assistant
        const { conversationOverride, thinkingEnabled = false, profile } = options;
        const supervisorModel = await this.router.resolveModel('supervisor', conversationOverride, thinkingEnabled, profile);
        const resolvedSupervisorModel = await this.getMastraModel(supervisorModel);

        const isSlashCommand = augmentedMessage.trim().startsWith('/');

        // Build per-request tool set based on intent/slash command
        const assistantTools = this.resolveToolsForIntent(
            { intent: isSlashCommand ? 'mutation' : 'conversational' },
            isSlashCommand,
            augmentedMessage
        );

        // Retrieve the static supervisor from the singleton Mastra instance
        const supervisor = mastra.getAgent('supervisor');

        // Single stream call — pass per-request options to the static supervisor.
        // Mastra handles delegation internally via the `agents` property.
        // AbortSignal propagation (Requirements 22.1, 22.5, 22.6):
        // - abortSignal is passed directly to supervisor.stream() which propagates to child agents
        // - Mastra natively cancels LLM generation when the signal fires
        // - Memory auto-persistence is skipped when the stream is aborted (Requirement 22.4)
        //   because Mastra only persists messages on successful stream completion
        // Build per-request RequestContext for tenant isolation and tool injection
        const requestContext = new RequestContext([
            ['tenantContext', context],
            ['tools', assistantTools],
        ]);

        const result = await supervisor.stream(augmentedMessage, {
            model: resolvedSupervisorModel,
            instructions: this.getSupervisorInstructions(context),
            requestContext,
            memory: options.threadId ? {
                thread: { id: options.threadId },
                resource: options.resourceId || `user-${context.userId}`,
            } : undefined,
            abortSignal: options.abortSignal,
            onStepFinish: options.onStepFinish,
        });

        return result;
    }

    /**
     * Non-streaming equivalent of stream().
     * Uses the static supervisor agent from the singleton Mastra instance.
     * Per-request context (model, instructions, tools) is passed via generate options.
     */
    async generate(
        message: string,
        context: TenantContext,
        options: {
            threadId?: string;
            resourceId?: string;
            conversationOverride?: string;
            thinkingEnabled?: boolean;
            profile?: string;
            onStepFinish?: (step: any) => void;
            fileReferences?: FileReference[];
            workspace?: string;
            abortSignal?: AbortSignal;
        } = {}
    ) {
        await this.ensureRegistry();

        // Inject file-as-context before routing to assistant
        let augmentedMessage = message;
        if (options.fileReferences?.length && options.workspace) {
            const fileContext = await injectFileContext(options.fileReferences, options.workspace);
            if (fileContext) {
                augmentedMessage = `${fileContext}\n\n${message}`;
            }
        }

        // Resolve models for supervisor and assistant
        const { conversationOverride, thinkingEnabled = false, profile } = options;
        const supervisorModel = await this.router.resolveModel('supervisor', conversationOverride, thinkingEnabled, profile);
        const resolvedSupervisorModel = await this.getMastraModel(supervisorModel);

        const isSlashCommand = augmentedMessage.trim().startsWith('/');

        // Build per-request tool set based on intent/slash command
        const assistantTools = this.resolveToolsForIntent(
            { intent: isSlashCommand ? 'mutation' : 'conversational' },
            isSlashCommand,
            augmentedMessage
        );

        // Retrieve the static supervisor from the singleton Mastra instance
        const supervisor = mastra.getAgent('supervisor');

        // Build per-request RequestContext for tenant isolation and tool injection
        const requestContext = new RequestContext([
            ['tenantContext', context],
            ['tools', assistantTools],
        ]);

        // Single generate call — pass per-request options to the static supervisor.
        const result = await supervisor.generate(augmentedMessage, {
            model: resolvedSupervisorModel,
            instructions: this.getSupervisorInstructions(context),
            requestContext,
            memory: options.threadId ? {
                thread: { id: options.threadId },
                resource: options.resourceId || `user-${context.userId}`,
            } : undefined,
            abortSignal: options.abortSignal,
            onStepFinish: options.onStepFinish,
        });

        return result;
    }

    /**
     * Lightweight title generation that bypasses the full orchestration pipeline.
     * Uses a speed-tier model directly without Supervisor classification or structured output.
     * Prefers Groq (fast inference) with fallback to any available speed-tier model.
     */
    async generateTitle(
        message: string,
        context: TenantContext,
        options?: { threadId?: string; resourceId?: string }
    ): Promise<string> {
        try {
            // 1. Prefer Groq for title generation (fastest inference, most reliable)
            // Fall back to any available speed-tier model if Groq is unavailable
            let resolvedModel: MastraLanguageModel;
            try {
                const groqModel = getModelById('groq/llama-3.3-70b-versatile');
                if (groqModel) {
                    resolvedModel = await this.getMastraModel({
                        provider: groqModel.provider,
                        model: groqModel.id,
                        capabilities: groqModel.capabilities
                    });
                } else {
                    const titleModel = await this.router.resolveModel('default', undefined, false, 'simple');
                    resolvedModel = await this.getMastraModel(titleModel);
                }
            } catch {
                // Groq key not available — fall back to router resolution
                const titleModel = await this.router.resolveModel('default', undefined, false, 'simple');
                resolvedModel = await this.getMastraModel(titleModel);
            }

            // 2. Build typed RequestContext for tenant isolation
            const requestContext = new RequestContext<RequestContextValues>();
            requestContext.set('tenantContext', context);

            // 3. Generate title using simple, fast agent
            const result = await titleAgent.generate(`Summarize: "${message}"`, {
                model: resolvedModel, // ✅ Runtime override
                requestContext,
                memory: options?.threadId ? {
                    thread: options.threadId,
                    resource: options.resourceId,
                } : undefined,
            });

            return (result?.text || 'New Chat').slice(0, 20).trim();
        } catch (e) {
            console.error('[Gateway] Title generation error:', e);
            return 'New Chat';
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
            execute: async ({ types, query }) => {
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

AVAILABLE AGENTS:
- assistant: Handles all user queries, executes tools, and provides educational support. Delegate ALL user requests to this agent.

DELEGATION STRATEGY:
1. For EVERY user message, delegate to the "assistant" agent. Pass the user's full request as the prompt.
2. Use the "getContext" tool ONLY if the user's request involves assessments, students, or marks AND you don't already have the specific names, IDs or setups in your context.
3. After the assistant responds, return its response directly to the user without modification.

DOMAIN CONTEXT (IDs):
- School ID: ${context.schoolId}
- User ID: ${context.userId}
- Designation ID: ${context.designationId}
- Active Class ID: ${context.classId || 'None'}
- Active Section ID: ${context.sectionId || 'None'}
- Active Exam ID: ${context.examId || 'None'}

CONFIDENCE GATE:
- For any intent that results in a "mutation" (e.g., /extract, /validate, /publish, or natural language requests to "update", "create", or "delete" marks/students), the assistant MUST achieve a confidence score of >= 0.9.
- If confidence is low, or if the intent is ambiguous, ask for clarification before delegating.

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
                headers: { 'Accept-Encoding': 'identity' },
                // Opengateway doesn't support response_format parameter
                supportsStructuredOutputs: false,
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
