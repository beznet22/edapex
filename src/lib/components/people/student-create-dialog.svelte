<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import SiblingPicker, { type SiblingSearchRow } from "./sibling-picker.svelte";
  import { DIALOG_CONTENT } from "./people-dialog";
  import { submitPeopleAction } from "./people-action-response";
  import type { ClassOption } from "$lib/server/people/people-types";

  type StudentOptions = {
    classes: ClassOption[];
    genders: { id: number; name: string | null }[];
    categories: { id: number; name: string | null }[];
  };

  type CreatedStudent = {
    studentId: number | null;
    studentPassword: string | null;
    parentPassword: string | null;
  };

  let {
    open = $bindable(false),
    oncreated,
  }: {
    open?: boolean;
    oncreated?: () => void;
  } = $props();

  const EMPTY = {
    classValue: "",
    admissionNo: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    dateOfBirth: "",
    genderId: "",
    categoryId: "",
    guardianRelation: "other",
    guardiansName: "",
    guardiansEmail: "",
    guardiansMobile: "",
  };

  let form = $state({ ...EMPTY });
  let options = $state<StudentOptions>({ classes: [], genders: [], categories: [] });
  let optionsLoading = $state(false);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let created = $state<CreatedStudent | null>(null);
  let sibling = $state<SiblingSearchRow | null>(null);

  const inputClass = "min-h-11 bg-background text-foreground sm:min-h-9";

  const classOptions = $derived(
    options.classes.map((option) => ({
      value: `${option.classId}:${option.sectionId}`,
      label: `${option.className ?? "Class"} · ${option.sectionName ?? "Section"}`,
    }))
  );
  const genderOptions = $derived(
    options.genders.map((option) => ({
      value: String(option.id),
      label: option.name ?? `Gender ${option.id}`,
    }))
  );
  const categoryOptions = $derived(
    options.categories.map((option) => ({
      value: String(option.id),
      label: option.name ?? `Category ${option.id}`,
    }))
  );
  const relationOptions = [
    { value: "father", label: "Father" },
    { value: "mother", label: "Mother" },
    { value: "other", label: "Other" },
  ];

  async function loadOptions(): Promise<void> {
    optionsLoading = true;
    try {
      const response = await fetch("/people/student-options");
      if (response.ok) options = (await response.json()) as StudentOptions;
      else error = "Could not load classes and options";
    } catch {
      error = "Could not load classes and options";
    } finally {
      optionsLoading = false;
    }
  }

  $effect(() => {
    if (open) {
      form = { ...EMPTY };
      sibling = null;
      created = null;
      error = null;
      void loadOptions();
    }
  });

  function selectSibling(row: SiblingSearchRow | null): void {
    sibling = row;
    if (row) {
      form.guardiansName = row.guardianName ?? form.guardiansName;
      form.guardiansEmail = row.guardianEmail ?? form.guardiansEmail;
      form.guardiansMobile = row.guardianMobile ?? form.guardiansMobile;
    }
  }

  function field(key: keyof typeof EMPTY, value: string): void {
    form[key] = value;
  }

  async function submit(): Promise<void> {
    if (!form.classValue) {
      error = "Select a class and section";
      return;
    }
    const [classId, sectionId] = form.classValue.split(":");
    pending = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("classId", classId);
      payload.set("sectionId", sectionId);
      for (const [key, value] of Object.entries(form)) {
        if (key === "classValue") continue;
        payload.set(key, value);
      }
      payload.set(
        "siblingAdmissionNo",
        sibling?.admissionNo ? String(sibling.admissionNo) : ""
      );
      const reply = await submitPeopleAction("?/createStudent", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      created = {
        studentId:
          typeof reply.data.studentId === "number" ? reply.data.studentId : null,
        studentPassword:
          typeof reply.data.studentPassword === "string"
            ? reply.data.studentPassword
            : null,
        parentPassword:
          typeof reply.data.parentPassword === "string"
            ? reply.data.parentPassword
            : null,
      };
      oncreated?.();
    } finally {
      pending = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">Add student</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Creates the student, a login, and either links an existing parent or creates one.
      </Dialog.Description>
    </Dialog.Header>

    {#if created}
      <div class="space-y-3">
        <p class="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
          Student created. The passwords below are shown once — share them securely.
        </p>
        {#if created.studentPassword}
          <p class="text-sm text-foreground">
            Student password:
            <span class="font-mono font-semibold">{created.studentPassword}</span>
          </p>
        {/if}
        {#if created.parentPassword}
          <p class="text-sm text-foreground">
            New parent password:
            <span class="font-mono font-semibold">{created.parentPassword}</span>
          </p>
        {:else}
          <p class="text-xs text-muted-foreground">
            Linked to an existing parent; no new parent login was created.
          </p>
        {/if}
        <Dialog.Footer class="flex justify-end">
          <Button type="button" onclick={() => (open = false)}>Done</Button>
        </Dialog.Footer>
      </div>
    {:else}
      {#if error}
        <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      {/if}
      {#if optionsLoading}
        <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Loading classes…
        </p>
      {:else}
        <form
          class="grid gap-3 sm:grid-cols-2"
          onsubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div class="space-y-1 sm:col-span-2">
            <Label for="new-student-class" class="text-sm font-normal text-muted-foreground">
              Class and section
            </Label>
            <PeopleSelect
              id="new-student-class"
              ariaLabel="Class and section"
              value={form.classValue}
              options={classOptions}
              placeholder="Select a class"
              onchange={(next) => field("classValue", next)}
            />
          </div>

          <div class="space-y-1">
            <Label for="new-student-first" class="text-sm font-normal text-muted-foreground">
              First name
            </Label>
            <Input
              id="new-student-first"
              class={inputClass}
              value={form.firstName}
              oninput={(event) => field("firstName", event.currentTarget.value)}
              required
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-last" class="text-sm font-normal text-muted-foreground">
              Last name
            </Label>
            <Input
              id="new-student-last"
              class={inputClass}
              value={form.lastName}
              oninput={(event) => field("lastName", event.currentTarget.value)}
              required
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-email" class="text-sm font-normal text-muted-foreground">
              Student email
            </Label>
            <Input
              id="new-student-email"
              class={inputClass}
              type="email"
              value={form.email}
              oninput={(event) => field("email", event.currentTarget.value)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-mobile" class="text-sm font-normal text-muted-foreground">
              Student mobile
            </Label>
            <Input
              id="new-student-mobile"
              class={inputClass}
              type="tel"
              value={form.mobile}
              oninput={(event) => field("mobile", event.currentTarget.value)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-dob" class="text-sm font-normal text-muted-foreground">
              Date of birth
            </Label>
            <Input
              id="new-student-dob"
              class={inputClass}
              type="date"
              value={form.dateOfBirth}
              oninput={(event) => field("dateOfBirth", event.currentTarget.value)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-admission" class="text-sm font-normal text-muted-foreground">
              Admission no (blank = auto)
            </Label>
            <Input
              id="new-student-admission"
              class={inputClass}
              type="number"
              min="1"
              value={form.admissionNo}
              oninput={(event) => field("admissionNo", event.currentTarget.value)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-gender" class="text-sm font-normal text-muted-foreground">
              Gender
            </Label>
            <PeopleSelect
              id="new-student-gender"
              ariaLabel="Gender"
              value={form.genderId}
              options={genderOptions}
              placeholder="Select gender"
              onchange={(next) => field("genderId", next)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-category" class="text-sm font-normal text-muted-foreground">
              Category
            </Label>
            <PeopleSelect
              id="new-student-category"
              ariaLabel="Category"
              value={form.categoryId}
              options={categoryOptions}
              placeholder="Select category"
              onchange={(next) => field("categoryId", next)}
            />
          </div>

          <div class="sm:col-span-2">
            <SiblingPicker selected={sibling} onselect={selectSibling} />
          </div>

          <div class="space-y-1">
            <Label for="new-student-relation" class="text-sm font-normal text-muted-foreground">
              Guardian relation
            </Label>
            <PeopleSelect
              id="new-student-relation"
              ariaLabel="Guardian relation"
              value={form.guardianRelation}
              options={relationOptions}
              onchange={(next) => field("guardianRelation", next)}
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-guardian-name" class="text-sm font-normal text-muted-foreground">
              Guardian name
            </Label>
            <Input
              id="new-student-guardian-name"
              class={inputClass}
              value={form.guardiansName}
              oninput={(event) => field("guardiansName", event.currentTarget.value)}
              required
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-guardian-email" class="text-sm font-normal text-muted-foreground">
              Guardian email
            </Label>
            <Input
              id="new-student-guardian-email"
              class={inputClass}
              type="email"
              value={form.guardiansEmail}
              oninput={(event) => field("guardiansEmail", event.currentTarget.value)}
              required
            />
          </div>
          <div class="space-y-1">
            <Label for="new-student-guardian-mobile" class="text-sm font-normal text-muted-foreground">
              Guardian mobile
            </Label>
            <Input
              id="new-student-guardian-mobile"
              class={inputClass}
              type="tel"
              value={form.guardiansMobile}
              oninput={(event) => field("guardiansMobile", event.currentTarget.value)}
            />
          </div>

          {#if sibling}
            <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">
              The sibling's existing parent is reused. Guardian edits above are not applied to that
              parent record.
            </p>
          {/if}
          <Dialog.Footer class="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onclick={() => (open = false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create student"}
            </Button>
          </Dialog.Footer>
        </form>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
