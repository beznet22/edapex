<script lang="ts">
  /**
   * PublishViewer — PDF preview with batch navigation, progress, and completion summary.
   *
   * Renders finalized PDF report cards inline via EditorCanvas (type: pdf),
   * provides prev/next navigation for batches, shows progress during the
   * publish workflow, displays a completion summary, handles partial failures,
   * and shows action prompts while the workflow is suspended.
   *
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
   */
  import { cn } from "$lib/utils/shadcn";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import EditorCanvas from "./editor-canvas.svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import MailIcon from "@lucide/svelte/icons/mail";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";

  interface PdfItem {
    url: string;
    studentName: string;
  }

  interface CompletionSummary {
    pdfCount: number;
    emailCount: number;
    failedCount: number;
    errors: Array<{ studentName: string; reason: string }>;
  }

  interface FailedGeneration {
    studentName: string;
    reason: string;
  }

  let {
    pdfs = [],
    status = "generating",
    currentStep = "",
    completionSummary,
    failedGenerations,
  }: {
    pdfs?: PdfItem[];
    status?: "generating" | "awaiting-publish" | "dispatching" | "complete";
    currentStep?: string;
    completionSummary?: CompletionSummary;
    failedGenerations?: FailedGeneration[];
  } = $props();

  let currentIndex = $state(0);

  let activePdf = $derived(pdfs.length > 0 ? pdfs[currentIndex] : null);
  let hasPrev = $derived(currentIndex > 0);
  let hasNext = $derived(currentIndex < pdfs.length - 1);
  let isRunning = $derived(status === "generating" || status === "dispatching");
  let isSuspended = $derived(status === "awaiting-publish");
  let isComplete = $derived(status === "complete");
  let hasPartialFailures = $derived(
    failedGenerations !== undefined && failedGenerations.length > 0
  );
  let displayErrors = $derived(
    completionSummary?.errors?.slice(0, 50) ?? []
  );

  function goToPrev() {
    if (hasPrev) currentIndex--;
  }

  function goToNext() {
    if (hasNext) currentIndex++;
  }

  // Reset index when pdfs change
  $effect(() => {
    if (pdfs.length > 0 && currentIndex >= pdfs.length) {
      currentIndex = pdfs.length - 1;
    }
  });
</script>

<div class="flex flex-col h-full w-full overflow-hidden">
  <!-- Progress Indicator (while generating or dispatching) -->
  {#if isRunning}
    <div class="flex items-center gap-2.5 px-4 py-3 border-b border-white/5 bg-[#D4AF37]/5">
      <LoaderCircleIcon class="size-4 text-[#D4AF37] animate-spin shrink-0" />
      <span class="text-[11px] font-bold text-[#D4AF37] tracking-wide truncate">
        {currentStep || (status === "generating" ? "Generating PDFs..." : "Dispatching emails...")}
      </span>
    </div>
  {/if}

  <!-- Partial Failure Warning -->
  {#if hasPartialFailures}
    <div class="flex flex-col gap-1.5 px-4 py-3 border-b border-amber-500/20 bg-amber-950/30">
      <div class="flex items-center gap-2">
        <AlertTriangleIcon class="size-3.5 text-amber-400 shrink-0" />
        <span class="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
          {failedGenerations!.length} PDF{failedGenerations!.length !== 1 ? "s" : ""} failed to generate
        </span>
      </div>
      <ScrollArea class="max-h-[80px]">
        <div class="flex flex-col gap-1 pl-5.5">
          {#each failedGenerations! as failure}
            <p class="text-[9px] text-amber-400/70 leading-relaxed">
              <span class="font-semibold text-amber-300">{failure.studentName}</span>
              — {failure.reason}
            </p>
          {/each}
        </div>
      </ScrollArea>
    </div>
  {/if}

  <!-- Action Prompt (while suspended awaiting publish approval) -->
  {#if isSuspended}
    <div class="flex items-center gap-3 px-4 py-3 border-b border-amber-400/20 bg-amber-400/5">
      <div class="flex-1">
        <p class="text-[10px] font-bold text-white/70 leading-relaxed">
          Type
          <code class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-400 font-mono font-bold text-[10px]">/publish</code>
          to proceed with dispatch or
          <code class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-red-400 font-mono font-bold text-[10px]">/cancel</code>
          to abort
        </p>
      </div>
    </div>
  {/if}

  <!-- PDF Viewer Area -->
  {#if pdfs.length > 0}
    <div class="flex-1 min-h-0 relative">
      {#if activePdf}
        <EditorCanvas
          filename="{activePdf.studentName}.pdf"
          url={activePdf.url}
          type="pdf"
        />
      {/if}

      <!-- Navigation Controls (only show when batch > 1) -->
      {#if pdfs.length > 1}
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-background/90 backdrop-blur-md border border-white/10 shadow-2xl">
          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-full hover:bg-white/10 disabled:opacity-30"
            disabled={!hasPrev}
            onclick={goToPrev}
          >
            <ChevronLeftIcon class="size-4" />
          </Button>

          <div class="flex items-center gap-1.5 px-2">
            <span class="text-[10px] font-bold text-white/80 tabular-nums">
              {currentIndex + 1}
            </span>
            <span class="text-[10px] text-white/30">/</span>
            <span class="text-[10px] font-bold text-white/50 tabular-nums">
              {pdfs.length}
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-full hover:bg-white/10 disabled:opacity-30"
            disabled={!hasNext}
            onclick={goToNext}
          >
            <ChevronRightIcon class="size-4" />
          </Button>
        </div>

        <!-- Student Name Label -->
        <div class="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-md border border-white/10 shadow-lg">
          <span class="text-[10px] font-bold text-white/70 tracking-wide">
            {activePdf?.studentName}
          </span>
        </div>
      {/if}
    </div>
  {:else if !isRunning && !isComplete}
    <!-- Empty state when no PDFs and not running -->
    <div class="flex-1 flex flex-col items-center justify-center text-center px-8 opacity-30">
      <div class="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-5 border border-white/5">
        <FileTextIcon class="size-8" />
      </div>
      <p class="text-[11px] font-bold text-white/60">No PDFs available</p>
    </div>
  {/if}

  <!-- Completion Summary -->
  {#if isComplete && completionSummary}
    <div class="border-t border-white/5 bg-slate-950/40 px-4 py-4">
      <!-- Summary Stats -->
      <div class="flex items-center gap-4 mb-3">
        <div class="flex items-center gap-1.5">
          <FileTextIcon class="size-3.5 text-emerald-400" />
          <span class="text-[11px] font-bold text-emerald-300">{completionSummary.pdfCount}</span>
          <span class="text-[9px] text-white/40 uppercase tracking-wider font-semibold">PDFs</span>
        </div>
        <div class="flex items-center gap-1.5">
          <MailIcon class="size-3.5 text-blue-400" />
          <span class="text-[11px] font-bold text-blue-300">{completionSummary.emailCount}</span>
          <span class="text-[9px] text-white/40 uppercase tracking-wider font-semibold">Emails</span>
        </div>
        {#if completionSummary.failedCount > 0}
          <div class="flex items-center gap-1.5">
            <XCircleIcon class="size-3.5 text-red-400" />
            <span class="text-[11px] font-bold text-red-300">{completionSummary.failedCount}</span>
            <span class="text-[9px] text-white/40 uppercase tracking-wider font-semibold">Failed</span>
          </div>
        {/if}
      </div>

      <!-- Per-Student Errors (max 50) -->
      {#if displayErrors.length > 0}
        <div class="border-t border-white/5 pt-3">
          <p class="text-[9px] font-black uppercase tracking-[0.15em] text-white/30 mb-2">
            Errors ({displayErrors.length}{completionSummary.errors.length > 50 ? " of " + completionSummary.errors.length : ""})
          </p>
          <ScrollArea class="max-h-[160px]">
            <div class="flex flex-col gap-1.5">
              {#each displayErrors as error}
                <div class="flex items-start gap-2 px-2 py-1.5 rounded-md bg-red-950/20 border border-red-500/10">
                  <XCircleIcon class="size-3 text-red-400 shrink-0 mt-0.5" />
                  <div class="flex-1 min-w-0">
                    <span class="text-[10px] font-semibold text-red-300 block truncate">{error.studentName}</span>
                    <span class="text-[9px] text-red-400/60 block truncate">{error.reason}</span>
                  </div>
                </div>
              {/each}
            </div>
          </ScrollArea>
        </div>
      {/if}
    </div>
  {/if}
</div>
