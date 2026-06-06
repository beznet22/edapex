<script lang="ts">
	import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
	import ArtifactViewer from "./ArtifactViewer.svelte";
	import { mobileUiState } from "$lib/state/mobile-ui.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";

	const inspector = useInspector();

	const artifacts = $derived(
		inspector.activeSource === "filestore" && inspector.filestoreArtifact
			? [inspector.filestoreArtifact]
			: inspector.chatArtifacts,
	);
	const activeId = $derived(
		inspector.activeSource === "chat" ? inspector.activeChatArtifactId ?? undefined : undefined,
	);
	const mode = $derived(inspector.activeSource ?? "chat");

	function handleOpenChange(open: boolean) {
		if (!open) {
			mobileUiState.viewerKey = null;
			inspector.close();
		}
	}
</script>

<ResponsiveSheet open={mobileUiState.viewerKey !== null} onOpenChange={handleOpenChange}>
	<ArtifactViewer {artifacts} {activeId} {mode} />
</ResponsiveSheet>
