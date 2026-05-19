<script lang="ts">
  /**
   * WorkflowStatusPills — Persistent status pills at the bottom of WorkspacePane.
   *
   * - Shows workflow name + "Running..." with pulse animation for active workflows
   * - Stacks up to 3 pills for concurrent workflows
   * - Shows completion summary (auto-dismiss after 10s) on workflow-complete
   * - Shows "Connection Lost — Reconnecting..." on SSE drop
   * - Shows "Connection Failed" with retry button after 10 attempts
   *
   * Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.7
   */
  import { cn } from "$lib/utils/shadcn";
  import { useChat } from "$lib/context/chat-context.svelte";
  import type { ConnectionStatus } from "$lib/context/workflow-events.svelte";
  import WifiOffIcon from "@lucide/svelte/icons/wifi-off";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import LoaderIcon from "@lucide/svelte/icons/loader";

  let {
    connectionStatus = "connected",
    onRetryConnection,
    completionSummaries = [],
  }: {
    connectionStatus?: ConnectionStatus;
    onRetryConnection?: () => void;
    completionSummaries?: Array<{
      id: string;
      workflowName: string;
      status: "success" | "partial-failure";
      stepsCompleted: number;
      stepsFailed: number;
    }>;
  } = $props();

  const chat = useChat();

  // Limit displayed workflow pills to 3 max
  let visibleWorkflows = $derived(chat.activeWorkflows.slice(0, 3));
</script>

{#if visibleWorkflows.length > 0 || connectionStatus !== "connected" || completionSummaries.length > 0}
  <div class="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-1.5 min-w-[220px] max-w-[300px]">
    <!-- Active workflow pills (max 3) -->
    {#each visibleWorkflows as wf (wf.tool)}
      <div class="rounded-full bg-background/95 backdrop-blur-md border border-primary/30 shadow-lg px-3.5 py-2 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <LoaderIcon class="size-3 text-primary animate-spin shrink-0" />
          <span class="truncate max-w-[150px] text-primary">{wf.tool}</span>
        </div>
        <span class="text-primary animate-pulse shrink-0">Running...</span>
      </div>
    {/each}

    <!-- Completion summaries (auto-dismiss after 10s) -->
    {#each completionSummaries as summary (summary.id)}
      <div class={cn(
        "rounded-full backdrop-blur-md border shadow-lg px-3.5 py-2 flex items-center gap-2.5 text-[10px] font-semibold tracking-wide animate-in fade-in slide-in-from-bottom-2 duration-300",
        summary.status === "success"
          ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-300"
          : "bg-amber-950/80 border-amber-500/30 text-amber-300"
      )}>
        {#if summary.status === "success"}
          <CheckCircleIcon class="size-3.5 shrink-0" />
        {:else}
          <AlertTriangleIcon class="size-3.5 shrink-0" />
        {/if}
        <span class="truncate flex-1">{summary.workflowName}</span>
        <span class="shrink-0 opacity-80">
          {summary.stepsCompleted}✓ {summary.stepsFailed > 0 ? `${summary.stepsFailed}✗` : ""}
        </span>
      </div>
    {/each}

    <!-- Connection status indicators -->
    {#if connectionStatus === "reconnecting"}
      <div class="rounded-full bg-amber-950/80 backdrop-blur-md border border-amber-500/30 shadow-lg px-3.5 py-2 flex items-center gap-2.5 text-[10px] font-semibold tracking-wide text-amber-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <WifiOffIcon class="size-3.5 animate-pulse shrink-0" />
        <span>Connection Lost — Reconnecting...</span>
      </div>
    {:else if connectionStatus === "failed"}
      <div class="rounded-full bg-red-950/80 backdrop-blur-md border border-red-500/30 shadow-lg px-3.5 py-2 flex items-center gap-2.5 text-[10px] font-semibold tracking-wide text-red-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <WifiOffIcon class="size-3.5 shrink-0" />
        <span class="flex-1">Connection Failed</span>
        {#if onRetryConnection}
          <button
            onclick={onRetryConnection}
            class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-colors text-[9px] font-bold uppercase tracking-wider"
          >
            <RefreshCwIcon class="size-2.5" />
            Retry
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}
