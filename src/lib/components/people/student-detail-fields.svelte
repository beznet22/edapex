<script lang="ts" module>
  export type StudentEditForm = {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    genderId: string;
    categoryId: string;
    rollNo: string;
  };
</script>

<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import StatusPill from "./status-pill.svelte";
  import type { StudentEditOptions } from "$lib/server/people/people-types";

  let {
    form,
    options,
    editable,
    active,
    saving,
    onfield,
    onactive,
  }: {
    form: StudentEditForm;
    options: StudentEditOptions;
    editable: boolean;
    active: boolean;
    saving: boolean;
    onfield: (key: keyof StudentEditForm, value: string) => void;
    onactive: () => void;
  } = $props();

  const inputClass = "min-h-11 bg-background text-foreground sm:min-h-9";

  const genderOptions = $derived([
    { value: "", label: "Not set" },
    ...options.genders.map((option) => ({
      value: String(option.id),
      label: option.name ?? `Gender ${option.id}`,
    })),
  ]);
  const categoryOptions = $derived([
    { value: "", label: "Not set" },
    ...options.categories.map((option) => ({
      value: String(option.id),
      label: option.name ?? `Category ${option.id}`,
    })),
  ]);
</script>

<div class="grid gap-3 sm:grid-cols-2">
  <div class="space-y-1">
    <Label for="student-first-name" class="text-sm font-normal text-muted-foreground">First name</Label>
    <Input
      id="student-first-name"
      class={inputClass}
      value={form.firstName}
      disabled={!editable}
      oninput={(event) => onfield("firstName", event.currentTarget.value)}
    />
  </div>
  <div class="space-y-1">
    <Label for="student-last-name" class="text-sm font-normal text-muted-foreground">Last name</Label>
    <Input
      id="student-last-name"
      class={inputClass}
      value={form.lastName}
      disabled={!editable}
      oninput={(event) => onfield("lastName", event.currentTarget.value)}
    />
  </div>
  <div class="space-y-1">
    <Label for="student-dob" class="text-sm font-normal text-muted-foreground">Date of birth</Label>
    <Input
      id="student-dob"
      class={inputClass}
      type="date"
      value={form.dateOfBirth}
      disabled={!editable}
      oninput={(event) => onfield("dateOfBirth", event.currentTarget.value)}
    />
  </div>
  <div class="space-y-1">
    <Label for="student-roll" class="text-sm font-normal text-muted-foreground">Roll number</Label>
    <Input
      id="student-roll"
      class={inputClass}
      type="number"
      min="0"
      value={form.rollNo}
      disabled={!editable}
      oninput={(event) => onfield("rollNo", event.currentTarget.value)}
    />
  </div>
  <div class="space-y-1">
    <Label for="student-gender" class="text-sm font-normal text-muted-foreground">Gender</Label>
    <PeopleSelect
      id="student-gender"
      ariaLabel="Gender"
      value={form.genderId}
      options={genderOptions}
      disabled={!editable}
      onchange={(next) => onfield("genderId", next)}
    />
  </div>
  <div class="space-y-1">
    <Label for="student-category" class="text-sm font-normal text-muted-foreground">Category</Label>
    <PeopleSelect
      id="student-category"
      ariaLabel="Category"
      value={form.categoryId}
      options={categoryOptions}
      disabled={!editable}
      onchange={(next) => onfield("categoryId", next)}
    />
  </div>
</div>

<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
  <div class="flex items-center gap-2">
    <StatusPill label={active ? "Active" : "Inactive"} tone={active ? "active" : "muted"} />
    <span class="text-xs text-muted-foreground">
      Class and admission number are managed from the roster.
    </span>
  </div>
  {#if editable}
    <Button type="button" variant="outline" size="sm" disabled={saving} onclick={onactive}>
      {active ? "Deactivate" : "Activate"}
    </Button>
  {/if}
</div>
