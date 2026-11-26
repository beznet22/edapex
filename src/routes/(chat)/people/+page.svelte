<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { navigating, page } from "$app/state";
  import { toast } from "svelte-sonner";
  import ChatHeader from "$lib/components/chat-header.svelte";
  import PeopleHeader from "$lib/components/people/people-header.svelte";
  import PeopleTabs from "$lib/components/people/people-tabs.svelte";
  import PeopleFilterMenu from "$lib/components/people/people-filter-menu.svelte";
  import PeopleKpis from "$lib/components/people/people-kpis.svelte";
  import PeopleSkeleton from "$lib/components/people/people-skeleton.svelte";
  import StaffTab from "$lib/components/people/staff-tab.svelte";
  import ParentsTab from "$lib/components/people/parents-tab.svelte";
  import StudentsTab from "$lib/components/people/students-tab.svelte";
  import MarksReviewSheet from "$lib/components/people/scan/marks-review-sheet.svelte";
  import PdfPreviewSheet from "$lib/components/people/scan/pdf-preview-sheet.svelte";
  import ScanOfflineBanner from "$lib/components/people/scan/scan-offline-banner.svelte";
  import { countQueuedCaptures } from "$lib/people/scan/scan-queue";
  import ManageAssignmentsDialog from "$lib/components/people/manage-assignments-dialog.svelte";
  import SelfAssignDialog from "$lib/components/people/self-assign-dialog.svelte";
  import StudentCreateDialog from "$lib/components/people/student-create-dialog.svelte";
  import UnassignedEmptyState from "$lib/components/people/unassigned-empty-state.svelte";
  import { buildPeopleUrl, type PageSize, type PeopleUrlPatch } from "$lib/people/people-url";
  import type { PageData } from "./$types";
  import type {
    ClassOption,
    ParentSort,
    PeopleTab,
    StudentRosterRow,
  } from "$lib/server/people/people-types";

  let { data }: { data: PageData } = $props();

  const tabs: PeopleTab[] = $derived(
    data.canManage ? ["staff", "parents", "students"] : ["students"]
  );
  const filters = $derived(data.filters);
  const staff = $derived(data.tab === "staff" ? data.staff : undefined);
  const parents = $derived(data.tab === "parents" ? data.parents : undefined);
  const students = $derived(data.tab === "students" ? data.students : undefined);
  // `navigating` from `$app/state` is always an object (its fields are null
  // when idle), so never compare it to null. Doing that kept the skeleton
  // shimmering forever instead of revealing the loaded table.
  const isNavigating = $derived(navigating.to !== null);
  // Only shimmer when nothing is rendered yet (first paint / tab change);
  // a background re-fetch keeps the current rows visible.
  const busy = $derived(
    isNavigating && staff === undefined && parents === undefined && students === undefined
  );
  let createStaffOpen = $state(false);
  let manageOpen = $state(false);
  let manageTeacherId = $state<number | null>(null);
  let manageStep = $state<"subjects" | "teacher" | "conflicts" | "settings">("subjects");
  let selfAssignOpen = $state(false);
  let newStudentOpen = $state(false);

  function openManage(
    teacherId: number | null = null,
    step: "subjects" | "teacher" | "conflicts" | "settings" = "subjects"
  ): void {
    manageTeacherId = teacherId;
    manageStep = step;
    manageOpen = true;
  }

  function navigate(patch: PeopleUrlPatch, noScroll = true): void {
    void goto(buildPeopleUrl(page.url, patch), {
      replaceState: true,
      keepFocus: true,
      noScroll,
    });
  }

  function handleSearch(query: string): void {
    navigate({ q: query });
  }

  function handleTab(tab: PeopleTab): void {
    navigate({ tab });
  }

  function handleFilter(patch: PeopleUrlPatch): void {
    navigate(patch);
  }

  function handlePage(next: number): void {
    navigate({ page: next }, false);
  }

  function handlePageSize(size: PageSize): void {
    navigate({ pageSize: size });
  }

  function isParentSort(value: string): value is ParentSort {
    return value === "name" || value === "status" || value === "email";
  }

  function handleSort(key: string): void {
    const dir = filters.sort === key && filters.dir === "asc" ? "desc" : "asc";
    if (filters.tab === "staff" && (key === "name" || key === "role" || key === "status")) {
      navigate({ sort: key, dir });
    } else if (filters.tab === "parents" && isParentSort(key)) {
      navigate({ sort: key, dir });
    } else if (filters.tab === "students" && key === "name") {
      navigate({ sort: "name", dir });
    }
  }

  function handleClassSelect(option: ClassOption): void {
    navigate({ classId: option.classId, sectionId: option.sectionId });
  }

  function handleExamSelect(examTypeId: number): void {
    navigate({ exam: examTypeId });
  }

  function handleCapture(row: StudentRosterRow): void {
    if (selectedExamTypeId === null) return;
    void goto(
      `/people/scan/${row.id}?exam=${selectedExamTypeId}&classId=${row.classId}&sectionId=${row.sectionId}`
    );
  }

  async function handleReview(row: StudentRosterRow): Promise<void> {
    if (selectedExamTypeId === null) return;

    const status = row.scanStatus ?? "not_uploaded";
    // Only rows that actually hold something are reviewable. `not_uploaded` has no draft and no
    // committed result; opening the sheet there produced an empty grid reading "No draft marks".
    if (status === "not_uploaded" || status === "queued" || status === "extracting") {
      toast.info(
        status === "not_uploaded"
          ? `${row.fullName ?? "This student"} has no marks yet — upload a scan first`
          : "Still extracting — try again in a moment"
      );
      return;
    }

    reviewRow = row;
    reviewExamTypeId = selectedExamTypeId;
    reviewMarkSheet = null;
    reviewWarnings = [];
    reviewErrors = [];
    reviewPaperName = null;
    reviewImageUrl = null;
    reviewReadOnly = false;
    reviewLoading = true;
    reviewOpen = true;

    try {
      const response = await fetch(
        `/api/people/marks/draft?student=${row.id}&exam=${selectedExamTypeId}`,
        { headers: { accept: "application/json" } }
      );
      if (!response.ok) {
        reviewErrors = ["Those marks could not be loaded"];
        return;
      }

      const payload = (await response.json()) as {
        status?: string;
        marksheet?: typeof reviewMarkSheet;
        warnings?: string[];
        errors?: string[];
        imageUrl?: string | null;
        readOnly?: boolean;
      };

      reviewMarkSheet = payload.marksheet ?? null;
      reviewWarnings = payload.warnings ?? [];
      reviewErrors = payload.errors ?? [];
      reviewReadOnly = payload.readOnly ?? false;
      reviewImageUrl = payload.imageUrl ?? null;

      // Nothing came back for a row the roster claimed was reviewable — say so instead of
      // presenting an empty grid.
      if (!reviewMarkSheet) {
        reviewOpen = false;
        toast.info("No marks found for this student in this term");
      }
    } finally {
      reviewLoading = false;
    }
  }

  async function handleSaveReview(marksheet: NonNullable<typeof reviewMarkSheet>): Promise<void> {
    if (reviewRow === null || reviewExamTypeId === null) return;
    reviewSaving = true;
    try {
      const response = await fetch("/api/people/marks/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: reviewRow.id,
          examTypeId: reviewExamTypeId,
          marksheet,
        }),
      });
      if (response.ok) {
        reviewOpen = false;
        await invalidateAll();
      } else {
        const failure = (await response.json()) as { error?: string };
        reviewErrors = [failure.error ?? "Could not save these marks"];
      }
    } finally {
      reviewSaving = false;
    }
  }

  async function handlePublishAll(): Promise<void> {
    if (selectedExamTypeId === null) return;
    const studentIds = data.students?.rows
      .filter((row) => row.scanStatus === "committed")
      .map((row) => row.id) ?? [];
    if (studentIds.length === 0) return;

    publishBusy = true;
    try {
      const response = await fetch("/api/people/marks/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentIds, examTypeId: selectedExamTypeId }),
      });
      const result = (await response.json()) as {
        sent?: number;
        failed?: number;
        skipped?: number;
        outcomes?: { studentId: number; status: string; message?: string }[];
      };
      publishSummary = result.outcomes
        ? `${result.sent ?? 0} published · ${result.failed ?? 0} failed · ${result.skipped ?? 0} already sent`
        : null;
      await invalidateAll();
    } finally {
      publishBusy = false;
    }
  }

  let reviewOpen = $state(false);
  let reviewRow = $state<StudentRosterRow | null>(null);
  let reviewExamTypeId = $state<number | null>(null);
  let reviewMarkSheet = $state<import("$lib/schema/marksheet").Marksheet | null>(null);
  let reviewWarnings = $state<string[]>([]);
  let reviewErrors = $state<string[]>([]);
  let reviewPaperName = $state<string | null>(null);
  let reviewImageUrl = $state<string | null>(null);
  let reviewLoading = $state(false);
  let reviewReadOnly = $state(false);
  let reviewSaving = $state(false);
  let pdfOpen = $state(false);
  let pdfStudent = $state<StudentRosterRow | null>(null);
  let pdfUrl = $state<string | null>(null);
  let publishing = $state(false);
  let queuedCount = $state(0);

  function openResult(row: StudentRosterRow): void {
    if (selectedExamTypeId === null) return;
    pdfStudent = row;
    pdfUrl = `/api/people/marks/pdf/${row.id}?exam=${selectedExamTypeId}`;
    pdfOpen = true;
  }

  async function handlePublishOne(): Promise<void> {
    if (selectedExamTypeId === null || pdfStudent === null) return;
    publishing = true;
    try {
      const response = await fetch("/api/people/marks/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentIds: [pdfStudent.id],
          examTypeId: selectedExamTypeId,
        }),
      });
      if (response.ok) {
        pdfOpen = false;
        await invalidateAll();
      }
    } finally {
      publishing = false;
    }
  }

  $effect(() => {
    // Cheap local read; the banner hides itself when the queue is empty.
    void countQueuedCaptures().then((count) => (queuedCount = count));
  });
  let publishBusy = $state(false);
  let publishSummary = $state<string | null>(null);

  const selectedExamTypeId = $derived(data.students?.selectedExamTypeId ?? null);
</script>

<svelte:head>
  <title>People · Edapex</title>
</svelte:head>

<div class="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
  <ChatHeader />

  <div class="safe-area-bottom min-h-0 flex-1 overflow-y-auto bg-background">
    <div class="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <PeopleHeader
        q={filters.q}
        canManage={data.canManage}
        onSearch={handleSearch}
        onAddStaff={() => (createStaffOpen = true)}
        onAddStudent={() => (newStudentOpen = true)}
        onManageAssignments={() => openManage()}
        onSelfSettings={() => openManage(null, "settings")}
        onAddClass={
          data.assignment?.canSelfAssign ? () => (selfAssignOpen = true) : undefined
        }
      />

      {#if data.viewer.noClassAssigned}
        <div class="space-y-3">
          <PeopleTabs {tabs} active={data.tab} onselect={handleTab} />
          <UnassignedEmptyState
            enabled={data.assignment?.enabled ?? false}
            onboarding={filters.onboarding}
            onAddClass={
              data.assignment?.canSelfAssign ? () => (selfAssignOpen = true) : undefined
            }
          />
        </div>
      {:else}
        {#if data.tab === "staff" && staff}
          <PeopleKpis tab="staff" stats={staff.stats} />
        {:else if data.tab === "parents" && parents}
          <PeopleKpis tab="parents" stats={parents.stats} />
        {:else if data.tab === "students" && students?.selected}
          <PeopleKpis tab="students" stats={students.stats} />
        {/if}

        <div class="space-y-3">
          <PeopleTabs {tabs} active={data.tab} onselect={handleTab} />
          <PeopleFilterMenu filters={filters} onChange={handleFilter} />

          {#if busy}
            <PeopleSkeleton />
          {:else if data.tab === "staff" && staff}
            <StaffTab
              rows={staff.rows}
              total={staff.total}
              options={staff.options}
              sort={filters.sort}
              dir={filters.dir}
              page={filters.page}
              pageSize={filters.pageSize}
              onsort={handleSort}
              onpage={handlePage}
              onpagesize={handlePageSize}
              onfilter={handleFilter}
              onmanage={(staffId) => openManage(staffId)}
              bind:createOpen={createStaffOpen}
            />
          {:else if data.tab === "parents" && parents}
            <ParentsTab
              rows={parents.rows}
              total={parents.total}
              yearFallback={parents.yearFallback}
              sort={filters.sort}
              dir={filters.dir}
              page={filters.page}
              pageSize={filters.pageSize}
              onsort={handleSort}
              onpage={handlePage}
              onpagesize={handlePageSize}
            />
          {:else if data.tab === "students" && students}
            <div class="mb-3">
              <ScanOfflineBanner
                pending={queuedCount}
                onDrained={() => {
                  void countQueuedCaptures().then((count) => (queuedCount = count));
                  void invalidateAll();
                }}
              />
            </div>
            <StudentsTab
              classes={students.classes}
              selected={students.selected}
              rows={students.rows}
              total={students.total}
              sort={filters.sort}
              dir={filters.dir}
              page={filters.page}
              pageSize={filters.pageSize}
              examTypes={students.examTypes}
              selectedExamTypeId={students.selectedExamTypeId}
              scanCounts={students.scanCounts}
              onclass={handleClassSelect}
              onsort={handleSort}
              onpage={handlePage}
              onpagesize={handlePageSize}
              onexam={handleExamSelect}
              oncapture={handleCapture}
              onreview={handleReview}
              onviewresult={openResult}
              onpublishall={() => void handlePublishAll()}
            />
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<MarksReviewSheet
  bind:open={reviewOpen}
  marksheet={reviewMarkSheet}
  loading={reviewLoading}
  status={reviewRow?.scanStatus ?? "draft"}
  readOnly={reviewReadOnly}
  imageUrl={reviewImageUrl}
  warnings={reviewWarnings}
  errors={reviewErrors}
  paperName={reviewPaperName}
  busy={reviewSaving}
  onsave={(marksheet) => void handleSaveReview(marksheet)}
  onrescan={() => {
    reviewOpen = false;
    if (reviewRow) handleCapture(reviewRow);
  }}
/>

<PdfPreviewSheet
  bind:open={pdfOpen}
  studentName={pdfStudent?.fullName ?? ""}
  {pdfUrl}
  canPublish={pdfStudent?.scanStatus === "committed"}
  {publishing}
  onpublish={() => void handlePublishOne()}
/>

<ManageAssignmentsDialog
  bind:open={manageOpen}
  presetTeacherId={manageTeacherId}
  initialStep={manageStep}
/>
<SelfAssignDialog
  bind:open={selfAssignOpen}
  classes={data.assignment?.classes ?? []}
  subjects={data.assignment?.subjects ?? []}
/>
<StudentCreateDialog
  bind:open={newStudentOpen}
  oncreated={() => void invalidateAll()}
/>
