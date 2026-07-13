<script lang="ts">
	import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
	import MobileArtifactBrowser from "./MobileArtifactBrowser.svelte";
	import MobileArtifactViewer from "./MobileArtifactViewer.svelte";
	import ArtifactViewer from "./ArtifactViewer.svelte";
	import { IsMobile } from "$lib/hooks/is-mobile.svelte";
	import { mobileUiState } from "$lib/state/mobile-ui.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { UserContext } from "$lib/context/user-context.svelte";
	import type { Artifact } from "$lib/types/workspace-types";

	let {
		open = $bindable(false),
		inlineMobileViewer = false,
	}: { open?: boolean; inlineMobileViewer?: boolean } = $props();
	const userContext = UserContext.fromContext();
	const user = $derived(userContext?.user);

	const inspector = useInspector();
	const isMobile = new IsMobile();

	const desktopArtifacts = $derived(
		inspector.activeSource === "filestore" && inspector.filestoreArtifact
			? [inspector.filestoreArtifact]
			: inspector.chatArtifacts,
	);
	const desktopActiveId = $derived(inspector.activeChatArtifactId ?? undefined);
	const desktopMode = $derived(inspector.activeSource ?? "chat");

	function handleMobileSelect(key: string, artifact: Artifact) {
		inspector.openFilestoreArtifact(artifact);
		mobileUiState.isArtifactBrowserOpen = false;
		mobileUiState.viewerKey = key;
	}
</script>

{#if !isMobile.current || inlineMobileViewer}
	<ArtifactViewer
		artifacts={desktopArtifacts}
		activeId={desktopActiveId}
		mode={desktopMode}
		user={user ? { designation: (user as any).designation } : undefined}
	/>
{/if}

<!-- Mobile viewer sheet (mounts ArtifactViewer) -->
{#if !inlineMobileViewer}
	<MobileArtifactViewer />
{/if}

<!-- Mobile browser sheet (lists thread artifacts) -->
<ResponsiveSheet
	bind:open={mobileUiState.isArtifactBrowserOpen}
	class="bg-transparent border-none shadow-none mt-4 h-[85dvh] max-h-[85dvh]"
	contentClass="h-full p-0 overflow-hidden bg-transparent border-none"
>
	<div
		class="h-full w-full flex flex-col rounded-t-[2.5rem] bg-popover backdrop-blur-xl border-t border-border/60 overflow-hidden shadow-2xl"
	>
		<MobileArtifactBrowser onSelect={handleMobileSelect} />
	</div>
</ResponsiveSheet>
