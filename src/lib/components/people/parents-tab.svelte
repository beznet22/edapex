<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import { Button } from "$lib/components/ui/button";
  import { submitPeopleAction } from "./people-action-response";
  import PeopleTable from "./people-table.svelte";
  import PeoplePager from "./people-pager.svelte";
  import PersonCell from "./person-cell.svelte";
  import StatusPill from "./status-pill.svelte";
  import ParentBadges from "./parent-badges.svelte";
  import ParentEditDialog from "./parent-edit-dialog.svelte";
  import { isNonGmail } from "$lib/people/people-display";
  import type { PageSize } from "$lib/people/people-url";
  import type { ParentDirectoryRow } from "$lib/server/people/people-types";

  let {
    rows,
    total,
    yearFallback,
    sort,
    dir,
    page,
    pageSize,
    onsort,
    onpage,
    onpagesize,
  }: {
    rows: ParentDirectoryRow[];
    total: number;
    yearFallback: boolean;
    sort: string;
    dir: "asc" | "desc";
    page: number;
    pageSize: number;
    onsort: (key: string) => void;
    onpage: (page: number) => void;
    onpagesize: (size: PageSize) => void;
  } = $props();

  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "email", label: "Contact", sortable: true },
    { key: "status", label: "Account", sortable: true },
    { key: "flags", label: "Flags" },
    { key: "actions", label: "Actions", align: "right" as const },
  ];

  let editing = $state<ParentDirectoryRow | null>(null);
  let editOpen = $state(false);
  let pending = $state(false);
  let error = $state<string | null>(null);

  function openEdit(row: ParentDirectoryRow): void {
    editing = row;
    error = null;
    editOpen = true;
  }

  async function handleSave(payload: FormData): Promise<void> {
    pending = true;
    error = null;
    try {
      const reply = await submitPeopleAction("?/updateParentContact", payload);
      if (reply.kind !== "success") {
        error = reply.error;
        return;
      }
      await invalidateAll();
      editOpen = false;
      editing = null;
      toast.success("Contact updated");
    } finally {
      pending = false;
    }
  }

  const menuItemClass =
    "min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9";
</script>

{#if yearFallback}
  <p class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
    No parents found in the active academic year. Showing all academic years.
  </p>
{/if}

<PeopleTable columns={columns} rows={rows} {sort} {dir} onsort={onsort}>
  {#snippet row(entry: ParentDirectoryRow)}
    <td class="px-3 py-3"><PersonCell name={entry.name} colorful /></td>
    <td class="px-3 py-3 text-sm text-muted-foreground">
      <p class="truncate">{entry.email ?? "No email"}</p>
      {#if entry.phone}
        <p class="truncate text-xs">{entry.phone}</p>
      {/if}
    </td>
    <td class="px-3 py-3">
      <StatusPill
        label={entry.linked ? "Linked" : "Unlinked"}
        tone={entry.linked ? "active" : "muted"}
      />
    </td>
    <td class="px-3 py-3">
      <ParentBadges
        nonGmail={isNonGmail(entry.email)}
        duplicateCount={entry.duplicateCount}
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
              aria-label={`Actions for ${entry.name}`}
            >
              <EllipsisVertical class="size-4" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={6} class="w-44 rounded-xl border border-border bg-popover p-1">
          <DropdownMenu.Item class={menuItemClass} onclick={() => openEdit(entry)}>
            Edit contact
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </td>
  {/snippet}
  {#snippet card(entry: ParentDirectoryRow)}
    <div class="rounded-xl border border-border bg-card p-4">
      <div class="flex items-start justify-between gap-3">
        <PersonCell
          name={entry.name}
          colorful
          secondary={entry.email ?? "No email"}
          tertiary={entry.phone ?? null}
        />
        <StatusPill
          label={entry.linked ? "Linked" : "Unlinked"}
          tone={entry.linked ? "active" : "muted"}
        />
      </div>
      <div class="mt-2 flex items-center justify-between gap-3">
        <ParentBadges
          nonGmail={isNonGmail(entry.email)}
          duplicateCount={entry.duplicateCount}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-11 rounded-full text-muted-foreground sm:size-9"
                aria-label={`Actions for ${entry.name}`}
              >
                <EllipsisVertical class="size-4" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" sideOffset={6} class="w-44 rounded-xl border border-border bg-popover p-1">
            <DropdownMenu.Item class={menuItemClass} onclick={() => openEdit(entry)}>
              Edit contact
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  {/snippet}
</PeopleTable>

<PeoplePager page={page} pageSize={pageSize} total={total} onpage={onpage} onpagesize={onpagesize} />

<ParentEditDialog
  bind:open={editOpen}
  parent={editing}
  pending={pending}
  error={editOpen ? error : null}
  onsave={handleSave}
/>
