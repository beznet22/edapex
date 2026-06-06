<script lang="ts">
	import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
	import MobileArtifactBrowser from "./MobileArtifactBrowser.svelte";
	import MobileArtifactViewer from "./MobileArtifactViewer.svelte";
	import ArtifactViewer from "./ArtifactViewer.svelte";
	import { IsMobile } from "$lib/hooks/is-mobile.svelte";
	import { mobileUiState } from "$lib/state/mobile-ui.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import type { Artifact } from "$lib/types/workspace-types";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const inspector = useInspector();
	const isMobile = new IsMobile();

	const desktopArtifacts = $derived(
		inspector.activeSource === "filestore" && inspector.filestoreArtifact
			? [inspector.filestoreArtifact]
			: inspector.chatArtifacts,
	);
	const desktopActiveId = $derived(
		inspector.activeSource === "chat"
			? inspector.activeChatArtifactId ?? undefined
			: undefined,
	);
	const desktopMode = $derived(inspector.activeSource ?? "chat");

	function handleMobileSelect(key: string, artifact: Artifact) {
		inspector.openFilestoreArtifact(artifact);
		mobileUiState.isArtifactBrowserOpen = false;
		mobileUiState.viewerKey = key;
	}
</script>

{#if !isMobile.current}
	<ArtifactViewer
		artifacts={desktopArtifacts}
		activeId={desktopActiveId}
		mode={desktopMode}
	/>
{/if}

<!-- Mobile viewer sheet (mounts ArtifactViewer) -->
<MobileArtifactViewer />

<!-- Mobile browser sheet (lists thread artifacts) -->
<ResponsiveSheet
	bind:open={mobileUiState.isArtifactBrowserOpen}
	class="bg-transparent border-none shadow-none mt-4 h-[85dvh] max-h-[85dvh]"
	contentClass="h-full p-0 overflow-hidden bg-transparent border-none"
>
	<div
		class="h-full w-full flex flex-col rounded-t-[2.5rem] bg-slate-950/95 backdrop-blur-xl border-t border-white/10 overflow-hidden shadow-2xl"
	>
		<MobileArtifactBrowser onSelect={handleMobileSelect} />
	</div>
</ResponsiveSheet>
