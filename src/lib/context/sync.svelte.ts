import type { ClassSection } from "$lib/types/result-types";
import { SynchronizedCookie } from "./reactivity.svelte";

export class SelectedModel extends SynchronizedCookie {
	constructor(value: string) {
		super("selected-model", value);
	}

	static fromContext(): SelectedModel {
		return super.fromContext("selected-model") as SelectedModel;
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

