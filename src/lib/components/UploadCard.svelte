<script lang="ts">
  /**
   * UploadCard — animated combined upload card for the library.
   *
   * Renders a glassmorphic card with a header progress bar and per-file
   * sub-rows. Each sub-row shows: file icon, name, size (with reduction
   * badge when compression helped), status spinner, and dismiss button.
   *
   * Uses svelte/transition (fly + backOut) for entry/exit, svelte/animate
   * (flip) for smooth row reordering, and the `compress-shimmer`,
   * `error-shake`, and `done-pop` keyframes from `layout.css`.
   */
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { backOut } from "svelte/easing";
  import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
  import CloudUploadIcon from "@lucide/svelte/icons/cloud-upload";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileQuestionIcon from "@lucide/svelte/icons/file-question";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";
  import XIcon from "@lucide/svelte/icons/x";
  import { formatBytes } from "$lib/compression.utils";

  export type UploadJobStatus = "compressing" | "uploading" | "done" | "error";

  export interface UploadJob {
    id: string;
    file: File;
    status: UploadJobStatus;
    compressedSize?: number;
    error?: string;
    /** Increment this on every status flip to retrigger shake/pop animations. */
    statusEpoch?: number;
  }

  let {
    jobs,
    onDismissJob,
    onCollapse,
  }: {
    jobs: UploadJob[];
    onDismissJob: (id: string) => void;
    onCollapse: () => void;
  } = $props();

  const doneCount = $derived(jobs.filter((j) => j.status === "done").length);
  const errorCount = $derived(jobs.filter((j) => j.status === "error").length);
  const total = $derived(jobs.length);
  const completedFraction = $derived(
    total === 0 ? 0 : (doneCount + errorCount) / total,
  );
  const allDone = $derived(doneCount + errorCount === total);

  const headerText = $derived.by(() => {
    if (allDone && errorCount === 0) return "Upload complete";
    if (allDone && errorCount > 0) return `Uploaded ${doneCount}, ${errorCount} failed`;
    return "Uploading";
  });

  const summaryText = $derived.by(() => {
    if (allDone) {
      return `${doneCount} of ${total} ${total === 1 ? "file" : "files"} ready`;
    }
    return `${doneCount} of ${total} done`;
  });

  function progressBarWidthPct(p: UploadJob): number {
    if (p.status === "done") return 100;
    if (p.status === "error") return 100;
    if (p.status === "uploading") return 70;
    return 30;
  }

  function progressBarClass(p: UploadJob): string {
    if (p.status === "done") return "bg-emerald-400";
    if (p.status === "error") return "bg-destructive";
    if (p.status === "uploading") return "bg-primary";
    return "bg-amber-400";
  }

  function iconBgClass(p: UploadJob): string {
    if (p.status === "compressing") return "bg-amber-400/15 text-amber-400 compress-shimmer";
    if (p.status === "uploading") return "bg-primary/15 text-primary";
    if (p.status === "done") return "bg-emerald-400/15 text-emerald-400";
    return "bg-destructive/15 text-destructive";
  }

  function fileIcon(file: File) {
    if (file.type.startsWith("image/")) return FileImageIcon;
    if (file.type === "application/pdf") return FileTextIcon;
    return FileQuestionIcon;
  }

  function reductionPct(orig: number, comp?: number): number | null {
    if (!comp || comp >= orig) return null;
    return Math.round((1 - comp / orig) * 100);
  }
</script>

{#if jobs.length > 0}
  <div
    class="hermes-glass rounded-2xl overflow-hidden shadow-lg
           transition-spring"
    in:fly={{ y: 20, duration: 320, easing: backOut }}
    out:fly={{ y: -20, duration: 200, easing: backOut }}
  >
    <div class="flex items-center gap-3 px-4 py-3 border-b border-border/40">
      <div
        class="size-8 rounded-xl flex items-center justify-center shrink-0
               transition-all duration-300
               {allDone
                 ? (errorCount > 0 ? 'bg-destructive/15' : 'bg-emerald-400/15')
                 : 'bg-primary/15'}"
      >
        {#if allDone}
          {#if errorCount > 0}
            <XCircleIcon class="size-4 text-destructive" />
          {:else}
            <CheckCircle2Icon class="size-4 text-emerald-400" />
          {/if}
        {:else}
          <Loader2Icon class="size-4 text-primary animate-spin" />
        {/if}
      </div>

      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-black uppercase tracking-widest text-foreground truncate">
          {headerText}
        </p>
        <p class="text-[10px] text-muted-foreground tabular-nums">
          {summaryText}
        </p>
      </div>

      <div class="w-32 h-1 rounded-full bg-foreground/5 overflow-hidden shrink-0">
        <div
          class="h-full rounded-full transition-all duration-500 ease-out
                 {allDone ? (errorCount > 0 ? 'bg-destructive' : 'bg-emerald-400') : 'bg-primary'}"
          style="width: {Math.round(completedFraction * 100)}%"
        ></div>
      </div>

      <button
        type="button"
        onclick={onCollapse}
        class="size-7 rounded-full hover:bg-muted/40 flex items-center justify-center
               transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Dismiss upload card"
        title="Dismiss"
      >
        <XIcon class="size-3.5" />
      </button>
    </div>

    <ul class="divide-y divide-border/30 max-h-80 overflow-y-auto scrollbar-hide">
      {#each jobs as job (job.id)}
        {@const Icon = fileIcon(job.file)}
        {@const reduction = reductionPct(job.file.size, job.compressedSize)}
        <li
          class="flex items-center gap-3 px-4 py-2.5 group transition-spring-chip
                 hover:bg-muted/20
                 {job.status === 'error' ? 'shake-once' : ''}
                 {job.status === 'done' ? 'pop-once' : ''}"
          data-status={job.status}
          animate:flip={{ duration: 280, easing: backOut }}
          in:fly={{ y: 8, duration: 240, easing: backOut }}
          out:fly={{ y: -8, duration: 160, easing: backOut }}
        >
          <div
            class="size-8 rounded-lg grid place-items-center shrink-0
                   transition-all duration-300 {iconBgClass(job)}"
          >
            {#if job.status === "compressing"}
              <Loader2Icon class="size-4 animate-spin" />
            {:else if job.status === "uploading"}
              <UploadIcon class="size-4 animate-pulse" />
            {:else if job.status === "done"}
              <CheckCircle2Icon class="size-4" />
            {:else}
              <XCircleIcon class="size-4" />
            {/if}
          </div>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-foreground truncate">
              {job.file.name}
            </p>
            <p class="text-[10px] text-muted-foreground tabular-nums">
              {#if job.status === "error" && job.error}
                <span class="text-destructive">{job.error}</span>
              {:else if reduction !== null}
                <span class="text-emerald-400">{formatBytes(job.compressedSize)}</span>
                <span class="text-muted-foreground/60"> · -{reduction}%</span>
                <span class="text-muted-foreground/40"> from {formatBytes(job.file.size)}</span>
              {:else}
                {formatBytes(job.file.size)}
              {/if}
            </p>
          </div>

          <div class="w-16 h-1 rounded-full bg-foreground/5 overflow-hidden shrink-0">
            <div
              class="h-full rounded-full transition-all duration-500 ease-out {progressBarClass(job)}"
              style="width: {progressBarWidthPct(job)}%"
            ></div>
          </div>

          <button
            type="button"
            onclick={() => onDismissJob(job.id)}
            class="opacity-0 group-hover:opacity-100 size-6 rounded-md hover:bg-muted/40
                   transition-all flex items-center justify-center
                   text-muted-foreground hover:text-foreground"
            aria-label="Dismiss {job.file.name}"
            title="Dismiss"
          >
            <XIcon class="size-3" />
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}
