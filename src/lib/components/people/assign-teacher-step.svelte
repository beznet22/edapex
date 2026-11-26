<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import type { OfferingRow } from "$lib/server/people/people-types";

  let {
    offerings,
    selected = [],
    isBusy = false,
    onselect,
  }: {
    offerings: OfferingRow[];
    selected?: number[];
    isBusy?: boolean;
    onselect: (offeringIds: number[]) => void;
  } = $props();

  function toggle(id: number): void {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    onselect(next);
  }

  function teacherLabel(offering: OfferingRow): string {
    if (offering.teacherId === null) return "No teacher";
    return offering.teacherName ?? `Teacher ${offering.teacherId}`;
  }

  const replaceCount = $derived(
    offerings.filter(
      (offering) =>
        selected.includes(offering.id) && offering.teacherId !== null
    ).length
  );
</script>

<div class="space-y-3">
  {#if isBusy}
    <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      Loading class subjects…
    </p>
  {:else if offerings.length === 0}
    <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      No class subjects exist for this class yet. Create them in the first step.
    </p>
  {:else}
    <fieldset class="min-w-0">
      <legend class="text-sm font-medium text-foreground">Class subjects</legend>
      <div class="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {#each offerings as offering (offering.id)}
          <div
            class="flex min-h-11 items-center gap-2 rounded-md border border-border px-2 text-sm text-foreground sm:min-h-9 {selected.includes(
              offering.id
            )
              ? 'bg-primary/10 border-primary/30'
              : ''}"
          >
            <Checkbox
              id={`offering-${offering.id}`}
              checked={selected.includes(offering.id)}
              onCheckedChange={() => toggle(offering.id)}
            />
            <Label
              for={`offering-${offering.id}`}
              class="min-w-0 flex-1 truncate text-sm font-normal text-foreground"
            >
              {offering.subjectName ?? `Subject ${offering.subjectId}`}
            </Label>
            <span class="shrink-0 text-xs text-muted-foreground">{teacherLabel(offering)}</span>
          </div>
        {/each}
      </div>
      <p class="mt-2 text-xs text-muted-foreground">
        {selected.length} selected
        {#if replaceCount > 0}
          · {replaceCount} currently {replaceCount === 1 ? "has" : "have"} another teacher
        {/if}
      </p>
    </fieldset>
  {/if}
</div>
