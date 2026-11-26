<script lang="ts">
  import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
  import MarksCellEditor from "./marks-cell-editor.svelte";
  import ScanStatusBadge from "./scan-status-badge.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import { EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";
  import type { Marksheet } from "$lib/schema/marksheet";
  import type { ScanUiStatus } from "$lib/server/people/people-types";

  /**
   * Gate 1.4 review grid.
   *
   * - Fullscreen on mobile, wide slide-over on desktop (`ResponsiveSheet` owns that split).
   * - The marks table scrolls **horizontally inside itself** with a sticky subject-code column.
   *   That is the single documented exception to the no-horizontal-scroll rule; the sheet body
   *   itself never scrolls sideways.
   * - Subject **codes** only in the sticky column, never full names — names are too wide and push
   *   the marks off screen.
   * - The capture renders beside the grid so a misread is visible against the page.
   * - No "Adjust crop": with no warp pipeline there is nothing to re-crop, so `Re-scan` covers it.
   */
  let {
    open = $bindable(false),
    marksheet,
    status = "draft",
    imageUrl = null,
    warnings = [],
    errors = [],
    paperName = null,
    busy = false,
    onsave,
    onrescan,
  }: {
    open: boolean;
    marksheet: Marksheet | null;
    status?: ScanUiStatus;
    imageUrl?: string | null;
    warnings?: string[];
    errors?: string[];
    paperName?: string | null;
    busy?: boolean;
    onsave: (marksheet: Marksheet) => void;
    onrescan: () => void;
  } = $props();

  let draft = $state<Marksheet | null>(null);
  let edited = $state<Set<string>>(new Set());

  $effect(() => {
    if (marksheet) {
      draft = $state.snapshot(marksheet) as Marksheet;
      edited = new Set();
    }
  });

  const category = $derived(draft?.student.category ?? "LOWERBASIC");
  const maxima = $derived(EXAM_MARK_MAXIMUMS[category] ?? {});
  const titles = $derived(draft?.records[0]?.titles ?? []);

  const cellIssues = $derived.by(() => {
    const issues = new Set<string>();
    for (const [rowIndex, record] of (draft?.records ?? []).entries()) {
      record.titles.forEach((title, columnIndex) => {
        const value = record.marks[columnIndex] ?? 0;
        const max = maxima[title.toUpperCase()];
        if (max !== undefined && value > max) issues.add(`${rowIndex}:${columnIndex}`);
      });
    }
    return issues;
  });

  const totals = $derived.by(() => {
    const records = draft?.records ?? [];
    const scored = records.map((record) => ({
      total: record.marks.reduce((sum, mark) => sum + mark, 0),
      full: record.fullMarks.reduce((sum, mark) => sum + mark, 0),
    }));
    const total = scored.reduce((sum, entry) => sum + entry.total, 0);
    const full = scored.reduce((sum, entry) => sum + entry.full, 0);
    return { total, full, percentage: full === 0 ? 0 : Math.round((total / full) * 1000) / 10 };
  });

  const canSave = $derived(
    draft !== null &&
      cellIssues.size === 0 &&
      draft.records.length > 0 &&
      draft.records.every((record) => record.subjectId > 0) &&
      !busy
  );

  function updateMark(rowIndex: number, columnIndex: number, value: number): void {
    if (!draft) return;
    const record = draft.records[rowIndex];
    if (!record) return;
    const next = [...record.marks];
    next[columnIndex] = value;
    record.marks = next;
    record.totalScore = next.reduce((sum, mark) => sum + mark, 0);
    edited = new Set([...edited, `${rowIndex}:${columnIndex}`]);
    draft = draft;
  }

  const stickyCode =
    "sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-foreground";
</script>

<ResponsiveSheet
  bind:open
  title="Review marks"
  description={draft
    ? `${draft.student.fullName} · ADM ${draft.student.adminNo}`
    : "No draft available"}
  contentClass="md:max-w-3xl"
>
  {#if !draft}
    <div class="px-4 py-10 text-center text-sm text-muted-foreground">
      No draft marks to review for this student.
    </div>
  {:else}
    <div class="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
      <div class="flex flex-wrap items-center gap-2">
        <ScanStatusBadge {status} />
        <span class="text-xs text-muted-foreground">
          {draft.student.className} · {draft.student.sectionName} · {draft.student.term}
        </span>
      </div>

      {#if paperName && paperName.toUpperCase() !== draft.student.fullName.toUpperCase()}
        <Alert>
          <AlertDescription>
            The page reads “{paperName}” but this row is “{draft.student.fullName}”. Saving files
            the marks under the name above.
          </AlertDescription>
        </Alert>
      {/if}

      {#each errors as error (error)}
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      {/each}

      {#if warnings.length > 0}
        <Alert>
          <AlertDescription>
            <ul class="list-disc pl-4">
              {#each warnings as warning (warning)}
                <li>{warning}</li>
              {/each}
            </ul>
          </AlertDescription>
        </Alert>
      {/if}

      {#if imageUrl}
        <img
          src={imageUrl}
          alt="Captured log book page"
          class="max-h-64 w-full rounded-xl border border-border object-contain"
        />
      {/if}

      <div class="-mx-4 overflow-x-auto px-4">
        <table class="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th class="{stickyCode} border-b border-border">Code</th>
              {#each titles as title (title)}
                <th class="border-b border-border px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">
                  {title}
                  <span class="block text-[10px] font-normal normal-case">
                    ({maxima[title.toUpperCase()] ?? "—"})
                  </span>
                </th>
              {/each}
              <th class="border-b border-border px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {#each draft.records as record, rowIndex (record.subjectId || record.subjectCode)}
              <tr>
                <td class="{stickyCode} border-b border-border/60 whitespace-nowrap">
                  {record.subjectCode}
                  {#if record.subjectId === 0}
                    <span class="ml-1 text-[10px] font-normal text-destructive">unmatched</span>
                  {/if}
                </td>
                {#each titles as title, columnIndex (title)}
                  <td class="border-b border-border/60 px-1 py-1 text-center">
                    <MarksCellEditor
                      value={record.marks[columnIndex] ?? 0}
                      max={maxima[title.toUpperCase()] ?? 100}
                      label="{record.subjectCode} {title}"
                      edited={edited.has(`${rowIndex}:${columnIndex}`)}
                      flagged={cellIssues.has(`${rowIndex}:${columnIndex}`)}
                      onchange={(value) => updateMark(rowIndex, columnIndex, value)}
                    />
                  </td>
                {/each}
                <td class="border-b border-border/60 px-2 py-1 text-center text-sm font-bold tabular-nums text-foreground">
                  {record.marks.reduce((sum, mark) => sum + mark, 0)}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td class="{stickyCode} font-bold">All</td>
              <td class="px-2 py-2 text-xs text-muted-foreground" colspan={titles.length}>
                {totals.percentage}% of {totals.full}
              </td>
              <td class="px-2 py-2 text-center font-bold tabular-nums text-foreground">
                {totals.total}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="grid gap-1.5">
        <Label for="scan-remark">Teacher remark</Label>
        <Textarea
          id="scan-remark"
          rows={2}
          value={draft.remark?.remark ?? ""}
          oninput={(event) => {
            if (!draft) return;
            draft.remark = { remark: event.currentTarget.value || null };
            draft = draft;
          }}
        />
      </div>

      <div class="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="outline" onclick={onrescan} disabled={busy}>Re-scan</Button>
        <Button onclick={() => draft && onsave(draft)} disabled={!canSave}>
          {busy ? "Saving…" : "Save & Compute"}
        </Button>
      </div>
    </div>
  {/if}
</ResponsiveSheet>
