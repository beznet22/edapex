<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import type { WorkflowPhase } from "$lib/context/workflow-events.svelte";
  import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CirclePauseIcon from "@lucide/svelte/icons/circle-pause";

  let {
    workflowStatus,
    error
  }: {
    workflowStatus: WorkflowPhase;
    error?: string | null;
  } = $props();

  const phaseConfig: Record<WorkflowPhase, { label: string; color: string; bgColor: string; icon: typeof CircleDotIcon }> = {
    'idle': {
      label: 'Idle',
      color: 'text-white/40',
      bgColor: 'bg-white/5 border-white/10',
      icon: CircleDotIcon,
    },
    'extracting': {
      label: 'Extracting',
      color: 'text-[#D4AF37]',
      bgColor: 'bg-[#D4AF37]/10 border-[#D4AF37]/20',
      icon: LoaderCircleIcon,
    },
    'awaiting-validation': {
      label: 'Awaiting Validation',
      color: 'text-amber-400',
      bgColor: 'bg-amber-400/10 border-amber-400/20',
      icon: CirclePauseIcon,
    },
    'validating': {
      label: 'Validating',
      color: 'text-[#D4AF37]',
      bgColor: 'bg-[#D4AF37]/10 border-[#D4AF37]/20',
      icon: LoaderCircleIcon,
    },
    'awaiting-publish': {
      label: 'Awaiting Publish',
      color: 'text-amber-400',
      bgColor: 'bg-amber-400/10 border-amber-400/20',
      icon: CirclePauseIcon,
    },
    'publishing': {
      label: 'Publishing',
      color: 'text-[#D4AF37]',
      bgColor: 'bg-[#D4AF37]/10 border-[#D4AF37]/20',
      icon: LoaderCircleIcon,
    },
    'complete': {
      label: 'Complete',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      icon: CircleCheckIcon,
    },
    'error': {
      label: 'Error',
      color: 'text-red-400',
      bgColor: 'bg-red-400/10 border-red-400/20',
      icon: CircleAlertIcon,
    },
  };

  let config = $derived(phaseConfig[workflowStatus]);
  let isActive = $derived(workflowStatus === 'extracting' || workflowStatus === 'validating' || workflowStatus === 'publishing');
  let actionPrompt = $derived(
    workflowStatus === 'awaiting-validation'
      ? '/validate'
      : workflowStatus === 'awaiting-publish'
        ? '/publish'
        : null
  );
</script>

<div class="flex flex-col gap-1.5">
  <!-- Phase Badge -->
  <div
    class={cn(
      "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all",
      config.bgColor,
      config.color
    )}
  >
    <config.icon
      class={cn(
        "size-3.5 shrink-0",
        isActive && "animate-spin"
      )}
    />
    <span>{config.label}</span>
    {#if isActive}
      <div class="size-1.5 rounded-full bg-current activity-badge--pulse"></div>
    {/if}
  </div>

  <!-- Action Prompt (for awaiting states) -->
  {#if actionPrompt}
    <p class="text-[9px] font-medium text-white/50 pl-1 tracking-wide">
      Type <code class="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-amber-400 font-mono font-bold">{actionPrompt}</code> to proceed
    </p>
  {/if}

  <!-- Error Message -->
  {#if workflowStatus === 'error' && error}
    <p class="text-[9px] font-medium text-red-400/80 pl-1 leading-relaxed max-w-[240px] truncate" title={error}>
      {error}
    </p>
  {/if}
</div>
