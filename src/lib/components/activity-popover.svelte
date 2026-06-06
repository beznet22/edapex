<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { backgroundTasks } from "$lib/state/background-tasks.svelte";
  import type { Task } from "$lib/types/background-tasks";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ScanSearchIcon from "@lucide/svelte/icons/scan-search";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import XIcon from "@lucide/svelte/icons/x";
  import InboxIcon from "@lucide/svelte/icons/inbox";

  const tasks = $derived(backgroundTasks.tasks);
  const activeCount = $derived(
    tasks.filter((t) => t.status === "running" || t.status === "queued").length,
  );
  const hasActivity = $derived(activeCount > 0);
  const isPulsing = $derived(hasActivity);

  function titleFor(task: Task): string {
    switch (task.spec.kind) {
      case "ocr-batch": {
        const n = task.spec.keys.length;
        return `OCR Batch — ${n} file${n === 1 ? "" : "s"}`;
      }
      case "ocr-single": {
        const name = task.spec.key.split("/").pop() ?? task.spec.key;
        return `OCR — ${name}`;
      }
    }
  }

  function statusLabel(task: Task): string {
    if (task.status === "completed") return "Completed";
    if (task.status === "failed") return "Failed";
    if (task.status === "queued") return "Queued";
    return "Running";
  }

  function barClass(task: Task): string {
    if (task.status === "failed") return "bg-rose-500/70";
    if (task.status === "completed") return "bg-emerald-500";
    return "bg-primary";
  }

  function statusTextClass(task: Task): string {
    if (task.status === "failed") return "text-rose-500";
    if (task.status === "completed") return "text-emerald-500";
    return "text-muted-foreground";
  }

  function barWidth(task: Task): number {
    if (task.status === "completed" || task.status === "failed") return 100;
    return Math.round(task.progress * 100);
  }
</script>

<Popover.Root>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label="Background activity"
        class="relative h-12 w-12 min-h-12 min-w-12 shrink-0 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground flex items-center justify-center"
      >
        <ActivityIcon class="size-4 {isPulsing ? 'text-primary animate-pulse' : ''}" />
        {#if activeCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[9px] font-black text-white flex items-center justify-center"
            aria-label="{activeCount} active"
          >
            {activeCount}
          </span>
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content
    align="end"
    side="bottom"
    sideOffset={8}
    class="w-80 p-0 bg-background/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl overflow-hidden"
  >
    <header class="flex items-center justify-between px-4 py-3 border-b border-border/30">
      <div class="flex items-center gap-2">
        <ScanSearchIcon class="size-3.5 text-primary" />
        <h3 class="text-[11px] font-black tracking-widest uppercase text-foreground/80">
          Background activity
        </h3>
      </div>
      {#if tasks.some((t) => t.status === "completed" || t.status === "failed")}
        <button
          type="button"
          class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => backgroundTasks.clearCompleted()}
        >
          Clear completed
        </button>
      {/if}
    </header>

    <div class="max-h-96 overflow-y-auto">
      {#if tasks.length === 0}
        <div class="flex flex-col items-center justify-center py-10 px-6 text-center">
          <InboxIcon class="size-8 text-muted-foreground/30 mb-3" />
          <p class="text-[11px] font-bold tracking-wider uppercase text-muted-foreground/60">
            No background tasks
          </p>
          <p class="text-[10px] text-muted-foreground/40 mt-1.5 max-w-[220px] leading-relaxed">
            Tasks run in a web worker and won't block the UI.
          </p>
        </div>
      {:else}
        <ul class="flex flex-col divide-y divide-border/30">
          {#each tasks as task (task.id)}
            <li class="px-4 py-3 group" data-status={task.status}>
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-1.5 min-w-0">
                  <ScanSearchIcon
                    class="size-3 shrink-0 {task.status === 'failed'
                      ? 'text-rose-500'
                      : task.status === 'completed'
                        ? 'text-emerald-500'
                        : 'text-primary'}"
                  />
                  <span class="text-[12px] font-semibold text-foreground truncate">
                    {titleFor(task)}
                  </span>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                  {#if task.status === "failed" && task.result}
                    <button
                      type="button"
                      class="h-6 w-6 rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                      onclick={() => backgroundTasks.retryTask(task.id)}
                      aria-label="Retry failed"
                      title="Retry failed"
                    >
                      <RotateCcwIcon class="size-3" />
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="h-6 w-6 rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                    onclick={() => backgroundTasks.dismissTask(task.id)}
                    aria-label="Dismiss"
                    title="Dismiss"
                  >
                    <XIcon class="size-3" />
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2 mb-1.5">
                <div class="flex-1 h-1 rounded-full bg-foreground/5 overflow-hidden">
                  <div
                    class="h-full transition-all duration-300 rounded-full {barClass(task)}"
                    style="width: {barWidth(task)}%"
                  ></div>
                </div>
                <span
                  class="text-[9px] font-black uppercase tracking-wider {statusTextClass(task)}"
                >
                  {statusLabel(task)}
                </span>
              </div>

              <p class="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                {task.message}
              </p>

              {#if task.status === "failed" && task.result}
                <p class="text-[9px] font-bold text-rose-400/80 mt-1.5 uppercase tracking-wider">
                  {task.result.succeeded} of {task.result.results.length} completed
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <footer class="px-4 py-2.5 border-t border-border/30 bg-foreground/[0.02]">
      <p class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
        Powered by web worker
      </p>
    </footer>
  </Popover.Content>
</Popover.Root>
