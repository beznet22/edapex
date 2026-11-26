<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { DIALOG_CONTENT as PEOPLE_DIALOG_CONTENT } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import type { StaffOptions } from "$lib/server/people/people-types";

  type StaffFormValue = {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    designationId: string;
    departmentId: string;
    roleId: string;
    genderId: string;
    qualification: string;
    experience: string;
  };

  let {
    open = $bindable(false),
    options,
    pending = false,
    error = null,
    onsubmit,
  }: {
    open?: boolean;
    options: StaffOptions;
    pending?: boolean;
    error?: string | null;
    onsubmit: (fields: FormData) => void;
  } = $props();

  const EMPTY: StaffFormValue = {
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    designationId: "",
    departmentId: "",
    roleId: "",
    genderId: "",
    qualification: "",
    experience: "",
  };

  let form = $state<StaffFormValue>({ ...EMPTY });

  const inputClass = "mt-1 min-h-11 bg-background text-foreground sm:min-h-9";

  function toOptions(
    rows: { id: number; name: string | null }[],
    fallback: string
  ): { value: string; label: string }[] {
    return rows.map((row) => ({
      value: String(row.id),
      label: row.name ?? `${fallback} ${row.id}`,
    }));
  }

  const designationOptions = $derived(toOptions(options.designations, "Designation"));
  const departmentOptions = $derived(toOptions(options.departments, "Department"));
  const roleOptions = $derived(toOptions(options.roles, "Role"));
  const genderOptions = $derived(toOptions(options.genders, "Gender"));

  $effect(() => {
    if (open) form = { ...EMPTY };
  });

  function submit(): void {
    const payload = new FormData();
    for (const [key, value] of Object.entries(form)) payload.set(key, value);
    onsubmit(payload);
  }

  function field<K extends keyof StaffFormValue>(key: K, value: string): void {
    form[key] = value;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">Add staff</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        Creates the staff record and a login. The temporary password is shown once.
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {/if}

    <form
      class="grid gap-3 sm:grid-cols-2"
      onsubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div class="space-y-1">
        <Label for="staff-first-name" class="text-sm font-normal text-muted-foreground">First name</Label>
        <Input
          id="staff-first-name"
          class={inputClass}
          value={form.firstName}
          oninput={(event) => field("firstName", event.currentTarget.value)}
          autocomplete="given-name"
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-last-name" class="text-sm font-normal text-muted-foreground">Last name</Label>
        <Input
          id="staff-last-name"
          class={inputClass}
          value={form.lastName}
          oninput={(event) => field("lastName", event.currentTarget.value)}
          autocomplete="family-name"
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-email" class="text-sm font-normal text-muted-foreground">Email</Label>
        <Input
          id="staff-email"
          class={inputClass}
          type="email"
          value={form.email}
          oninput={(event) => field("email", event.currentTarget.value)}
          autocomplete="email"
          required
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-mobile" class="text-sm font-normal text-muted-foreground">Mobile</Label>
        <Input
          id="staff-mobile"
          class={inputClass}
          type="tel"
          value={form.mobile}
          oninput={(event) => field("mobile", event.currentTarget.value)}
          autocomplete="tel"
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-designation" class="text-sm font-normal text-muted-foreground">Designation</Label>
        <PeopleSelect
          id="staff-designation"
          ariaLabel="Designation"
          value={form.designationId}
          options={designationOptions}
          placeholder="Select designation"
          onchange={(next) => field("designationId", next)}
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-department" class="text-sm font-normal text-muted-foreground">Department</Label>
        <PeopleSelect
          id="staff-department"
          ariaLabel="Department"
          value={form.departmentId}
          options={departmentOptions}
          placeholder="Select department"
          onchange={(next) => field("departmentId", next)}
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-role" class="text-sm font-normal text-muted-foreground">Role</Label>
        <PeopleSelect
          id="staff-role"
          ariaLabel="Role"
          value={form.roleId}
          options={roleOptions}
          placeholder="Select role"
          onchange={(next) => field("roleId", next)}
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-gender" class="text-sm font-normal text-muted-foreground">Gender</Label>
        <PeopleSelect
          id="staff-gender"
          ariaLabel="Gender"
          value={form.genderId}
          options={genderOptions}
          placeholder="Select gender"
          onchange={(next) => field("genderId", next)}
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-qualification" class="text-sm font-normal text-muted-foreground">Qualification</Label>
        <Input
          id="staff-qualification"
          class={inputClass}
          value={form.qualification}
          oninput={(event) => field("qualification", event.currentTarget.value)}
        />
      </div>
      <div class="space-y-1">
        <Label for="staff-experience" class="text-sm font-normal text-muted-foreground">Experience</Label>
        <Input
          id="staff-experience"
          class={inputClass}
          value={form.experience}
          oninput={(event) => field("experience", event.currentTarget.value)}
        />
      </div>

      <Dialog.Footer class="mt-2 flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create staff"}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
