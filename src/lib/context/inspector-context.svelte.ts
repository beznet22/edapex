import { getContext, setContext } from "svelte";
import type { Artifact } from "$lib/types/workspace-types";

const KEY = Symbol("inspector-context");

export class InspectorContext {
	inspectorOpen = $state(false);
	activeSource = $state<"chat" | "filestore" | null>(null);
	activeChatArtifactId = $state<string | null>(null);
	filestoreArtifact = $state<Artifact | null>(null);
	chatArtifacts = $state<Artifact[]>([]);

	openChatArtifact(id: string): void {
		this.activeSource = "chat";
		this.activeChatArtifactId = id;
		this.inspectorOpen = true;
	}

	openFilestoreArtifact(artifact: Artifact): void {
		this.activeSource = "filestore";
		this.filestoreArtifact = artifact;
		this.inspectorOpen = true;
	}

	setChatArtifacts(artifacts: Artifact[]): void {
		this.chatArtifacts = artifacts;
	}

	close(): void {
		this.inspectorOpen = false;
		this.activeSource = null;
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
