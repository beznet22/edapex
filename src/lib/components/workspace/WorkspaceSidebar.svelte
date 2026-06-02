<script lang="ts">
  import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
  import WorkspacePane from "./WorkspacePane.svelte";
  import MobileArtifactBrowser from "./MobileArtifactBrowser.svelte";
  import { cn } from "$lib/utils/shadcn";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { mobileUiState } from "$lib/state/mobile-ui.svelte";

  let {
    open = $bindable(false),
    isMobile = false,
  }: {
    open?: boolean;
    isMobile?: boolean;
  } = $props();
</script>

{#if isMobile}
  <!-- Editor Canvas Sheet: opens when a file is selected (existing behavior) -->
  <ResponsiveSheet
    bind:open
    class="bg-transparent border-none shadow-none mt-4 h-[96dvh] max-h-[96dvh]"
    contentClass="h-full p-0 overflow-hidden bg-transparent border-none"
  >
    <div class="h-full w-full flex flex-col">
      <WorkspacePane onClose={() => (open = false)} isMobile={true} />
    </div>
  </ResponsiveSheet>

  <!-- Artifact Browser Sheet: opens from app sidebar "Artifacts" button -->
  <ResponsiveSheet
    bind:open={mobileUiState.isArtifactBrowserOpen}
    class="bg-transparent border-none shadow-none mt-4 h-[85dvh] max-h-[85dvh]"
    contentClass="h-full p-0 overflow-hidden bg-transparent border-none"
  >
    <div
      class="h-full w-full flex flex-col rounded-t-[2.5rem] bg-slate-950/95 backdrop-blur-xl border-t border-white/10 overflow-hidden shadow-2xl"
    >
      <MobileArtifactBrowser
        onFileSelect={() => {
          mobileUiState.isArtifactBrowserOpen = false;
          open = true;
        }}
      />
    </div>
  </ResponsiveSheet>
{:else if open}
  <!-- Desktop persistent sidebar -->
  <div
    class="flex-col h-full overflow-hidden bg-background/40 backdrop-blur-3xl hidden lg:flex"
    transition:fly={{ x: 500, duration: 500, easing: quintOut }}
  >
    <div class="h-full w-full border-l border-white/5">
      <WorkspacePane onClose={() => (open = false)} />
    </div>
  </div>
{/if}
