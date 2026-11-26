<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { Button } from "$lib/components/ui/button";
  import {
    numberField,
    stringField,
    submitPeopleAction,
  } from "./people-action-response";
  import PeopleTable from "./people-table.svelte";
  import PeoplePager from "./people-pager.svelte";
  import PersonCell from "./person-cell.svelte";
  import StatusPill from "./status-pill.svelte";
  import StaffCreateDialog from "./staff-create-dialog.svelte";
  import StaffDetailDialog from "./staff-detail-dialog.svelte";
  import type { PageSize, PeopleUrlPatch } from "$lib/people/people-url";
  import type {
    StaffDirectoryRow,
    StaffOptions,
    StaffSort,
  } from "$lib/server/people/people-types";

  let {
    rows,
    total,
    options,
    sort,
    dir,
    page,
    pageSize,
    onsort,
    onpage,
    onpagesize,
    onfilter,
    onmanage,
    createOpen = $bindable(false),
  }: {
    rows: StaffDirectoryRow[];
    total: number;
    options: StaffOptions;
    sort: string;
    dir: "asc" | "desc";
    page: number;
    pageSize: number;
    onsort: (key: string) => void;
    onpage: (page: number) => void;
    onpagesize: (size: PageSize) => void;
    onfilter: (patch: PeopleUrlPatch) => void;
    onmanage?: (staffId: number) => void;
    createOpen?: boolean;
  } = $props();

  let editing = $state<StaffDirectoryRow | null>(null);
  let detailOpen = $state(false);
  let pending = $state(false);
  let error = $state<string | null>(null);
  let photoUrl = $state<string | null>(null);
  let uploading = $state(false);
  let tempPassword = $state<string | null>(null);

  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "role", label: "Role", sortable: true },
    { key: "contact", label: "Contact" },
    { key: "status", label: "Status", sortable: true },
    { key: "actions", label: "Actions", align: "right" as const },
  ];

  function staffName(row: StaffDirectoryRow): string {
    const full = row.fullName?.trim();
    if (full) return full;
    return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Unnamed";
  }

  function isStaffSort(value: string): value is StaffSort {
    return value === "name" || value === "role" || value === "status";
  }

  function handleSort(key: string): void {
    if (isStaffSort(key)) onsort(key);
  }

  async function post(
    action: "?/createStaff" | "?/updateStaff" | "?/deactivateStaff",
    payload: FormData
  ): Promise<Record<string, unknown> | null> {
    pending = true;
    error = null;
    try {
      const reply = await submitPeopleAction(action, payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return null;
      }
      await invalidateAll();
      return reply.data;
    } finally {
      pending = false;
    }
  }

  async function handleCreate(payload: FormData): Promise<void> {
    const result = await post("?/createStaff", payload);
    if (!result) return;
    createOpen = false;
    tempPassword = stringField(result, "password");
    toast.success("Staff member created");
  }

  async function handleSave(payload: FormData): Promise<void> {
    const result = await post("?/updateStaff", payload);
    if (!result) return;
    detailOpen = false;
    editing = null;
    toast.success("Staff member updated");
  }

  async function handleRemove(payload: FormData): Promise<void> {
    const result = await post("?/deactivateStaff", payload);
    if (!result) return;
    detailOpen = false;
    editing = null;
    onfilter({ includeInactive: false });
    toast.success("Staff member removed");
  }

  async function handlePhoto(file: File): Promise<void> {
    if (!editing) return;
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
      payload.set("kind", "staffPhoto");
      payload.set("staffId", String(editing.id));
      payload.set("file", file);
      payload.set("filename", file.name);
      const response = await fetch("/api/uploads", { method: "POST", body: payload });
      const body = (await response.json()) as { photoUrl?: string; message?: string };
      if (!response.ok || !body.photoUrl) {
        error = body.message ?? "Could not upload the photo";
        return;
      }
      photoUrl = body.photoUrl;
      await invalidateAll();
      toast.success("Photo updated");
    } catch {
      error = "Could not upload the photo";
    } finally {
      uploading = false;
    }
  }

  const menuItemClass =
    "min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9";

  function openDetail(row: StaffDirectoryRow): void {
    editing = row;
    photoUrl = null;
    error = null;
    detailOpen = true;
  }
</script>

<PeopleTable columns={columns} rows={rows} {sort} {dir} onsort={handleSort}>
  {#snippet row(entry: StaffDirectoryRow)}
    <td class="px-3 py-3">
      <PersonCell name={staffName(entry)} photo={entry.staffPhoto} colorful />
    </td>
    <td class="px-3 py-3 text-sm text-muted-foreground">
      {entry.designation ?? entry.department ?? "—"}
    </td>
    <td class="px-3 py-3 text-sm text-muted-foreground">
      <p class="truncate">{entry.email ?? "No email"}</p>
      {#if entry.mobile}
        <p class="truncate text-xs">{entry.mobile}</p>
      {/if}
    </td>
    <td class="px-3 py-3">
      <StatusPill
        label={entry.active ? "Active" : "Inactive"}
        tone={entry.active ? "active" : "muted"}
      />
    </td>
    <td class="px-3 py-3 text-right">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-11 rounded-full text-muted-foreground sm:size-9"
              aria-label={`Actions for ${staffName(entry)}`}
            >
              <EllipsisVertical class="size-4" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={6} class="w-44 rounded-xl border border-border bg-popover p-1">
          <DropdownMenu.Item
            class={menuItemClass}
            onclick={() => openDetail(entry)}
          >
            View / edit
          </DropdownMenu.Item>
          {#if onmanage}
            <DropdownMenu.Item class={menuItemClass} onclick={() => onmanage?.(entry.id)}>
              Manage classes
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </td>
  {/snippet}
  {#snippet card(entry: StaffDirectoryRow)}
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-start justify-between gap-3">
        <PersonCell
          name={staffName(entry)}
          photo={entry.staffPhoto}
          colorful
          secondary={entry.designation ?? entry.department ?? "—"}
          tertiary={entry.email ?? entry.mobile ?? "No contact"}
        />
        <StatusPill
          label={entry.active ? "Active" : "Inactive"}
          tone={entry.active ? "active" : "muted"}
        />
      </div>
      <div class="mt-3 flex justify-end">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-11 rounded-full text-muted-foreground sm:size-9"
                aria-label={`Actions for ${staffName(entry)}`}
              >
                <EllipsisVertical class="size-4" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} class="w-44 rounded-xl border border-border bg-popover p-1">
            <DropdownMenu.Item class={menuItemClass} onclick={() => openDetail(entry)}>
              View / edit
            </DropdownMenu.Item>
            {#if onmanage}
              <DropdownMenu.Item class={menuItemClass} onclick={() => onmanage?.(entry.id)}>
                Manage classes
              </DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  {/snippet}
</PeopleTable>

<PeoplePager page={page} pageSize={pageSize} total={total} onpage={onpage} onpagesize={onpagesize} />

{#if tempPassword}
  <div class="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
    Temporary password (shown once): <span class="font-mono font-semibold">{tempPassword}</span>
    <Button
      variant="link"
      size="sm"
      class="ml-2"
      onclick={() => (tempPassword = null)}
    >
      Dismiss
    </Button>
  </div>
{/if}

<StaffCreateDialog
  bind:open={createOpen}
  {options}
  pending={pending}
  error={createOpen ? error : null}
  onsubmit={handleCreate}
/>

<StaffDetailDialog
  bind:open={detailOpen}
  staff={editing}
  pending={pending}
  error={detailOpen ? error : null}
  {photoUrl}
  {uploading}
  onsave={handleSave}
  onremove={handleRemove}
  onphoto={handlePhoto}
  onmanage={onmanage && editing ? () => onmanage(editing!.id) : undefined}
/>
