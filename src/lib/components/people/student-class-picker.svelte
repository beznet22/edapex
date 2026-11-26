<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import type { ClassOption } from "$lib/server/people/people-types";

  let {
    classes,
    selected = null,
    onselect,
  }: {
    classes: ClassOption[];
    selected?: ClassOption | null;
    onselect: (option: ClassOption) => void;
  } = $props();

  const value = $derived(selected ? `${selected.classId}:${selected.sectionId}` : "");

  const classOptions = $derived(
    classes.map((option) => ({
      value: `${option.classId}:${option.sectionId}`,
      label: `${option.className ?? "Class"} · ${option.sectionName ?? "Section"}`,
    }))
  );

  function handleSelect(next: string): void {
    const [classIdRaw, sectionIdRaw] = next.split(":");
    const classId = Number(classIdRaw);
    const sectionId = Number(sectionIdRaw);
    if (!Number.isInteger(classId) || !Number.isInteger(sectionId)) return;
    const match = classes.find(
      (option) => option.classId === classId && option.sectionId === sectionId
    );
    if (match) onselect(match);
  }
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
  <div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
    <Label for="student-class-picker" class="shrink-0 text-xs text-muted-foreground">
      Class
    </Label>
    <div class="min-w-0 flex-1 sm:w-64 sm:flex-none">
      <PeopleSelect
        id="student-class-picker"
        ariaLabel="Selected class"
        value={value}
        options={classOptions}
        placeholder="Select a class"
        onchange={handleSelect}
      />
    </div>
  </div>

  <p class="text-xs text-muted-foreground">
    {classes.length} {classes.length === 1 ? "class" : "classes"} available
  </p>
</div>
