import { getContext, setContext } from "svelte";
import { BUILTIN_MODELS } from "$lib/provider/catalog";
import type { ModelId as CatalogModelId } from "$lib/provider/types";

export const PERCENT_MAX = 100;
export const ICON_RADIUS = 10;
export const ICON_VIEWBOX = 24;
export const ICON_CENTER = 12;
export const ICON_STROKE_WIDTH = 2;

export type LanguageModelUsage = {
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
	totalTokens?: number;
};

export type ModelId = string;

export type ContextSchema = {
	usedTokens: number;
	maxTokens: number;
	usage?: LanguageModelUsage;
	modelId?: ModelId;
};

export class ContextClass {
	usedTokens = $state(0);
	maxTokens = $state(0);
	usage = $state<LanguageModelUsage | undefined>(undefined);
	modelId = $state<ModelId | undefined>(undefined);

	constructor(props: ContextSchema) {
		this.usedTokens = props.usedTokens;
		this.maxTokens = props.maxTokens;
		this.usage = props.usage;
		this.modelId = props.modelId;
	}

	get usedPercent() {
		return this.maxTokens > 0 ? this.usedTokens / this.maxTokens : 0;
	}

	get displayPercent() {
		return new Intl.NumberFormat("en-US", {
			style: "percent",
			maximumFractionDigits: 1,
		}).format(this.usedPercent);
	}

	get usedTokensFormatted() {
		return new Intl.NumberFormat("en-US", {
			notation: "compact",
		}).format(this.usedTokens);
	}

	get maxTokensFormatted() {
		return new Intl.NumberFormat("en-US", {
			notation: "compact",
		}).format(this.maxTokens);
	}

	get circumference() {
		return 2 * Math.PI * ICON_RADIUS;
	}

	get dashOffset() {
		return this.circumference * (1 - this.usedPercent);
	}
}

let CONTEXT_KEY = Symbol("context");

export function setContextValue(contextInstance: ContextClass) {
	setContext(CONTEXT_KEY, contextInstance);
}

export function getContextValue(): ContextClass {
	const context = getContext<ContextClass>(CONTEXT_KEY);

	if (!context) {
		throw new Error("Context components must be used within Context");
	}

	return context;
}

/**
 * Estimate cost in USD using per-model pricing from the catalog. cost.input
 * and cost.output are stored as USD per 1M tokens; cache.read is per 1M cache
 * reads. Reasoning tokens are billed at the output rate. Returns 0 if the
 * model isn't in the catalog.
 */
export function estimateCost(params: {
	modelId: string;
	usage: {
		input?: number;
		output?: number;
		reasoningTokens?: number;
		cacheReads?: number;
	};
}) {
	const builtin = BUILTIN_MODELS[params.modelId as CatalogModelId];
	if (!builtin?.cost) {
		return { totalUSD: 0 };
	}
	const perMillion = 1_000_000;
	const inputCost = (params.usage.input ?? 0) * (builtin.cost.input / perMillion);
	const outputCost = (params.usage.output ?? 0) * (builtin.cost.output / perMillion);
	const reasoningCost = (params.usage.reasoningTokens ?? 0) * (builtin.cost.output / perMillion);
	const cacheCost = (params.usage.cacheReads ?? 0) * (builtin.cost.cache.read / perMillion);
	return {
		totalUSD: inputCost + outputCost + reasoningCost + cacheCost,
	};
}
