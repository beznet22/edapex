import type { ClassSection } from "$lib/types/result-types";
import { SynchronizedCookie } from "./reactivity.svelte";
import { getContext, setContext } from "svelte";
import type { ModelInfo, AugmentedModelInfo } from "$lib/provider/spec";

export class SelectedModel extends SynchronizedCookie {
	constructor(value: string) {
		super("selected-model", value);
	}

	static fromContext(): SelectedModel {
		return super.fromContext("selected-model") as SelectedModel;
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
		this.#contextKey = Symbol.for("ResolvedModelHolder");
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
		return getContext(Symbol.for("ResolvedModelHolder")) as ResolvedModelHolder;
	}
}

export class SelectedCategory extends SynchronizedCookie {
	constructor(value: string) {
		super("selected-category", value);
	}

	static fromContext(): SelectedCategory {
		return super.fromContext("selected-category") as SelectedCategory;
	}
}

export class SelectedClass extends SynchronizedCookie {
	constructor(value: string) {
		super("selected-class", value);
	}

	get data(): ClassSection | null {
		try {
			return this.value ? JSON.parse(this.value) : null;
		} catch {
			return null;
		}
	}

	set data(v: ClassSection | null) {
		this.value = v ? JSON.stringify(v) : "";
	}

	static fromContext(): SelectedClass {
		return super.fromContext("selected-class") as SelectedClass;
	}
}

/**
 * Holds the SSR-loaded available models + visibility state. Pure data
 * (no sync), set by the layout from `data.availableModels` so the
 * model selector and Settings → Models tab render instantly on first
 * paint. A `refresh()` method re-fetches the same data from the
 * `getAvailableModels` remote command (called when the popover opens or
 * when the user re-enters the Settings modal) and updates state in place.
 */
export class AvailableModelsHolder {
	#models = $state<AugmentedModelInfo[]>([]);
	#hiddenIds = $state<Set<string>>(new Set());
	#contextKey: symbol;

	constructor(
		models: AugmentedModelInfo[] = [],
		hiddenIds: string[] = []
	) {
		this.#models = models;
		this.#hiddenIds = new Set(hiddenIds);
		this.#contextKey = Symbol.for("AvailableModelsHolder");
	}

	get models(): AugmentedModelInfo[] {
		return this.#models;
	}

	get hiddenIds(): Set<string> {
		return this.#hiddenIds;
	}

	replace(models: AugmentedModelInfo[], hiddenIds: string[]): void {
		this.#models = models;
		this.#hiddenIds = new Set(hiddenIds);
	}

	setContext(): void {
		setContext(this.#contextKey, this);
	}

	static fromContext(): AvailableModelsHolder {
		const existing = getContext(Symbol.for("AvailableModelsHolder")) as
			| AvailableModelsHolder
			| undefined;
		if (existing) return existing;
		// Fallback for components rendered outside the chat layout (e.g. the
		// root +layout.svelte that mounts the settings modal globally).
		// Returns an empty holder; the modal will trigger a fresh fetch on open.
		const fallback = new AvailableModelsHolder([], []);
		fallback.setContext();
		return fallback;
	}
}

