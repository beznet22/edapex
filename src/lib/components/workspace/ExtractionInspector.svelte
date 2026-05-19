<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import * as ScrollArea from "$lib/components/ui/scroll-area";
  import CirclePauseIcon from "@lucide/svelte/icons/circle-pause";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleXIcon from "@lucide/svelte/icons/circle-x";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";

  /**
   * ExtractionInspector — Tabular preview of OCR extraction results from Mastra workflow state.
   *
   * Sources data exclusively from workflow state (not DB).
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
   */

  export interface StudentExtraction {
    name: string;
    fields: Record<string, string>;
    confidence: 'high' | 'medium' | 'low';
  }

  export interface ValidationResult {
    studentName: string;
    passed: boolean;
    failures: Array<{ field: string; reason: string }>;
  }

  type InspectorStatus = 'extracting' | 'awaiting-validation' | 'validated';

  let {
    students,
    runId,
    status,
    validationResults,
  }: {
    students: StudentExtraction[];
    runId: string;
    status: InspectorStatus;
    validationResults?: ValidationResult[];
  } = $props();

  // Derive all unique field keys across students for table columns
  let fieldKeys = $derived(
    students.length > 0
      ? [...new Set(students.flatMap((s) => Object.keys(s.fields)))]
      : []
  );

  // Map validation results by student name for quick lookup
  let validationMap = $derived(
    validationResults
      ? new Map(validationResults.map((v) => [v.studentName, v]))
      : new Map<string, ValidationResult>()
  );

  // Check if we have no usable student data
  let hasNoData = $derived(students.length === 0);

  // Confidence color mapping
  const confidenceConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    high: {
      label: 'High',
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10 border-emerald-400/20',
    },
    medium: {
      label: 'Med',
      color: 'text-amber-400',
      bgColor: 'bg-amber-400/10 border-amber-400/20',
    },
    low: {
      label: 'Low',
      color: 'text-red-400',
      bgColor: 'bg-red-400/10 border-red-400/20',
    },
  };

  function getValidationStatus(studentName: string): ValidationResult | undefined {
    return validationMap.get(studentName);
  }

  function getFieldFailure(studentName: string, field: string): string | undefined {
    const result = validationMap.get(studentName);
    if (!result) return undefined;
    const failure = result.failures.find((f) => f.field === field);
    return failure?.reason;
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-950/30">
    <div class="flex items-center gap-2.5">
      <h2 class="text-[11px] font-black uppercase tracking-[0.15em] text-white/70">
        Extraction Inspector
      </h2>
      {#if status === 'extracting'}
        <div class={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-widest",
          "bg-[#D4AF37]/10 border-[#D4AF37]/20 text-[#D4AF37]"
        )}>
          <LoaderCircleIcon class="size-3 animate-spin" />
          <span>Extracting</span>
        </div>
      {:else if status === 'awaiting-validation'}
        <div class={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-widest",
          "bg-amber-400/10 border-amber-400/20 text-amber-400"
        )}>
          <CirclePauseIcon class="size-3" />
          <span>Awaiting Validation</span>
        </div>
      {:else if status === 'validated'}
        <div class={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-widest",
          "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
        )}>
          <CircleCheckIcon class="size-3" />
          <span>Validated</span>
        </div>
      {/if}
    </div>

    {#if runId}
      <span class="text-[9px] font-mono text-white/30 tracking-wide">
        {runId}
      </span>
    {/if}
  </div>

  <!-- Action Prompt for awaiting-validation -->
  {#if status === 'awaiting-validation'}
    <div class="px-4 py-2 border-b border-white/5 bg-amber-400/5">
      <p class="text-[10px] font-medium text-white/50 tracking-wide">
        Type <code class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-400 font-mono font-bold">/validate</code> to approve or reject extracted data
      </p>
    </div>
  {/if}

  <!-- Content -->
  {#if hasNoData}
    <!-- Error state: no student data -->
    <div class="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
      <div class="size-16 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
        <TriangleAlertIcon class="size-7 text-red-400" />
      </div>
      <div class="space-y-1.5">
        <p class="text-[12px] font-bold text-white/70">No Usable Results</p>
        <p class="text-[10px] text-white/40 leading-relaxed max-w-[260px]">
          The extraction produced no student data. Please re-run the extraction workflow.
        </p>
      </div>
    </div>
  {:else}
    <!-- Tabular preview -->
    <ScrollArea.Root class="flex-1 min-h-0">
      <div class="p-3">
        <div class="rounded-lg border border-white/5 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-white/5 bg-slate-950/40">
                  <th class="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/40 whitespace-nowrap">
                    Student
                  </th>
                  {#each fieldKeys as field}
                    <th class="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/40 whitespace-nowrap">
                      {field}
                    </th>
                  {/each}
                  <th class="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/40 whitespace-nowrap">
                    Confidence
                  </th>
                  {#if status === 'validated'}
                    <th class="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/40 whitespace-nowrap">
                      Result
                    </th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#each students as student, i}
                  {@const validation = getValidationStatus(student.name)}
                  {@const conf = confidenceConfig[student.confidence]}
                  <tr class={cn(
                    "border-b border-white/5 transition-colors",
                    validation && !validation.passed
                      ? "bg-red-400/5"
                      : validation?.passed
                        ? "bg-emerald-500/5"
                        : "hover:bg-white/[0.02]"
                  )}>
                    <!-- Student Name -->
                    <td class="px-3 py-2.5">
                      <span class="text-[11px] font-bold text-white/80">{student.name}</span>
                    </td>

                    <!-- Field Values -->
                    {#each fieldKeys as field}
                      {@const failureReason = getFieldFailure(student.name, field)}
                      <td class="px-3 py-2.5">
                        <div class="flex flex-col gap-0.5">
                          <span class={cn(
                            "text-[10px] font-medium",
                            failureReason ? "text-red-400" : "text-white/60"
                          )}>
                            {student.fields[field] ?? '—'}
                          </span>
                          {#if failureReason}
                            <span class="text-[8px] font-medium text-red-400/70 leading-tight">
                              {failureReason}
                            </span>
                          {/if}
                        </div>
                      </td>
                    {/each}

                    <!-- Confidence Indicator -->
                    <td class="px-3 py-2.5">
                      <span class={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-widest",
                        conf.bgColor,
                        conf.color
                      )}>
                        {conf.label}
                      </span>
                    </td>

                    <!-- Validation Result (only when validated) -->
                    {#if status === 'validated'}
                      <td class="px-3 py-2.5">
                        {#if validation}
                          {#if validation.passed}
                            <span class="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                              <CircleCheckIcon class="size-3" />
                              Pass
                            </span>
                          {:else}
                            <span class="inline-flex items-center gap-1 text-[9px] font-bold text-red-400">
                              <CircleXIcon class="size-3" />
                              Fail
                            </span>
                          {/if}
                        {:else}
                          <span class="text-[9px] text-white/30">—</span>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Summary footer when validated -->
        {#if status === 'validated' && validationResults}
          {@const passCount = validationResults.filter((v) => v.passed).length}
          {@const failCount = validationResults.filter((v) => !v.passed).length}
          <div class="mt-3 flex items-center gap-4 px-1">
            <span class="text-[9px] font-bold text-emerald-400/80">
              {passCount} passed
            </span>
            {#if failCount > 0}
              <span class="text-[9px] font-bold text-red-400/80">
                {failCount} failed
              </span>
            {/if}
            <span class="text-[9px] text-white/30 ml-auto">
              {students.length} students total
            </span>
          </div>
        {/if}
      </div>
    </ScrollArea.Root>
  {/if}
</div>
