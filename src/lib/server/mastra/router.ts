import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './db/schema';
import { agentRouting, agentSettings, providerCredentials } from './db/schema';
import { MODEL_REGISTRY, getModelById, getBareModelName, type ModelDefinition } from './registry';
import { resolveModelConfig } from '@mastra/core/llm';
import type { LanguageModel as MastraLanguageModel } from '@mastra/core/llm';

import {
	ensureAgentTables,
	getProviderCredentialWithFallback,
	decrypt,
	normalizeGatewayRequest
} from './provider-config';

export type AgentRole = 'supervisor' | 'assistant' | 'default' | string;

export interface ResolvedModel {
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	capabilities?: ModelDefinition['capabilities'];
}

export type TaskType =
	| 'title'
	| 'chat'
	| 'chat-reasoning'
	| 'vision'
	| 'artifact'
	| 'ocr'
	| 'image-gen'
	| 'stt'
	| 'tts'
	| 'video-gen'
	| 'audio-gen';

export class AgentRouter {
	static readonly BASE_URLS: Record<string, string> = {
		nvidia_nim: 'https://integrate.api.nvidia.com/v1',
		groq: 'https://api.groq.com/openai/v1',
		deepseek: 'https://api.deepseek.com',
		opencode: 'https://opencode.ai/zen/v1',
		mistral: 'https://api.mistral.ai/v1',
	};

	constructor(
		private db: LibSQLDatabase<typeof schema>,
		private userId: number
	) { }

	/**
	 * Resolves the best model for a given agent role based on the 6-tier routing hierarchy.
	 */
	async resolveModel(
		role: AgentRole,
		conversationOverride?: string,
		thinkingEnabled: boolean = false,
		profileOverride?: string
	): Promise<ResolvedModel> {
		// Ensure tables and columns exist before any queries
		await ensureAgentTables(this.db);

		// 1. Tier 1: Conversation Override (Specific Model)
		if (conversationOverride && conversationOverride !== 'deep-reasoning' && conversationOverride !== 'auto') {
			const model = getModelById(conversationOverride);
			if (model) {
				return {
					provider: model.provider,
					model: model.id,
					capabilities: model.capabilities
				};
			}
		}

		// 2. Tier 2: Deep Reasoning Mode
		if (conversationOverride === 'deep-reasoning') {
			const bestReasoning = await this.resolveBestReasoningModel();
			if (bestReasoning) {
				return bestReasoning;
			}
		}

		// 3. Tier 3: Agent Role Mapping (Manual)
		const route = await this.db
			.select()
			.from(agentRouting)
			.where(and(eq(agentRouting.userId, this.userId), eq(agentRouting.role, role)))
			.get();

		if (route) {
			const model = getModelById(route.model);
			if (model) {
				return {
					provider: model.provider,
					model: model.id,
					capabilities: model.capabilities
				};
			}
		}

		// 4. Tier 4 & 5: Profile Selection & Thinking Toggle
		let profile = profileOverride;

		if (!profile) {
			const [settings] = await this.db
				.select()
				.from(agentSettings)
				.where(eq(agentSettings.userId, this.userId))
				.limit(1);

			profile = settings?.profile || 'balanced';
		}

		return this.resolveByProfile(profile as 'strong' | 'balanced' | 'simple', thinkingEnabled);
	}

	/**
	 * Resolves a live MastraLanguageModel for a specific task type or role.
	 */
	async resolveMastraModel(
		roleOrTask: AgentRole | string,
		envKeys: Record<string, string | undefined>,
		encryptionKey: string,
		conversationOverride?: string,
		thinkingEnabled: boolean = false,
		profileOverride?: string
	): Promise<MastraLanguageModel> {
		// If it's a specific task, map it to a ResolvedModel based on task-to-capability filter
		let resolved: ResolvedModel;

		const taskConfigMap: Record<string, { filter: (m: ModelDefinition) => boolean; fallbackRole: string }> = {
			ocr: {
				filter: (m) => m.id === 'mistral/mistral-ocr-latest',
				fallbackRole: 'default',
			},
			vision: {
				filter: (m) => m.capabilities.supportsVision,
				fallbackRole: 'assistant',
			},
			chat: {
				filter: (m) => m.capabilities.supportsTools,
				fallbackRole: 'assistant',
			},
			title: {
				filter: (m) => m.tier === 'speed' || m.tier === 'lite',
				fallbackRole: 'default',
			},
		};

		const taskConfig = taskConfigMap[roleOrTask];
		if (taskConfig) {
			const activeProviders = await this.getActiveProviderIds();
			const candidates = MODEL_REGISTRY.filter((m) => {
				if (!activeProviders.includes(m.provider) && m.provider !== 'opengateway') return false;
				return taskConfig.filter(m);
			});

			if (candidates.length > 0) {
				const sorted = candidates.sort((a, b) => {
					const tierOrder: Record<string, number> = { flagship: 6, reasoning: 5, pro: 4, omni: 3, mid: 2, speed: 1, lite: 0, low: 0 };
					return (tierOrder[b.tier as string] || 0) - (tierOrder[a.tier as string] || 0);
				});
				resolved = {
					provider: sorted[0].provider,
					model: sorted[0].id,
					capabilities: sorted[0].capabilities,
				};
			} else {
				resolved = await this.resolveModel(taskConfig.fallbackRole, conversationOverride, thinkingEnabled, profileOverride);
			}
		} else {
			resolved = await this.resolveModel(roleOrTask, conversationOverride, thinkingEnabled, profileOverride);
		}

		// Resolve MastraLanguageModel using resolveModelConfig
		const config = await getProviderCredentialWithFallback(this.db, this.userId, resolved.provider, envKeys);

		let apiKey = '';
		if (config) {
			if (config.source === 'env') {
				apiKey = envKeys[`${resolved.provider.toUpperCase()}_API_KEY`] || '';
			} else if (config.apiKeyEncrypted) {
				apiKey = decrypt(config.apiKeyEncrypted, encryptionKey);
			}
		}

		const baseOptions = {
			id: resolved.model as `${string}/${string}`,
			apiKey,
			baseURL: config?.baseUrl || undefined,
		};

		const normalized = normalizeGatewayRequest(resolved.provider, baseOptions);
		const model = await resolveModelConfig(normalized);
		return model as MastraLanguageModel;
	}

	/**
	 * Resolves a model based on the user's active profile and thinking toggle.
	 */
	private async resolveByProfile(profile: 'strong' | 'balanced' | 'simple', thinkingEnabled: boolean): Promise<ResolvedModel> {
		const activeProviders = await this.getActiveProviderIds();

		// Exclude extraction-only models from chat routing
		const chatModels = MODEL_REGISTRY.filter(m => m.id !== 'mistral/mistral-ocr-latest');

		// Filter registry based on profile and thinking requirements
		const candidates = chatModels.filter(m => {
			if (!activeProviders.includes(m.provider) && m.provider !== 'opengateway') return false;

			if (thinkingEnabled && !m.capabilities.supportsReasoning) return false;

			if (profile === 'strong') {
				return m.tier === 'flagship' || m.tier === 'pro' || m.tier === 'reasoning';
			} else if (profile === 'simple') {
				return m.tier === 'lite' || m.tier === 'speed' || m.tier === 'low';
			} else {
				return m.tier === 'mid' || m.tier === 'omni' || m.tier === 'speed' || m.tier === 'pro';
			}
		});

		// Pick the best from candidates (sort by tier priority)
		const sorted = candidates.sort((a, b) => {
			const tierOrder: Record<string, number> = { flagship: 6, reasoning: 5, pro: 4, omni: 3, mid: 2, speed: 1, lite: 0, low: 0 };
			return (tierOrder[b.tier as string] || 0) - (tierOrder[a.tier as string] || 0);
		});

		if (sorted[0]) {
			return {
				provider: sorted[0].provider,
				model: sorted[0].id,
				capabilities: sorted[0].capabilities
			};
		}

		// Tier 6: Global Fallback (Last Resort)
		return {
			provider: 'opengateway',
			model: 'opengateway/mimo-v2-flash'
		};
	}

	/**
	 * Logic for "Deep Reasoning" mode — finds the best available reasoning model.
	 */
	private async resolveBestReasoningModel(): Promise<ResolvedModel | null> {
		const activeProviders = await this.getActiveProviderIds();

		const reasoningModels = MODEL_REGISTRY.filter(m =>
			m.capabilities.supportsReasoning &&
			(activeProviders.includes(m.provider) || m.provider === 'opengateway')
		).sort((a, b) => {
			const tierOrder: Record<string, number> = { flagship: 6, reasoning: 5, pro: 4, omni: 3, mid: 2, speed: 1, lite: 0, low: 0 };
			return (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0);
		});

		if (reasoningModels[0]) {
			return {
				provider: reasoningModels[0].provider,
				model: reasoningModels[0].id,
				capabilities: reasoningModels[0].capabilities
			};
		}

		return null;
	}

	/**
	 * Returns IDs of providers with configured credentials or env fallbacks.
	 */
	private async getActiveProviderIds(): Promise<string[]> {
		const dbConfigs = await this.db
			.select()
			.from(providerCredentials)
			.where(and(eq(providerCredentials.userId, this.userId), eq(providerCredentials.enabled, 1)));

		return dbConfigs.map(c => c.provider);
	}
}
