<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import Funnel from "@lucide/svelte/icons/funnel";
  import type {
    ParentSort,
    ParentStatus,
    PeopleFilters,
    SortDir,
    StaffSort,
    StaffStatus,
  } from "$lib/server/people/people-types";
  import type { PeopleUrlPatch } from "$lib/people/people-url";

  const STAFF_STATUS_OPTIONS: { value: StaffStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "no_email", label: "No email" },
    { value: "linked", label: "Linked" },
    { value: "unlinked", label: "Unlinked" },
  ];

  const PARENT_STATUS_OPTIONS: { value: ParentStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "linked", label: "Linked" },
    { value: "unlinked", label: "Unlinked" },
    { value: "no_email", label: "No email" },
    { value: "non_gmail", label: "Non-Gmail" },
    { value: "duplicate", label: "Duplicate" },
  ];

  const STAFF_SORT_OPTIONS: { value: StaffSort; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "role", label: "Role" },
    { value: "status", label: "Status" },
  ];

  const PARENT_SORT_OPTIONS: { value: ParentSort; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "status", label: "Account" },
    { value: "email", label: "Email" },
  ];

  let {
    filters,
    onChange,
  }: {
    filters: PeopleFilters;
    onChange: (patch: PeopleUrlPatch) => void;
  } = $props();

  const statusOptions = $derived(
    filters.tab === "staff" ? STAFF_STATUS_OPTIONS : PARENT_STATUS_OPTIONS
  );
  const sortOptions = $derived(
    filters.tab === "staff" ? STAFF_SORT_OPTIONS : PARENT_SORT_OPTIONS
  );

  const activeCount = $derived(
    (filters.status !== "all" ? 1 : 0) +
      (filters.sort !== "name" ? 1 : 0) +
      (filters.dir !== "asc" ? 1 : 0) +
      (filters.tab === "staff" && filters.includeInactive ? 1 : 0) +
      (filters.tab === "parents" && filters.allYears ? 1 : 0)
  );

  function isStaffSort(value: string): value is StaffSort {
    return STAFF_SORT_OPTIONS.some((option) => option.value === value);
  }

  function isParentSort(value: string): value is ParentSort {
    return PARENT_SORT_OPTIONS.some((option) => option.value === value);
  }

  function setStatus(status: StaffStatus | ParentStatus): void {
    onChange({ status });
  }

  function setDir(dir: SortDir): void {
    onChange({ dir });
  }

  const sortSelectOptions = $derived(
    sortOptions.map((option) => ({ value: option.value, label: option.label }))
  );

  function handleSortChange(next: string): void {
    if (filters.tab === "staff" && isStaffSort(next)) {
      onChange({ sort: next });
    } else if (filters.tab === "parents" && isParentSort(next)) {
      onChange({ sort: next });
    }
  }

  function reset(): void {
    onChange({
      status: "all",
      sort: "name",
      dir: "asc",
      includeInactive: false,
      allYears: false,
    });
  }
</script>

{#if filters.tab !== "students"}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="outline" size="sm" class="gap-2">
          <Funnel class="size-4" />
          <span class="hidden sm:inline">Filter</span>
          {#if activeCount > 0}
            <Badge class="px-1.5">{activeCount}</Badge>
          {/if}
        </Button>
      {/snippet}
    </Popover.Trigger>

    <Popover.Content
      align="start"
      sideOffset={8}
      class="w-72 rounded-xl border border-border bg-popover p-4 sm:w-64"
    >
      <div class="space-y-4">
        <fieldset>
          <legend class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </legend>
          <div class="mt-2 flex flex-wrap gap-2">
            {#each statusOptions as option}
              <Button
                size="sm"
                variant={filters.status === option.value ? "default" : "outline"}
                aria-pressed={filters.status === option.value}
                onclick={() => setStatus(option.value)}
              >
                {option.label}
              </Button>
            {/each}
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Label for="people-sort" class="text-xs uppercase tracking-wide text-muted-foreground">
              Sort
            </Label>
            <PeopleSelect
              id="people-sort"
              ariaLabel="Sort by"
              value={filters.sort}
              options={sortSelectOptions}
              onchange={handleSortChange}
            />
          </div>

          <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Direction
            <div class="mt-2 flex gap-1">
              <Button
                size="sm"
                variant={filters.dir === "asc" ? "default" : "outline"}
                aria-pressed={filters.dir === "asc"}
                class="flex-1"
                onclick={() => setDir("asc")}
              >
                Asc
              </Button>
              <Button
                size="sm"
                variant={filters.dir === "desc" ? "default" : "outline"}
                aria-pressed={filters.dir === "desc"}
                class="flex-1"
                onclick={() => setDir("desc")}
              >
                Desc
              </Button>
            </div>
          </div>
        </div>

        {#if filters.tab === "staff"}
          <div class="flex min-h-11 items-center gap-2">
            <Checkbox
              id="people-include-inactive"
              checked={filters.includeInactive}
              onCheckedChange={(next) => onChange({ includeInactive: next === true })}
            />
            <Label for="people-include-inactive" class="text-sm font-normal text-foreground">
              Include removed people
            </Label>
          </div>
        {/if}

        {#if filters.tab === "parents"}
          <div class="flex min-h-11 items-center gap-2">
            <Checkbox
              id="people-all-years"
              checked={filters.allYears}
              onCheckedChange={(next) => onChange({ allYears: next === true })}
            />
            <Label for="people-all-years" class="text-sm font-normal text-foreground">
              All academic years
            </Label>
          </div>
        {/if}

        {#if activeCount > 0}
          <Button variant="link" size="sm" onclick={reset}>Reset filters</Button>
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>
{/if}
