<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";

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
  const isError = $derived(status === "error");

  const statusLabel = $derived(
    status === "processing"
      ? "Processing"
      : status === "streaming"
        ? "Extracting"
        : status === "success"
          ? "Ready"
          : "Failed",
  );

  const statusTone = $derived(
    status === "processing"
      ? "amber"
      : status === "streaming"
        ? "primary"
        : status === "success"
          ? "emerald"
          : "destructive",
  );

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
</script>

<div
  class="group relative w-full max-w-md overflow-hidden rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md transition-all duration-200 hover:border-border/70 hover:shadow-md hover:shadow-primary/5"
>
  <div class="flex items-start gap-4 p-4">
    <!-- LEFT: Large tilted file icon -->
    <div class="relative shrink-0">
      <div
        class="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent ring-1 ring-inset ring-border/50 transition-transform duration-300 group-hover:scale-105"
      >
        {#if isWorking}
          <div
            class="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/25 via-blue-500/25 to-pink-500/25 animate-pulse"
          ></div>
          <SparklesIcon class="relative size-9 text-primary/80 drop-shadow-sm" />
        {:else if isError}
          <div
            class="absolute inset-0 rounded-2xl bg-destructive/10"
          ></div>
          <CircleAlertIcon
            class="relative size-10 text-destructive/80 transition-transform duration-500 ease-out group-hover:rotate-[10deg] group-hover:scale-110"
            strokeWidth={1.5}
          />
        {:else}
          <FileTextIcon
            class="relative size-11 text-primary/70 transition-transform duration-500 ease-out group-hover:rotate-[10deg] group-hover:scale-110"
            strokeWidth={1.5}
          />
        {/if}
      </div>
      <!-- subtle status dot -->
      {#if !isWorking && !isError}
        <span
          class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-400"
          aria-hidden="true"
        ></span>
      {/if}
    </div>

    <!-- RIGHT: Content -->
    <div class="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
      {#if isWorking}
        <div class="space-y-2">
          <div class="h-3.5 w-3/4 rounded-md bg-muted/60 animate-pulse"></div>
          <div class="h-2.5 w-full rounded-md bg-muted/40 animate-pulse"></div>
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-muted-foreground/70 italic">
          You'll be informed immediately upon completion.
        </p>
      {:else}
        <h4 class="text-[14px] font-semibold leading-tight text-foreground truncate">
          {title}
        </h4>
        {#if filename}
          <p
            class="text-[11px] text-muted-foreground/80 truncate font-mono"
            title={filename}
          >
            {filename}
          </p>
        {/if}
        <div class="mt-1.5 flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide
              {statusTone === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' :
               statusTone === 'destructive' ? 'bg-destructive/15 text-destructive' :
               statusTone === 'primary' ? 'bg-primary/15 text-primary' :
               'bg-amber-500/15 text-amber-400'}"
          >
            {statusLabel}
          </span>
          {#if isError}
            <span class="text-[10px] text-muted-foreground/60">tap eye to retry</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- FOOTER -->
  <div
    class="flex items-center justify-between border-t border-border/30 bg-background/30 px-4 py-2.5"
  >
    {#if isWorking}
      <div class="flex items-center gap-2">
        <span class="relative flex size-2">
          <span
            class="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-75"
          ></span>
          <span class="relative inline-flex size-2 rounded-full bg-amber-400"></span>
        </span>
        <span class="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
          Working
        </span>
      </div>
    {:else if timestamp}
      <div class="flex items-center gap-1.5 text-muted-foreground/70">
        <ClockIcon class="size-3" />
        <span class="font-mono text-[11px] tabular-nums">
          {formatTimestamp(timestamp)}
        </span>
      </div>
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
      class="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:scale-110 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      <EyeIcon class="size-4" strokeWidth={2} />
    </button>
  </div>
</div>
