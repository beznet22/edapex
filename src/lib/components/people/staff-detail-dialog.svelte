<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { DIALOG_CONTENT as PEOPLE_DIALOG_CONTENT } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Avatar from "$lib/components/ui/avatar";
  import { initials } from "$lib/people/people-display";
  import type { StaffDirectoryRow } from "$lib/server/people/people-types";

  type EditFields = {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    qualification: string;
    experience: string;
  };

  let {
    open = $bindable(false),
    staff = null,
    pending = false,
    error = null,
    photoUrl = null,
    uploading = false,
    onsave,
    onremove,
    onphoto,
    onmanage,
  }: {
    open?: boolean;
    staff?: StaffDirectoryRow | null;
    pending?: boolean;
    error?: string | null;
    photoUrl?: string | null;
    uploading?: boolean;
    onsave: (form: FormData) => void;
    onremove: (form: FormData) => void;
    onphoto: (file: File) => void;
    onmanage?: () => void;
  } = $props();

  const inputClass = "mt-1 min-h-11 bg-background text-foreground sm:min-h-9";

  let form = $state<EditFields>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    qualification: "",
    experience: "",
  });
  let fileInput = $state<HTMLInputElement | null>(null);
  let confirming = $state(false);

  $effect(() => {
    if (open && staff) {
      form = {
        firstName: staff.firstName ?? "",
        lastName: staff.lastName ?? "",
        email: staff.email ?? "",
        mobile: staff.mobile ?? "",
        qualification: "",
        experience: "",
      };
      confirming = false;
    }
  });

  function submit(): void {
    if (!staff) return;
    const payload = new FormData();
    payload.set("staffId", String(staff.id));
    payload.set("firstName", form.firstName);
    payload.set("lastName", form.lastName);
    payload.set("email", form.email);
    payload.set("mobile", form.mobile);
    payload.set("qualification", form.qualification);
    payload.set("experience", form.experience);
    onsave(payload);
  }

  function remove(): void {
    if (!staff) return;
    const payload = new FormData();
    payload.set("staffId", String(staff.id));
    onremove(payload);
  }

  function handleFile(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (file) onphoto(file);
  }

  const displayPhoto = $derived(photoUrl ?? staff?.staffPhoto ?? null);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">
        {staff ? (staff.fullName ?? `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim()) : "Staff"}
      </Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        {staff?.designation ?? staff?.department ?? "Staff record"}
      </Dialog.Description>
    </Dialog.Header>

    {#if error}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {/if}

    {#if staff}
      <div class="flex items-center gap-3">
        <Avatar.Root class="size-14 rounded-full">
          {#if displayPhoto}
            <Avatar.Image src={displayPhoto} alt="" class="size-full object-cover" />
          {/if}
          <Avatar.Fallback class="bg-muted text-sm font-semibold text-muted-foreground">
            {initials(staff.fullName)}
          </Avatar.Fallback>
        </Avatar.Root>
        <div class="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onclick={() => fileInput?.click()}
          >
            {uploading ? "Uploading…" : "Change photo"}
          </Button>
          <p class="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB</p>
        </div>
        <input
          bind:this={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          onchange={handleFile}
        />
      </div>

      <form
        class="grid gap-3 sm:grid-cols-2"
        onsubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div class="space-y-1">
          <Label for="staff-edit-first-name" class="text-sm font-normal text-muted-foreground">First name</Label>
          <Input
            id="staff-edit-first-name"
            class={inputClass}
            value={form.firstName}
            oninput={(event) => (form.firstName = event.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <Label for="staff-edit-last-name" class="text-sm font-normal text-muted-foreground">Last name</Label>
          <Input
            id="staff-edit-last-name"
            class={inputClass}
            value={form.lastName}
            oninput={(event) => (form.lastName = event.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <Label for="staff-edit-email" class="text-sm font-normal text-muted-foreground">Email</Label>
          <Input
            id="staff-edit-email"
            class={inputClass}
            type="email"
            value={form.email}
            oninput={(event) => (form.email = event.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <Label for="staff-edit-mobile" class="text-sm font-normal text-muted-foreground">Mobile</Label>
          <Input
            id="staff-edit-mobile"
            class={inputClass}
            type="tel"
            value={form.mobile}
            oninput={(event) => (form.mobile = event.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <Label for="staff-edit-qualification" class="text-sm font-normal text-muted-foreground">Qualification</Label>
          <Input
            id="staff-edit-qualification"
            class={inputClass}
            value={form.qualification}
            oninput={(event) => (form.qualification = event.currentTarget.value)}
          />
        </div>
        <div class="space-y-1">
          <Label for="staff-edit-experience" class="text-sm font-normal text-muted-foreground">Experience</Label>
          <Input
            id="staff-edit-experience"
            class={inputClass}
            value={form.experience}
            oninput={(event) => (form.experience = event.currentTarget.value)}
          />
        </div>

        <div class="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-col-reverse gap-2 sm:flex-row">
            {#if onmanage}
              <Button type="button" variant="outline" onclick={onmanage}>Manage classes</Button>
            {/if}
            {#if confirming}
              <Button type="button" variant="destructive" disabled={pending} onclick={remove}>
                Confirm remove
              </Button>
              <Button type="button" variant="outline" onclick={() => (confirming = false)}>
                Cancel
              </Button>
            {:else if staff.active}
              <Button type="button" variant="outline" onclick={() => (confirming = true)}>
                Remove
              </Button>
            {/if}
          </div>
          <div class="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </form>

      {#if !staff.active}
        <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          This person is removed and can be restored by re-creating their record. Nothing was
          deleted.
        </p>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
