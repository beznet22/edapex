import type { ClassSection } from '$lib/types/result-types';
import { SynchronizedCookie } from './reactivity.svelte';
import { getContext, setContext } from 'svelte';
import type { ModelInfo, AugmentedModelInfo } from '$lib/provider/spec';

export class SelectedModel extends SynchronizedCookie {
	constructor(value: string) {
		super('selected-model', value);
	}

	static fromContext(): SelectedModel {
		return super.fromContext('selected-model') as SelectedModel;
	}
}

/**
 * Holds the SSR-resolved model metadata. Pure data (no sync), set by
 * the layout from the server-loaded `resolvedModel` so child components
 * can render model name + variant list on first paint without a fetch.
 */
export class ResolvedModelHolder {
	#model = $state<ModelInfo | null>(null);
	#contextKey: symbol;

	constructor(model: ModelInfo | null) {
		this.#model = model;
		this.#contextKey = Symbol.for('ResolvedModelHolder');
	}

	get value(): ModelInfo | null {
		return this.#model;
	}

	set value(v: ModelInfo | null) {
		this.#model = v;
	}

	setContext() {
		setContext(this.#contextKey, this);
	}

	static fromContext(): ResolvedModelHolder {
		return getContext(Symbol.for('ResolvedModelHolder')) as ResolvedModelHolder;
	}
}

export class SelectedCategory extends SynchronizedCookie {
	constructor(value: string) {
		super('selected-category', value);
	}

	static fromContext(): SelectedCategory {
		return super.fromContext('selected-category') as SelectedCategory;
	}
}

export class PotluckAlwaysDonate extends SynchronizedCookie {
	constructor(value: string) {
		super('potluck-always-donate', value);
	}

	static fromContext(): PotluckAlwaysDonate {
		return super.fromContext('potluck-always-donate') as PotluckAlwaysDonate;
	}
}

export class SelectedClass extends SynchronizedCookie {
	constructor(value: string) {
		super('selected-class', value);
	}

	get data(): ClassSection | null {
		try {
			return this.value ? JSON.parse(this.value) : null;
		} catch {
			return null;
		}
	}

	set data(v: ClassSection | null) {
		this.value = v ? JSON.stringify(v) : '';
	}

	static fromContext(): SelectedClass {
		return super.fromContext('selected-class') as SelectedClass;
	}
}

/**
 * Stale-while-revalidate window for `AvailableModelsHolder`. After this
 * many milliseconds the holder is considered stale and a background
 * refresh is allowed. The model-selector and ModelsTab both honour it.
 */
export const AVAILABLE_MODELS_STALE_MS = 60_000;

/**
 * Holds the SSR-loaded available models + visibility state. Pure data
 * (no sync), set by the layout from `data.availableModels` so the
 * model selector and Settings → Models tab render instantly on first
 * paint.
 *
 * `lastSyncedAt` and `syncing` track freshness so the model-selector
 * can re-fetch in the background when stale, without ever blanking the
 * popover content on the user.
 *
 * The visibility logic is centralised here:
 *   - Catalog-known models are auto-enabled unless explicitly hidden.
 *   - Non-catalog discovered models are opt-in via `enabledIds`.
 *   `isEnabled()` + `visibleModels` are the single source of truth for
 *   both the chat selector and the Settings → Models tab.
 */
export class AvailableModelsHolder {
	#models = $state<AugmentedModelInfo[]>([]);
	#hiddenIds = $state<Set<string>>(new Set());
	#enabledIds = $state<Set<string>>(new Set());
	#lastSyncedAt = $state<number>(0);
	#syncing = $state<boolean>(false);
	#contextKey: symbol;

	constructor(
		models: AugmentedModelInfo[] = [],
		hiddenIds: string[] = [],
		enabledIds: string[] = []
	) {
		this.#models = models;
		this.#hiddenIds = new Set(hiddenIds);
		this.#enabledIds = new Set(enabledIds);
		// When the layout hands us real SSR data, mark the holder as
		// "fresh" so the popover does not re-fetch on first open. An
		// empty array is a legitimate state (user has no providers) and
		// still counts as fresh — the data was just very thin.
		this.#lastSyncedAt = models.length > 0 || hiddenIds.length > 0 || enabledIds.length > 0
			? Date.now()
			: 0;
		this.#contextKey = Symbol.for('AvailableModelsHolder');
	}

	get models(): AugmentedModelInfo[] {
		return this.#models;
	}

	get hiddenIds(): ReadonlySet<string> {
		return this.#hiddenIds;
	}

	get enabledIds(): ReadonlySet<string> {
		return this.#enabledIds;
	}

	get lastSyncedAt(): number {
		return this.#lastSyncedAt;
	}

	get syncing(): boolean {
		return this.#syncing;
	}

	get isStale(): boolean {
		if (this.#lastSyncedAt === 0) return true;
		return Date.now() - this.#lastSyncedAt > AVAILABLE_MODELS_STALE_MS;
	}

	hasHidden(modelId: string): boolean {
		return this.#hiddenIds.has(modelId);
	}

	hasEnabled(modelId: string): boolean {
		return this.#enabledIds.has(modelId);
	}

	/**
	 * Returns true if the model should be visible in the chat
	 * model-selector.
	 *
	 *   - catalog-known: enabled unless hidden
	 *   - non-catalog:   enabled only if explicitly in `enabledIds`
	 */
	isEnabled(model: AugmentedModelInfo): boolean {
		if (model.isCatalogKnown) {
			return !this.#hiddenIds.has(model.id);
		}
		return this.#enabledIds.has(model.id);
	}

	/**
	 * The subset of `models` that the chat model-selector should show.
	 * `ModelsTab` continues to use `models` (the full set, including
	 * hidden / disabled) so the user can opt in.
	 */
	get visibleModels(): AugmentedModelInfo[] {
		return this.#models.filter((m) => this.isEnabled(m));
	}

	replace(
		models: AugmentedModelInfo[],
		hiddenIds: string[],
		enabledIds: string[] = []
	): void {
		this.#models = models;
		this.#hiddenIds = new Set(hiddenIds);
		this.#enabledIds = new Set(enabledIds);
		this.#lastSyncedAt = Date.now();
		this.#syncing = false;
	}

	markSyncing(on: boolean): void {
		this.#syncing = on;
	}

	setContext(): void {
		setContext(this.#contextKey, this);
	}

	/**
	 * Module-level sentinel returned by `fromContext()` when the context
	 * isn't in scope. SSR renders the settings modal from the root layout,
	 * so non-chat routes (e.g. `/signin`) call `fromContext()` before the
	 * `(chat)` group layout has a chance to set the holder. Returning a
	 * stable empty instance keeps those routes renderable instead of 500'ing
	 * on the throw; the chat layout remains the single producer of real
	 * data and replaces this sentinel with a populated one inside chat routes.
	 */
	static #empty = new AvailableModelsHolder();

	static fromContext(): AvailableModelsHolder {
		const existing = getContext(Symbol.for('AvailableModelsHolder')) as
			| AvailableModelsHolder
			| undefined;
		if (!existing) {
			return AvailableModelsHolder.#empty;
		}
		return existing;
	}
}
