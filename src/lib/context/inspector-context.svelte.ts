import { getContext, setContext } from "svelte";
import type { Artifact } from "$lib/types/workspace-types";

const KEY = Symbol("inspector-context");
const STORAGE_KEY = "edapex:inspector:state";

interface SavedState {
	activeSource: "chat" | "filestore" | null;
	activeChatArtifactId: string | null;
	activeChatArtifactUrl?: string;
	activeChatArtifactTitle?: string;
}

export class InspectorContext {
	inspectorOpen = $state(false);
	activeSource = $state<"chat" | "filestore" | null>(null);
	activeChatArtifactId = $state<string | null>(null);
	filestoreArtifact = $state<Artifact | null>(null);
	chatArtifacts = $state<Artifact[]>([]);

	constructor() {
		if (typeof sessionStorage === "undefined" || typeof performance === "undefined") return;
		try {
			const entries = performance.getEntriesByType("navigation");
			if (entries.length === 0) return;
			const nav = entries[0] as PerformanceNavigationTiming;
			if (nav.type === "reload") this.#restoreState();
		} catch {
			// Performance API unavailable — start closed
		}
	}

	#saveState(): void {
		if (typeof sessionStorage === "undefined") return;
		try {
			const payload: SavedState = {
				activeSource: this.activeSource,
				activeChatArtifactId: this.activeChatArtifactId,
			};
			if (this.activeSource === "filestore" && this.filestoreArtifact) {
				payload.activeChatArtifactUrl = this.filestoreArtifact.url;
				payload.activeChatArtifactTitle = this.filestoreArtifact.title;
			}
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		} catch {
			// Private browsing or quota — silently ignore
		}
	}

	#restoreState(): void {
		if (typeof sessionStorage === "undefined") return;
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const state: SavedState = JSON.parse(raw);
			if (!state.activeChatArtifactId) return;
			this.activeSource = state.activeSource;
			this.activeChatArtifactId = state.activeChatArtifactId;
			this.inspectorOpen = true;

			if (this.activeSource === "filestore" && this.activeChatArtifactId) {
				const id = this.activeChatArtifactId;
				const title = state.activeChatArtifactTitle ?? id.split("/").pop() ?? "Document";
				// Fallback URL: strip school/class prefix (e.g. "1/12_6_AY4/") from
				// the id to get the term-relative path the API expects.
				const fallbackUrl = (() => {
					const examsIdx = id.indexOf("exams/");
					const relKey = examsIdx !== -1 ? id.slice(examsIdx) : id;
					return `/api/file/${relKey}`;
				})();
				const artifact: Artifact = {
					id,
					title,
					content: "",
					url: state.activeChatArtifactUrl ?? fallbackUrl,
					status: "success",
					kind: "document",
				};
				this.filestoreArtifact = artifact;
				this.chatArtifacts = [artifact];
			}
		} catch {
			// Corrupted data — silently ignore
		}
	}

	openChatArtifact(id: string): void {
		this.activeSource = "chat";
		this.activeChatArtifactId = id;
		this.inspectorOpen = true;
		this.#saveState();
	}

	openFilestoreArtifact(artifact: Artifact): void {
		this.activeSource = "filestore";
		this.activeChatArtifactId = artifact.id;
		this.filestoreArtifact = artifact;
		this.inspectorOpen = true;
		this.#saveState();
	}

	setChatArtifacts(artifacts: Artifact[]): void {
		this.chatArtifacts = artifacts;
	}

	close(): void {
		this.inspectorOpen = false;
		this.activeSource = null;
		if (typeof sessionStorage !== "undefined") {
			try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
		}
	}

	setContext = (): void => {
		setContext(KEY, this);
	};

	static fromContext(): InspectorContext {
		const ctx = getContext<InspectorContext>(KEY);
		if (!ctx) {
			throw new Error("InspectorContext must be used within an InspectorProvider");
		}
		return ctx;
	}
}

export const useInspector = (): InspectorContext => InspectorContext.fromContext();
