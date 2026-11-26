<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { DIALOG_CONTENT as PEOPLE_DIALOG_CONTENT } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import ClassSubjectStep from "./class-subject-step.svelte";
  import { submitPeopleAction } from "./people-action-response";
  import type { ClassOption, SubjectOption } from "$lib/server/people/people-types";

  let {
    open = $bindable(false),
    classes,
    subjects,
  }: {
    open?: boolean;
    classes: ClassOption[];
    subjects: SubjectOption[];
  } = $props();

  let selectedClass = $state<ClassOption | null>(null);
  let selectedSubjects = $state<number[]>([]);
  let pending = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (open) {
      selectedClass = classes.length === 1 ? classes[0] : null;
      selectedSubjects = [];
      error = null;
    }
  });

  async function submit(): Promise<void> {
    if (!selectedClass) return;
    pending = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("classId", String(selectedClass.classId));
      payload.set("sectionId", String(selectedClass.sectionId));
      payload.set("className", selectedClass.className ?? "");
      payload.set("sectionName", selectedClass.sectionName ?? "");
      payload.set("subjectIds", selectedSubjects.join(","));
      const reply = await submitPeopleAction("?/selfAssign", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      open = false;
      await invalidateAll();
      toast.success("Class assigned");
      void goto(
        `/people?tab=students&classId=${selectedClass.classId}&sectionId=${selectedClass.sectionId}`
      );
    } catch {
      error = "Could not complete the self-assignment";
    } finally {
      pending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">Add class</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Choose one class and the subjects you teach. This grants immediate access to its roster,
        chat and files.
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {/if}

    <ClassSubjectStep
      {classes}
      {subjects}
      {selectedClass}
      selectedSubjects={selectedSubjects}
      onclass={(option) => (selectedClass = option)}
      onsubject={(ids) => (selectedSubjects = ids)}
    />

    <Dialog.Footer class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button
        type="button"
        disabled={pending || !selectedClass || selectedSubjects.length === 0}
        onclick={submit}
      >
        {pending ? "Assigning…" : "Assign me"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
