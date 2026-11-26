<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import type { ClassOption, SubjectOption } from "$lib/server/people/people-types";

  let {
    classes,
    subjects,
    selectedClass,
    selectedSubjects = [],
    onclass,
    onsubject,
  }: {
    classes: ClassOption[];
    subjects: SubjectOption[];
    selectedClass: ClassOption | null;
    selectedSubjects?: number[];
    onclass: (option: ClassOption) => void;
    onsubject: (subjectIds: number[]) => void;
  } = $props();

  const value = $derived(selectedClass ? `${selectedClass.classId}:${selectedClass.sectionId}` : "");

  const classOptions = $derived(
    classes.map((option) => ({
      value: `${option.classId}:${option.sectionId}`,
      label: `${option.className ?? "Class"} · ${option.sectionName ?? "Section"}`,
    }))
  );

  function handleClass(next: string): void {
    const [classIdRaw, sectionIdRaw] = next.split(":");
    const classId = Number(classIdRaw);
    const sectionId = Number(sectionIdRaw);
    const match = classes.find(
      (option) => option.classId === classId && option.sectionId === sectionId
    );
    if (match) onclass(match);
  }

  function toggleSubject(subjectId: number): void {
    const next = selectedSubjects.includes(subjectId)
      ? selectedSubjects.filter((id) => id !== subjectId)
      : [...selectedSubjects, subjectId];
    onsubject(next);
  }
</script>

<div class="space-y-3">
  <div class="space-y-1">
    <Label for="assignment-class" class="text-sm text-foreground">Class and section</Label>
    <PeopleSelect
      id="assignment-class"
      ariaLabel="Class and section"
      value={value}
      options={classOptions}
      placeholder="Select a class"
      onchange={handleClass}
    />
  </div>

  <fieldset class="min-w-0">
    <legend class="text-sm font-medium text-foreground">Subjects</legend>
    <div class="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
      {#each subjects as subject (subject.id)}
        <div
          class="flex min-h-11 items-center gap-2 rounded-md border border-border px-2 text-sm text-foreground sm:min-h-9 {selectedSubjects.includes(
            subject.id
          )
            ? 'bg-primary/10 border-primary/30'
            : ''}"
        >
          <Checkbox
            id={`assignment-subject-${subject.id}`}
            checked={selectedSubjects.includes(subject.id)}
            onCheckedChange={() => toggleSubject(subject.id)}
          />
          <Label
            for={`assignment-subject-${subject.id}`}
            class="min-w-0 flex-1 truncate text-sm font-normal text-foreground"
          >
            {subject.subjectName}
            {#if subject.subjectCode}
              <span class="text-xs text-muted-foreground"> · {subject.subjectCode}</span>
            {/if}
          </Label>
        </div>
      {/each}
    </div>
    <p class="mt-2 text-xs text-muted-foreground">
      {selectedSubjects.length} selected · active catalog only, no free text
    </p>
  </fieldset>
</div>
