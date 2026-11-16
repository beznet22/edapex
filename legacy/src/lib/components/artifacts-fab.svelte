<script lang="ts">
  import { goto } from "$app/navigation";
  import { IsMobile } from "$lib/hooks/is-mobile.svelte";
  import { mobileUiState } from "$lib/state/mobile-ui.svelte";
  import LibraryIcon from "@lucide/svelte/icons/library";

  let {
    count,
    threadId,
  }: {
    count: number;
    threadId: string | null;
  } = $props();

  const isMobile = new IsMobile();

  function openArtifacts() {
    if (isMobile.current) {
      mobileUiState.isArtifactBrowserOpen = true;
    } else {
      const target = threadId
        ? `/filestore?threadId=${encodeURIComponent(threadId)}`
        : "/filestore";
      goto(target);
    }
  }
</script>

{#if count > 0}
  <div class="pointer-events-none sticky top-2 z-30 flex justify-center">
    <button
      type="button"
      onclick={openArtifacts}
      class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3.5 py-1.5 shadow-lg border border-border/20 hover:scale-105 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Open library"
      aria-label={`Open library (${count} artifact${count === 1 ? "" : "s"})`}
    >
      <LibraryIcon class="size-3.5" />
      <span class="text-[11px] font-bold tracking-tight">
        Artifacts {count}
      </span>
    </button>
  </div>
{/if}
