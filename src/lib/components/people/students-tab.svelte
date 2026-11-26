<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import PeopleTable from "./people-table.svelte";
  import PeoplePager from "./people-pager.svelte";
  import PeopleEmptyState from "./people-empty-state.svelte";
  import PeopleSelect from "./people-select.svelte";
  import PersonCell from "./person-cell.svelte";
  import StatusPill from "./status-pill.svelte";
  import StudentClassPicker from "./student-class-picker.svelte";
  import StudentDetailDialog from "./student-detail-dialog.svelte";
  import ScanStatusBadge from "./scan/scan-status-badge.svelte";
  import ScanRowActions from "./scan/scan-row-actions.svelte";
  import type { PageSize } from "$lib/people/people-url";
  import type { ClassOption, StudentRosterRow } from "$lib/server/people/people-types";

  let {
    classes,
    selected,
    rows,
    total,
    sort,
    dir,
    page,
    pageSize,
    examTypes,
    selectedExamTypeId,
    scanCounts,
    onclass,
    onsort,
    onpage,
    onpagesize,
    onexam,
    oncapture,
    onreview,
    onpublishall,
  }: {
    classes: ClassOption[];
    selected: ClassOption | null;
    rows: StudentRosterRow[];
    total: number;
    sort: string;
    dir: "asc" | "desc";
    page: number;
    pageSize: number;
    examTypes: { id: number; title: string | null }[];
    selectedExamTypeId: number | null;
    scanCounts?: {
      pending: number;
      drafts: number;
      committed: number;
      published: number;
      failed: number;
    } | null;
    onclass: (option: ClassOption) => void;
    onsort: (key: string) => void;
    onpage: (page: number) => void;
    onpagesize: (size: PageSize) => void;
    onexam: (examTypeId: number) => void;
    oncapture: (row: StudentRosterRow) => void;
    onreview: (row: StudentRosterRow) => void;
    onpublishall: () => void;
  } = $props();

  const columns = [
    { key: "name", label: "Student", sortable: true },
    { key: "admission", label: "Admission no" },
    { key: "class", label: "Class" },
    { key: "marks", label: "Marks" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Actions", align: "right" as const },
  ];

  let detailOpen = $state(false);
  let detailStudentId = $state<number | null>(null);

  const uploadable = $derived(
    rows.filter((row) => (row.scanStatus ?? "not_uploaded") === "not_uploaded").length
  );
  const committedCount = $derived(scanCounts?.committed ?? 0);
  const draftCount = $derived(scanCounts?.drafts ?? 0);

  const examOptions = $derived(
    examTypes.map((examType) => ({
      value: String(examType.id),
      label: examType.title ?? `Term ${examType.id}`,
    }))
  );

  function classLabel(row: StudentRosterRow): string {
    return `${row.className ?? "Class"} · ${row.sectionName ?? "Section"}`;
  }

  function openDetail(row: StudentRosterRow): void {
    detailStudentId = row.id;
    detailOpen = true;
  }

</script>

{#if classes.length === 0}
  <PeopleEmptyState
    title="No classes available"
    description="No classes are available for the active academic year."
  />
{:else if !selected}
  <PeopleEmptyState
    title="Choose a class"
    description="Select a class and section to view its students."
  >
    {#snippet action()}
      <div class="w-full max-w-sm">
        <StudentClassPicker classes={classes} selected={selected} onselect={onclass} />
      </div>
    {/snippet}
  </PeopleEmptyState>
{:else}
  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <StudentClassPicker classes={classes} selected={selected} onselect={onclass} />
    {#if examOptions.length > 0 && selectedExamTypeId !== null}
      <div class="w-full sm:w-64">
        <PeopleSelect
          value={String(selectedExamTypeId)}
          options={examOptions}
          placeholder="Select term"
          ariaLabel="Term"
          onchange={(value) => onexam(Number(value))}
        />
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <Button
      size="sm"
      disabled={uploadable === 0}
      onclick={() => {
        const next = rows.find((row) => (row.scanStatus ?? "not_uploaded") === "not_uploaded");
        if (next) oncapture(next);
      }}
    >
      Batch Scan Ungraded ({uploadable})
    </Button>
    <Button variant="outline" size="sm" disabled={committedCount === 0} onclick={onpublishall}>
      Publish All Uploaded ({committedCount}/{rows.length})
    </Button>
    {#if draftCount > 0}
      <span class="text-xs font-medium text-muted-foreground">
        {draftCount} draft{draftCount === 1 ? "" : "s"} awaiting review
      </span>
    {/if}
  </div>

  <PeopleTable columns={columns} rows={rows} {sort} {dir} onsort={onsort}>
    {#snippet row(entry: StudentRosterRow)}
      <td class="px-3 py-3">
        <PersonCell name={entry.fullName} photo={entry.studentPhoto} colorful />
      </td>
      <td class="px-3 py-3 text-sm tabular-nums text-muted-foreground">
        {entry.admissionNo ?? "—"}
      </td>
      <td class="px-3 py-3 text-sm text-muted-foreground">{classLabel(entry)}</td>
      <td class="px-3 py-3">
        <ScanStatusBadge
          status={entry.scanStatus ?? "not_uploaded"}
          failureMessage={entry.scanFailureMessage ?? null}
        />
      </td>
      <td class="px-3 py-3">
        <StatusPill
          label={entry.active ? "Active" : "Inactive"}
          tone={entry.active ? "active" : "muted"}
        />
      </td>
      <td class="px-3 py-3 text-right">
        {#if selectedExamTypeId === null}
          <span class="text-xs text-muted-foreground">Pick a term</span>
        {:else}
          <ScanRowActions
            status={entry.scanStatus ?? "not_uploaded"}
            studentName={entry.fullName ?? "student"}
            failureMessage={entry.scanFailureMessage ?? null}
            onCapture={() => oncapture(entry)}
            onReview={() => onreview(entry)}
            onRetry={() => oncapture(entry)}
            onViewMark={() => onreview(entry)}
            onViewResult={() => onreview(entry)}
            onPublish={() => onpublishall()}
            onRepublish={() => onreview(entry)}
            onViewError={() => onreview(entry)}
          />
        {/if}
      </td>
    {/snippet}
    {#snippet card(entry: StudentRosterRow)}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="flex items-start justify-between gap-3">
          <PersonCell
            name={entry.fullName}
            photo={entry.studentPhoto}
            colorful
            secondary={classLabel(entry)}
            tertiary={entry.admissionNo ? `ADM ${entry.admissionNo}` : "No admission number"}
          />
          <StatusPill
            label={entry.active ? "Active" : "Inactive"}
            tone={entry.active ? "active" : "muted"}
          />
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          {#if selectedExamTypeId === null}
            <span class="text-xs text-muted-foreground">Pick a term to scan marks</span>
            <Button variant="ghost" size="icon" class="size-11 rounded-full sm:size-9"
              aria-label={`Actions for ${entry.fullName ?? "student"}`}
              onclick={() => openDetail(entry)}>
              <EllipsisVertical class="size-4" />
            </Button>
          {:else}
            <ScanRowActions
              status={entry.scanStatus ?? "not_uploaded"}
              studentName={entry.fullName ?? "student"}
              failureMessage={entry.scanFailureMessage ?? null}
              onCapture={() => oncapture(entry)}
              onReview={() => onreview(entry)}
              onRetry={() => oncapture(entry)}
              onViewMark={() => onreview(entry)}
              onViewResult={() => onreview(entry)}
              onPublish={() => onpublishall()}
              onRepublish={() => onreview(entry)}
              onViewError={() => onreview(entry)}
              onEdit={() => openDetail(entry)}
            />
          {/if}

        </div>
      </div>
    {/snippet}
  </PeopleTable>

  <PeoplePager page={page} pageSize={pageSize} total={total} onpage={onpage} onpagesize={onpagesize} />
{/if}

<StudentDetailDialog
  bind:open={detailOpen}
  studentId={detailStudentId}
  onupdated={() => void invalidateAll()}
/>
