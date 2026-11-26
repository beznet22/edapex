<script lang="ts">
  import { toast } from "svelte-sonner";
  import * as Dialog from "$lib/components/ui/dialog";
  import { DIALOG_CONTENT as PEOPLE_DIALOG_CONTENT } from "./people-dialog";
  import { Button } from "$lib/components/ui/button";
  import PersonCell from "./person-cell.svelte";
  import { submitPeopleAction } from "./people-action-response";
  import StudentDetailFields, {
    type StudentEditForm,
  } from "./student-detail-fields.svelte";
  import type { StudentEditOptions, StudentEditRow } from "$lib/server/people/people-types";

  let {
    open = $bindable(false),
    studentId = null,
    onupdated,
  }: {
    open?: boolean;
    studentId?: number | null;
    onupdated?: () => void;
  } = $props();

  let detail = $state<StudentEditRow | null>(null);
  let options = $state<StudentEditOptions>({ genders: [], categories: [] });
  let editable = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let savedAt = $state<number | null>(null);
  let uploading = $state(false);

  let form = $state<StudentEditForm>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    genderId: "",
    categoryId: "",
    rollNo: "",
  });

  let fileInput = $state<HTMLInputElement | null>(null);
  let loadToken = 0;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let queued = false;

  const displayName = $derived(
    `${form.firstName} ${form.lastName}`.trim() || detail?.fullName || null
  );
  const classLine = $derived(
    detail
      ? `${detail.className ?? "Class"} · ${detail.sectionName ?? "Section"}`
      : "Student record"
  );

  function applyDetail(student: StudentEditRow): void {
    detail = student;
    form = {
      firstName: student.firstName ?? "",
      lastName: student.lastName ?? "",
      dateOfBirth: student.dateOfBirth ?? "",
      genderId: student.genderId ? String(student.genderId) : "",
      categoryId: student.studentCategoryId ? String(student.studentCategoryId) : "",
      rollNo: student.rollNo !== null ? String(student.rollNo) : "",
    };
  }

  async function load(): Promise<void> {
    if (!studentId) return;
    const token = ++loadToken;
    loading = true;
    error = null;
    detail = null;
    savedAt = null;
    try {
      const response = await fetch(`/people/students/${studentId}`);
      const body = (await response.json()) as {
        student?: StudentEditRow;
        options?: StudentEditOptions;
        canManage?: boolean;
        message?: string;
        error?: string;
      };
      if (token !== loadToken) return;
      if (!response.ok || !body.student) {
        error = body.message ?? body.error ?? "Could not load this student";
        return;
      }
      applyDetail(body.student);
      options = body.options ?? { genders: [], categories: [] };
      editable = body.canManage === true;
    } catch {
      if (token === loadToken) error = "Could not load this student";
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  $effect(() => {
    if (open && studentId) {
      void load();
    } else if (!open) {
      loadToken += 1;
      detail = null;
      error = null;
      savedAt = null;
    }
  });

  function scheduleSave(): void {
    if (!editable || !detail) return;
    savedAt = null;
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveNow();
    }, 700);
  }

  function setField(key: keyof StudentEditForm, value: string): void {
    form[key] = value;
    scheduleSave();
  }

  async function saveNow(): Promise<void> {
    if (!editable || !detail) return;
    if (saving) {
      queued = true;
      return;
    }
    saving = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("studentId", String(detail.id));
      payload.set("firstName", form.firstName);
      payload.set("lastName", form.lastName);
      payload.set("dateOfBirth", form.dateOfBirth);
      payload.set("genderId", form.genderId);
      payload.set("studentCategoryId", form.categoryId);
      payload.set("rollNo", form.rollNo);
      const reply = await submitPeopleAction("?/updateStudent", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      savedAt = Date.now();
      detail = {
        ...detail,
        firstName: form.firstName,
        lastName: form.lastName,
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        dateOfBirth: form.dateOfBirth || null,
        genderId: form.genderId ? Number(form.genderId) : null,
        studentCategoryId: form.categoryId ? Number(form.categoryId) : null,
        rollNo: form.rollNo ? Number(form.rollNo) : null,
      };
      onupdated?.();
    } catch {
      error = "Could not save";
    } finally {
      saving = false;
      if (queued) {
        queued = false;
        void saveNow();
      }
    }
  }

  async function toggleActive(): Promise<void> {
    if (!editable || !detail) return;
    saving = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("studentId", String(detail.id));
      payload.set("active", String(!detail.active));
      const reply = await submitPeopleAction("?/setStudentActive", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      detail = { ...detail, active: !detail.active };
      savedAt = Date.now();
      onupdated?.();
    } catch {
      error = "Could not update the status";
    } finally {
      saving = false;
    }
  }

  async function uploadPhoto(file: File): Promise<void> {
    if (!editable || !detail) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      error = "Choose a JPEG, PNG or WebP image";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      error = "Photo must be 5 MB or smaller";
      return;
    }
    uploading = true;
    error = null;
    try {
      const payload = new FormData();
      payload.set("kind", "studentPhoto");
      payload.set("studentId", String(detail.id));
      payload.set("file", file);
      payload.set("filename", file.name);
      const response = await fetch("/api/uploads", { method: "POST", body: payload });
      const body = (await response.json()) as { photoUrl?: string; message?: string };
      if (!response.ok || !body.photoUrl) {
        error = body.message ?? "Could not upload the photo";
        return;
      }
      detail = { ...detail, studentPhoto: body.photoUrl };
      savedAt = Date.now();
      onupdated?.();
      toast.success("Photo updated");
    } catch {
      error = "Could not upload the photo";
    } finally {
      uploading = false;
    }
  }

  function handleFile(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    if (file) void uploadPhoto(file);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={PEOPLE_DIALOG_CONTENT}>
    <Dialog.Header>
      <Dialog.Title class="text-lg font-semibold">{displayName ?? "Student"}</Dialog.Title>
      <Dialog.Description class="text-sm text-muted-foreground">
        {classLine}
        {#if detail?.admissionNo != null}· ADM {detail.admissionNo}{/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Loading student…
      </p>
    {:else if error && !detail}
      <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </p>
    {:else if detail}
      <div class="flex items-center gap-3">
        <PersonCell
          name={displayName}
          photo={detail.studentPhoto}
          colorful
          size="lg"
          secondary={detail.active ? "Active student" : "Inactive student"}
        />
        {#if editable}
          <div class="ml-auto flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onclick={() => fileInput?.click()}
            >
              {uploading ? "Uploading…" : "Change photo"}
            </Button>
            <p class="text-xs text-muted-foreground">JPEG, PNG or WebP, ≤5 MB</p>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              onchange={handleFile}
            />
          </div>
        {/if}
      </div>

      {#if error}
        <p class="rounded-lg border border-border bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      {/if}

      {#if !editable}
        <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Read-only. Ask an administrator to change this student's details.
        </p>
      {/if}

      <StudentDetailFields
        {form}
        {options}
        {editable}
        active={detail.active}
        {saving}
        onfield={setField}
        onactive={() => void toggleActive()}
      />

      <div class="flex items-center justify-between gap-2 text-xs" aria-live="polite">
        <span class="text-muted-foreground">
          {#if saving}
            Saving…
          {:else if savedAt}
            All changes saved
          {:else if editable}
            Changes save automatically
          {/if}
        </span>
        <Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
      </div>
    {:else}
      <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        No student selected.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
