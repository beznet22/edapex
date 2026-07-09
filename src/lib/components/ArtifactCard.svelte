<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";

  let {
    artifactId,
    status,
    title,
    filename,
    timestamp,
  }: {
    artifactId: string;
    status: "processing" | "streaming" | "success" | "error";
    title: string;
    filename?: string;
    timestamp?: string;
  } = $props();

  const dispatch = createEventDispatcher<{ "chat:openArtifact": { artifactId: string } }>();

  const isWorking = $derived(status === "processing" || status === "streaming");

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
</script>

<div class="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md overflow-hidden">
  <div class="grid grid-cols-[auto_1fr] gap-3 p-3">
    <!-- LEFT: 96x96 thumbnail -->
    <div class="size-24 rounded-xl overflow-hidden shrink-0 relative">
      {#if isWorking}
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/60 via-blue-500/60 to-pink-500/60 animate-pulse"></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <SparklesIcon class="size-10 text-white/90 drop-shadow" />
        </div>
      {:else}
        <div class="absolute inset-0 bg-zinc-800/80 flex flex-col gap-1 p-2">
          <div class="h-1/3 bg-zinc-700 rounded-sm"></div>
          <div class="flex-1 space-y-1">
            <div class="h-1.5 bg-zinc-700 rounded-sm w-3/4"></div>
            <div class="h-1.5 bg-zinc-700 rounded-sm w-full"></div>
            <div class="h-1.5 bg-zinc-700 rounded-sm w-1/2"></div>
          </div>
        </div>
      {/if}
    </div>

    <!-- RIGHT: content area -->
    <div class="flex flex-col justify-center min-w-0">
      {#if isWorking}
        <div class="space-y-2">
          <div class="h-3 bg-muted/40 rounded animate-pulse w-3/4"></div>
          <div class="h-2.5 bg-muted/30 rounded animate-pulse w-full"></div>
        </div>
        <p class="text-[10px] text-muted-foreground/70 mt-2 italic">
          You'll be informed immediately upon completion.
        </p>
      {:else}
        <h4 class="text-[13px] font-semibold text-foreground truncate">{title}</h4>
        {#if filename}
          <p class="text-[10px] text-muted-foreground/80 mt-0.5 truncate font-mono">{filename}</p>
        {/if}
      {/if}
    </div>
  </div>

  <!-- FOOTER -->
  <footer class="flex items-center justify-between px-3 py-2 border-t border-border/30">
    {#if isWorking}
      <div class="h-2.5 w-16 bg-muted/30 rounded animate-pulse"></div>
    {:else if timestamp}
      <span class="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
        {formatTimestamp(timestamp)}
      </span>
    {/if}
    <button
      type="button"
      onclick={() => {
        dispatch("chat:openArtifact", { artifactId });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("chat:openArtifact", { detail: { artifactId } }),
          );
        }
      }}
      aria-label="Preview artifact"
      class="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <EyeIcon class="size-3.5" />
    </button>
  </footer>
</div>
