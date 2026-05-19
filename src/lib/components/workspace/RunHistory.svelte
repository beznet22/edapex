<script lang="ts">
  /**
   * RunHistory — Step-by-step execution trace for Mastra workflow runs.
   *
   * - Lists workflow runs from mastra_runs table filtered by TenantContext
   * - Displays max 50 runs sorted by startedAt descending
   * - Shows step-by-step execution markers (success/failure) on run selection
   * - Collapsible raw JSON inputs/outputs per step (truncated to 10KB)
   * - Error + stack trace (truncated to 5KB) for failed steps
   * - Access restricted to Coordinator (designationId 5) and IT_User (designationId 1)
   * - Empty state when no runs exist
   *
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
   */
  import { cn } from "$lib/utils/shadcn";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleXIcon from "@lucide/svelte/icons/circle-x";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import ClockIcon from "@lucide/svelte/icons/clock";

  const MAX_PAYLOAD_CHARS = 10_000;
  const MAX_STACK_TRACE_CHARS = 5_000;

  interface WorkflowRun {
    id: string;
    workflowId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    durationMs: number | null;
  }

  interface RunStep {
    stepName: string;
    stepIndex: number;
    status: string;
    inputPayload: string | null;
    outputPayload: string | null;
    error: string | null;
    stackTrace: string | null;
    durationMs: number | null;
  }

  let {
    runs,
    selectedRun,
    steps,
    designationId,
    onSelectRun,
    isLoading = false,
  }: {
    runs: WorkflowRun[];
    selectedRun: WorkflowRun | null;
    steps: RunStep[];
    designationId: number;
    onSelectRun: (run: WorkflowRun) => void;
    isLoading?: boolean;
  } = $props();

  // Access control: only Coordinator (5) and IT_User (1)
  let hasAccess = $derived(designationId === 1 || designationId === 5);

  // Track which steps have expanded JSON panels
  let expandedSteps = $state<Set<number>>(new Set());

  function toggleStepExpand(stepIndex: number) {
    const next = new Set(expandedSteps);
    if (next.has(stepIndex)) {
      next.delete(stepIndex);
    } else {
      next.add(stepIndex);
    }
    expandedSteps = next;
  }

  function truncate(text: string | null, maxChars: number): string {
    if (!text) return "";
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n... [truncated]";
  }

  function formatDuration(ms: number | null): string {
    if (ms === null || ms === undefined) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  }

  function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "Just now";
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "completed": return "text-emerald-400";
      case "failed": return "text-red-400";
      case "running": return "text-[#D4AF37]";
      case "suspended": return "text-amber-400";
      default: return "text-white/40";
    }
  }

  function getStatusBg(status: string): string {
    switch (status) {
      case "completed": return "bg-emerald-500/10 border-emerald-500/20";
      case "failed": return "bg-red-500/10 border-red-500/20";
      case "running": return "bg-[#D4AF37]/10 border-[#D4AF37]/20";
      case "suspended": return "bg-amber-400/10 border-amber-400/20";
      default: return "bg-white/5 border-white/10";
    }
  }

  function formatPayload(payload: string | null): string {
    if (!payload) return "null";
    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return payload;
    }
  }
</script>

{#if !hasAccess}
  <!-- Access Denied -->
  <div class="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
    <div class="size-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
      <ShieldAlertIcon class="size-7 text-red-400" />
    </div>
    <p class="text-[11px] font-bold text-red-400 uppercase tracking-widest mb-2">Access Denied</p>
    <p class="text-[10px] text-white/40 leading-relaxed max-w-[220px]">
      Run History is restricted to Coordinators and IT administrators.
    </p>
  </div>
{:else if isLoading}
  <!-- Loading State -->
  <div class="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
    <LoaderCircleIcon class="size-6 text-[#D4AF37] animate-spin mb-3" />
    <p class="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Loading runs...</p>
  </div>
{:else if runs.length === 0}
  <!-- Empty State -->
  <div class="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
    <div class="size-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
      <InboxIcon class="size-7 text-white/20" />
    </div>
    <p class="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-2">No Runs Found</p>
    <p class="text-[10px] text-white/30 leading-relaxed max-w-[220px]">
      No workflow runs are available for the current workspace.
    </p>
  </div>
{:else}
  <div class="flex flex-col h-full min-h-0">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-white/5 shrink-0">
      <HistoryIcon class="size-3.5 text-[#D4AF37]" />
      <span class="text-[10px] font-black uppercase tracking-[0.15em] text-white/60">Run History</span>
      <span class="ml-auto text-[9px] font-bold text-white/30">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
    </div>

    <div class="flex flex-1 min-h-0">
      <!-- Run List -->
      <div class="w-[45%] border-r border-white/5 overflow-y-auto">
        {#each runs as run (run.id)}
          <button
            class={cn(
              "w-full text-left px-3 py-2.5 border-b border-white/5 transition-all duration-200 hover:bg-white/5",
              selectedRun?.id === run.id && "bg-white/5 border-l-2 border-l-[#D4AF37]"
            )}
            onclick={() => onSelectRun(run)}
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold text-white/80 truncate flex-1">{run.workflowId}</span>
              <span class={cn("text-[9px] font-bold uppercase tracking-wider", getStatusColor(run.status))}>
                {run.status}
              </span>
            </div>
            <div class="flex items-center gap-2 text-[9px] text-white/30">
              <ClockIcon class="size-2.5" />
              <span>{formatTimestamp(run.startedAt)}</span>
              {#if run.durationMs !== null}
                <span class="ml-auto">{formatDuration(run.durationMs)}</span>
              {/if}
            </div>
            <div class="flex items-center gap-1.5 mt-1.5">
              {#if run.completedSteps > 0}
                <span class="text-[8px] font-bold text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  {run.completedSteps}✓
                </span>
              {/if}
              {#if run.failedSteps > 0}
                <span class="text-[8px] font-bold text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded">
                  {run.failedSteps}✗
                </span>
              {/if}
              <span class="text-[8px] text-white/20 ml-auto">{run.totalSteps} steps</span>
            </div>
          </button>
        {/each}
      </div>

      <!-- Step Detail Panel -->
      <div class="flex-1 overflow-y-auto">
        {#if selectedRun && steps.length > 0}
          <div class="px-3 py-2.5 border-b border-white/5 shrink-0">
            <p class="text-[9px] font-black uppercase tracking-[0.15em] text-white/40 mb-1">Steps</p>
            <p class="text-[10px] font-bold text-white/70">{selectedRun.workflowId} <span class="text-white/30">#{selectedRun.id.slice(-6)}</span></p>
          </div>

          <div class="flex flex-col">
            {#each steps as step (step.stepIndex)}
              {@const isExpanded = expandedSteps.has(step.stepIndex)}
              {@const isFailed = step.status === "failed"}
              <div class={cn(
                "border-b border-white/5",
                isFailed && "bg-red-500/5"
              )}>
                <!-- Step Header -->
                <button
                  class="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors"
                  onclick={() => toggleStepExpand(step.stepIndex)}
                >
                  <!-- Expand Icon -->
                  {#if isExpanded}
                    <ChevronDownIcon class="size-3 text-white/30 shrink-0" />
                  {:else}
                    <ChevronRightIcon class="size-3 text-white/30 shrink-0" />
                  {/if}

                  <!-- Status Icon -->
                  {#if step.status === "completed"}
                    <CircleCheckIcon class="size-3.5 text-emerald-400 shrink-0" />
                  {:else if step.status === "failed"}
                    <CircleXIcon class="size-3.5 text-red-400 shrink-0" />
                  {:else}
                    <LoaderCircleIcon class="size-3.5 text-[#D4AF37] animate-spin shrink-0" />
                  {/if}

                  <!-- Step Info -->
                  <div class="flex-1 min-w-0">
                    <span class="text-[10px] font-bold text-white/80 truncate block">{step.stepName}</span>
                  </div>

                  <!-- Duration -->
                  {#if step.durationMs !== null}
                    <span class="text-[9px] text-white/30 shrink-0">{formatDuration(step.durationMs)}</span>
                  {/if}
                </button>

                <!-- Expanded Step Details -->
                {#if isExpanded}
                  <div class="px-3 pb-3 pl-9 space-y-2">
                    <!-- Error (for failed steps) -->
                    {#if isFailed && step.error}
                      <div class="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
                        <p class="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-1">Error</p>
                        <p class="text-[10px] text-red-300/80 font-mono leading-relaxed whitespace-pre-wrap break-all">
                          {step.error}
                        </p>
                        {#if step.stackTrace}
                          <details class="mt-2">
                            <summary class="text-[9px] font-bold text-red-400/60 uppercase tracking-wider cursor-pointer hover:text-red-400 transition-colors">
                              Stack Trace
                            </summary>
                            <pre class="mt-1.5 text-[9px] text-red-300/60 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{truncate(step.stackTrace, MAX_STACK_TRACE_CHARS)}</pre>
                          </details>
                        {/if}
                      </div>
                    {/if}

                    <!-- Input Payload -->
                    <Collapsible.Root>
                      <Collapsible.Trigger class="flex items-center gap-1.5 text-[9px] font-bold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors cursor-pointer">
                        <ChevronRightIcon class="size-2.5 transition-transform [[data-state=open]_&]:rotate-90" />
                        Input
                      </Collapsible.Trigger>
                      <Collapsible.Content>
                        <pre class="mt-1.5 p-2.5 rounded-lg bg-slate-950/60 border border-white/5 text-[9px] text-white/60 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{truncate(formatPayload(step.inputPayload), MAX_PAYLOAD_CHARS)}</pre>
                      </Collapsible.Content>
                    </Collapsible.Root>

                    <!-- Output Payload -->
                    <Collapsible.Root>
                      <Collapsible.Trigger class="flex items-center gap-1.5 text-[9px] font-bold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors cursor-pointer">
                        <ChevronRightIcon class="size-2.5 transition-transform [[data-state=open]_&]:rotate-90" />
                        Output
                      </Collapsible.Trigger>
                      <Collapsible.Content>
                        <pre class="mt-1.5 p-2.5 rounded-lg bg-slate-950/60 border border-white/5 text-[9px] text-white/60 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{truncate(formatPayload(step.outputPayload), MAX_PAYLOAD_CHARS)}</pre>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else if selectedRun && steps.length === 0}
          <div class="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <p class="text-[10px] text-white/30 font-semibold">No step data available for this run.</p>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <p class="text-[10px] text-white/30 font-semibold">Select a run to view step details.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
