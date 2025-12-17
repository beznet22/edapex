import { SynchronizedCookie } from "./reactivity.svelte";

export class SelectedModel extends SynchronizedCookie {
	constructor(value: string) {
		super('selected-model', value);
	}

	static fromContext(): SelectedModel {
		return super.fromContext('selected-model');
	}
}

export class SelectedCategory extends SynchronizedCookie {
	constructor(value: string) {
		super('selected-category', value);
	}

	static fromContext(): SelectedCategory {
		return super.fromContext('selected-category');
	}
}
