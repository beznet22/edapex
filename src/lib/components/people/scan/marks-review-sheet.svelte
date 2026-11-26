<script lang="ts">
  import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
  import MarksCellEditor from "./marks-cell-editor.svelte";
  import ScanStatusBadge from "./scan-status-badge.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import { Spinner } from "$lib/components/ui/spinner";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ImageIcon from "@lucide/svelte/icons/image";
  import { EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";
  import type { Marksheet } from "$lib/schema/marksheet";
  import type { ScanUiStatus } from "$lib/server/people/people-types";

  /**
   * Review grid (spec §5, plan Gate 1.4).
   *
   * - Fullscreen sheet on mobile, wide slide-over on desktop (`ResponsiveSheet` owns that split).
   * - Graded categories: the marks table scrolls **horizontally inside itself** with a sticky
   *   subject-code column — the one documented exception to the no-horizontal-scroll rule. Codes
   *   only, never full names, which would push the marks off screen.
   * - DAYCARE has no numeric columns; its results live in `sm_result_stores.teacher_remarks` as one
   *   narrative per subject (verified against live data), so it renders a textarea per subject.
   * - The captured page is not shown inline. A header toggle reveals it, because the grid is the
   *   working surface and the image is only needed when a cell looks doubtful.
   * - No "Adjust crop": without a warp pipeline there is nothing to re-crop; `Re-scan` covers it.
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
    loading = false,
    readOnly = false,
    onsave,
    onrescan,
    onclose,
  }: {
    open: boolean;
    marksheet: Marksheet | null;
    status?: ScanUiStatus;
    imageUrl?: string | null;
    warnings?: string[];
    errors?: string[];
    paperName?: string | null;
    busy?: boolean;
    /** Extraction is still running; show a skeleton rather than an empty grid. */
    loading?: boolean;
    /** Published results are read-only until `Edit & Re-publish` unlocks them. */
    readOnly?: boolean;
    onsave: (marksheet: Marksheet) => void;
    onrescan: () => void;
    /** Back: the draft is kept and the teacher returns to the camera. */
    onclose?: () => void;
  } = $props();

  let draft = $state<Marksheet | null>(null);
  let edited = $state<Set<string>>(new Set());
  let outcomeIssues = $state<Set<number>>(new Set());
  let showImage = $state(false);

  $effect(() => {
    if (marksheet) {
      draft = $state.snapshot(marksheet) as Marksheet;
      edited = new Set();
      outcomeIssues = new Set();
      showImage = false;
    }
  });

  const category = $derived(draft?.student.category ?? "LOWERBASIC");
  const isDaycare = $derived(category === "DAYCARE");
  const maxima = $derived(EXAM_MARK_MAXIMUMS[category] ?? {});
  const titles = $derived(draft?.records[0]?.titles ?? []);

  const cellIssues = $derived.by(() => {
    const issues = new Set<string>();
    if (isDaycare) return issues;
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

  const outcomesComplete = $derived(
    (draft?.records ?? []).every((record) => (record.learningOutcome ?? "").trim() !== "")
  );

  /**
   * `committed` means the marksheet is already saved and this is a correction, so the button says
   * "Update marks" rather than "Verify & Continue" — the latter would imply nothing is stored yet.
   */
  const isUpdate = $derived(status === "committed");
  const primaryLabel = $derived(
    busy ? "Saving…" : readOnly ? "Published" : isUpdate ? "Update marks" : "Verify & Continue"
  );

  const canSave = $derived(
    draft !== null &&
      !busy &&
      !readOnly &&
      (isDaycare
        ? draft.records.length > 0 && outcomesComplete && outcomeIssues.size === 0
        : cellIssues.size === 0 &&
          draft.records.length > 0 &&
          draft.records.every((record) => record.subjectId > 0))
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

  function updateOutcome(rowIndex: number, value: string): void {
    if (!draft) return;
    const record = draft.records[rowIndex];
    if (!record) return;
    const trimmed = value.trim();
    record.learningOutcome = trimmed === "" ? null : value;
    const issues = new Set(outcomeIssues);
    if (trimmed === "" || /<[^>]+>/.test(trimmed)) issues.add(rowIndex);
    else issues.delete(rowIndex);
    outcomeIssues = issues;
    draft = draft;
  }

  function closeAndReturn(): void {
    open = false;
    onclose?.();
  }

  const stickyCode =
    "sticky left-0 z-20 bg-background px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-foreground border-r border-border";
</script>

<ResponsiveSheet
  bind:open
  title="Verify marks"
  description={draft
    ? `${draft.student.fullName} · ADM ${draft.student.adminNo}`
    : loading
      ? "Extracting…"
      : "No draft available"}
  contentClass="md:max-w-3xl"
  mobilePresentation="right"
>
  {#snippet prefix()}
    <Button
      variant="ghost"
      size="icon"
      aria-label="Back to camera"
      class="size-11 rounded-full sm:size-9"
      onclick={closeAndReturn}
    >
      <ArrowLeft class="size-4" />
    </Button>
  {/snippet}

  {#snippet extra()}
    {#if imageUrl && !loading}
      <Button
        variant={showImage ? "default" : "outline"}
        size="icon"
        aria-label={showImage ? "Hide captured page" : "Show captured page"}
        aria-pressed={showImage}
        class="size-11 rounded-full sm:size-9"
        onclick={() => (showImage = !showImage)}
      >
        <ImageIcon class="size-4" />
      </Button>
    {/if}
  {/snippet}

  {#snippet footer()}
    <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
      {#if !readOnly}
        <Button variant="outline" onclick={onrescan} disabled={busy}>Re-scan</Button>
      {/if}
      <Button onclick={() => draft && onsave(draft)} disabled={!canSave}>
        {primaryLabel}
      </Button>
    </div>
  {/snippet}

  <div class="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
    {#if loading}
      <div class="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
        <Spinner class="size-5" />
        Reading the page…
      </div>
    {:else if !draft}
      <div class="px-1 py-10 text-center text-sm text-muted-foreground">
        No draft marks to review for this student.
      </div>
    {:else}
      <div class="flex flex-wrap items-center gap-2">
        <ScanStatusBadge {status} />
        <Badge variant="secondary">{category}</Badge>
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

      {#if showImage && imageUrl}
        <img
          src={imageUrl}
          alt="Captured log book page"
          class="max-h-72 w-full rounded-xl border border-border object-contain"
        />
      {/if}

      {#if isDaycare}
        <p class="text-xs text-muted-foreground">
          DAYCARE records a learning outcome per subject, not marks. Each one is required.
        </p>
        <div class="flex flex-col gap-3">
          {#each draft.records as record, rowIndex (record.subjectId || record.subjectCode)}
            <div class="grid gap-1.5">
              <Label for={`outcome-${rowIndex}`}>{record.subjectCode}</Label>
              <Textarea
                id={`outcome-${rowIndex}`}
                rows={3}
                value={record.learningOutcome ?? ""}
                aria-invalid={outcomeIssues.has(rowIndex)}
                disabled={readOnly}
                class={outcomeIssues.has(rowIndex) ? "border-destructive" : ""}
                oninput={(event) => updateOutcome(rowIndex, event.currentTarget.value)}
              />
            </div>
          {/each}
        </div>
      {:else}
        <!-- Negate the body's `px-4` so the sticky column lands on the scrollport edge; the
             padding is re-applied inside the cells below. -->
        <div class="-mx-4 overflow-x-auto overscroll-x-contain">
          <table class="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th class="{stickyCode} border-b border-border pl-4">Code</th>
                {#each titles as title (title)}
                  <th
                    class="border-b border-border px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground"
                  >
                    {title}
                    <span class="block text-[10px] font-normal normal-case">
                      ({maxima[title.toUpperCase()] ?? "—"})
                    </span>
                  </th>
                {/each}
                <th
                  class="border-b border-border px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {#each draft.records as record, rowIndex (record.subjectId || record.subjectCode)}
                <tr>
                  <td class="{stickyCode} border-b border-border/60 whitespace-nowrap pl-4">
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
                        disabled={readOnly}
                        onchange={(value) => updateMark(rowIndex, columnIndex, value)}
                      />
                    </td>
                  {/each}
                  <td
                    class="border-b border-border/60 px-2 py-1 text-center text-sm font-bold tabular-nums text-foreground"
                  >
                    {record.marks.reduce((sum, mark) => sum + mark, 0)}
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td class="{stickyCode} pl-4 font-bold">All</td>
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
      {/if}

      <div class="grid gap-1.5">
        <Label for="scan-remark">Teacher remark</Label>
        <Textarea
          id="scan-remark"
          rows={2}
          disabled={readOnly}
          value={draft.remark?.remark ?? ""}
          oninput={(event) => {
            if (!draft) return;
            draft.remark = { remark: event.currentTarget.value || null };
            draft = draft;
          }}
        />
      </div>
    {/if}
  </div>
</ResponsiveSheet>
