<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    DIALOG_CONTENT_WIDE as PEOPLE_DIALOG_CONTENT,
  } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import ClassSubjectStep from "./class-subject-step.svelte";
  import AssignTeacherStep from "./assign-teacher-step.svelte";
  import ConflictPanel from "./conflict-panel.svelte";
  import AssignmentToggle from "./assignment-toggle.svelte";
  import {
    numberField,
    submitPeopleAction,
  } from "./people-action-response";
  import type {
    ClassOption,
    ConflictGroup,
    OfferingRow,
    StaffDirectoryRow,
    SubjectOption,
  } from "$lib/server/people/people-types";

  type AssignmentConfig = {
    enabled: boolean;
    subjects: SubjectOption[];
    classes: ClassOption[];
    conflicts: ConflictGroup[];
    offeringCount: number;
    teachers: Pick<StaffDirectoryRow, "id" | "fullName" | "firstName" | "lastName">[];
  };

  let {
    open = $bindable(false),
    presetTeacherId = null,
    initialStep = "subjects",
  }: {
    open?: boolean;
    presetTeacherId?: number | null;
    initialStep?: "subjects" | "teacher" | "conflicts" | "settings";
  } = $props();

  let step = $state<"subjects" | "teacher" | "conflicts" | "settings">("subjects");
  let config = $state<AssignmentConfig | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let pending = $state(false);

  let selectedClass = $state<ClassOption | null>(null);
  let selectedSubjects = $state<number[]>([]);

  let offerings = $state<OfferingRow[]>([]);
  let offeringsBusy = $state(false);
  let selectedOfferings = $state<number[]>([]);
  let teacherId = $state<number>(0);
  let replace = $state(false);

  async function loadConfig(): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await fetch("/people/assignments");
      if (!response.ok) {
        error = "Could not load the assignment configuration";
        return;
      }
      config = (await response.json()) as AssignmentConfig;
      if (presetTeacherId && presetTeacherId > 0) {
        teacherId = presetTeacherId;
        step = "teacher";
        const first = config.classes[0];
        if (first) await selectClass(first);
      }
    } catch {
      error = "Could not load the assignment configuration";
    } finally {
      loading = false;
    }
  }

  async function selectClass(option: ClassOption): Promise<void> {
    selectedClass = option;
    selectedOfferings = [];
    offeringsBusy = true;
    try {
      const params = new URLSearchParams({
        classId: String(option.classId),
        sectionId: String(option.sectionId),
      });
      const response = await fetch(`/people/offerings?${params.toString()}`);
      if (!response.ok) {
        error = "Could not load the class subjects";
        offerings = [];
        return;
      }
      offerings = (await response.json()) as OfferingRow[];
    } catch {
      error = "Could not load the class subjects";
      offerings = [];
    } finally {
      offeringsBusy = false;
    }
  }

  $effect(() => {
    if (open) {
      step = initialStep;
      selectedClass = null;
      selectedSubjects = [];
      offerings = [];
      selectedOfferings = [];
      teacherId = presetTeacherId ?? 0;
      replace = false;
      void loadConfig();
    }
  });

  async function post(
    action: string,
    fields: Record<string, string>
  ): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    pending = true;
    error = null;
    try {
      const payload = new FormData();
      for (const [key, value] of Object.entries(fields)) payload.set(key, value);
      const reply = await submitPeopleAction(action, payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return { ok: false, body: {} };
      }
      await invalidateAll();
      return { ok: true, body: reply.data };
    } finally {
      pending = false;
    }
  }

  async function createOfferings(): Promise<void> {
    if (!selectedClass) return;
    const result = await post("?/createOfferings", {
      classId: String(selectedClass.classId),
      sectionId: String(selectedClass.sectionId),
      subjectIds: selectedSubjects.join(","),
    });
    if (!result.ok) return;
    toast.success(
      `Created ${numberField(result.body, "created")}, reactivated ${numberField(result.body, "reactivated")}, skipped ${numberField(result.body, "skipped")}`
    );
    await selectClass(selectedClass);
    step = "teacher";
  }

  async function assignTeacher(): Promise<void> {
    if (!selectedClass || teacherId <= 0) return;
    const result = await post("?/assignTeacher", {
      offeringIds: selectedOfferings.join(","),
      teacherId: String(teacherId),
      replace: replace ? "true" : "false",
    });
    if (!result.ok) return;
    toast.success(`Updated ${numberField(result.body, "updated")} class subjects`);
    if (selectedClass) await selectClass(selectedClass);
  }

  function teacherLabel(teacher: {
    id: number;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
  }): string {
    if (teacher.fullName) return teacher.fullName;
    const name = `${teacher.firstName ?? ""} ${teacher.lastName ?? ""}`.trim();
    return name || `Teacher ${teacher.id}`;
  }

  const teacherOptions = $derived(
    config
      ? config.teachers.map((teacher) => ({
          value: String(teacher.id),
          label: teacherLabel(teacher),
        }))
      : []
  );

  const className = $derived(
    config
      ? Object.fromEntries(
          config.classes.map((option) => [
            `${option.classId}:${option.sectionId}`,
            `${option.className ?? "Class"} · ${option.sectionName ?? "Section"}`,
          ])
        )
      : {}
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">Manage assignments</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Create class subjects, then assign one teacher. Replacement needs confirmation.
      </Dialog.Description>
    </Dialog.Header>

    <div class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-hide">
      {#each [["subjects", "Class subjects"], ["teacher", "Assign teacher"], ["conflicts", "Conflicts"], ["settings", "Settings"]] as [key, label]}
        <Button
          variant={step === key ? "default" : "ghost"}
          size="sm"
          aria-current={step === key ? "step" : undefined}
          class="shrink-0 rounded-full text-xs font-bold"
          onclick={() => (step = key as typeof step)}
        >
          {label}
        </Button>
      {/each}
    </div>

    {#if error}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {/if}

    {#if loading || !config}
      <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Loading…
      </p>
    {:else if step === "subjects"}
      <ClassSubjectStep
        classes={config.classes}
        subjects={config.subjects}
        {selectedClass}
        selectedSubjects={selectedSubjects}
        onclass={selectClass}
        onsubject={(ids) => (selectedSubjects = ids)}
      />
      <Dialog.Footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
        <Button
          type="button"
          disabled={pending || !selectedClass || selectedSubjects.length === 0}
          onclick={createOfferings}
        >
          {pending ? "Working…" : "Create class subjects"}
        </Button>
      </Dialog.Footer>
    {:else if step === "teacher"}
      <AssignTeacherStep
        {offerings}
        isBusy={offeringsBusy}
        selected={selectedOfferings}
        onselect={(ids) => (selectedOfferings = ids)}
      />
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="space-y-1">
          <Label for="assignment-teacher" class="text-sm font-normal text-muted-foreground">Teacher</Label>
          <PeopleSelect
            id="assignment-teacher"
            ariaLabel="Teacher"
            value={teacherId > 0 ? String(teacherId) : ""}
            options={teacherOptions}
            placeholder="Select a teacher"
            onchange={(next) => (teacherId = Number(next))}
          />
        </div>
        <div class="flex min-h-11 items-center gap-2">
          <Checkbox
            id="assignment-replace"
            checked={replace}
            onCheckedChange={(next) => (replace = next === true)}
          />
          <Label for="assignment-replace" class="text-sm font-normal text-muted-foreground">
            Replace an existing teacher
          </Label>
        </div>
      </div>
      <Dialog.Footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
        <Button
          type="button"
          disabled={pending || teacherId <= 0 || selectedOfferings.length === 0}
          onclick={assignTeacher}
        >
          {pending ? "Working…" : "Assign teacher"}
        </Button>
      </Dialog.Footer>
    {:else if step === "conflicts"}
      <ConflictPanel conflicts={config.conflicts} labels={className} />
    {:else}
      <AssignmentToggle enabled={config.enabled} />
    {/if}
  </Dialog.Content>
</Dialog.Root>
