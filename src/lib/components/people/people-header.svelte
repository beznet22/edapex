<script lang="ts">
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import UserPlus from "@lucide/svelte/icons/user-plus";
  import GraduationCap from "@lucide/svelte/icons/graduation-cap";
  import Users from "@lucide/svelte/icons/users";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import PeopleSearch from "./people-search.svelte";

  let {
    q,
    canManage,
    onSearch,
    onAddStaff,
    onAddStudent,
    onManageAssignments,
    onSelfSettings,
    onAddClass,
  }: {
    q: string;
    canManage: boolean;
    onSearch: (query: string) => void;
    onAddStaff?: () => void;
    onAddStudent?: () => void;
    onManageAssignments?: () => void;
    onSelfSettings?: () => void;
    onAddClass?: () => void;
  } = $props();

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const itemClass =
    "min-h-11 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
</script>

<header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div class="min-w-0">
    <h1
      class="text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl lg:text-4xl"
    >
      People
    </h1>
    <p class="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">
      {canManage
        ? "Staff, parents and students across your school."
        : "Students in the classes assigned to you."}
    </p>
  </div>

  <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
    <PeopleSearch value={q} {onSearch} />

    {#if onAddClass}
      <Button class="w-full sm:w-auto" onclick={onAddClass}>Add class</Button>
    {/if}

    {#if canManage}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button {...props} class="w-full gap-1.5 sm:w-auto">
              New
              <ChevronDown class="size-4 opacity-80" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          class="w-56 rounded-xl border border-border bg-popover p-1"
        >
          <DropdownMenu.Item
            disabled={!onAddStaff}
            onclick={() => onAddStaff?.()}
            class={itemClass}
          >
            <UserPlus class="mr-3 size-4 text-muted-foreground" />
            Add staff
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={!onAddStudent}
            onclick={() => onAddStudent?.()}
            class={itemClass}
          >
            <GraduationCap class="mr-3 size-4 text-muted-foreground" />
            Add student
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={!onManageAssignments}
            onclick={() => onManageAssignments?.()}
            class={itemClass}
          >
            <Users class="mr-3 size-4 text-muted-foreground" />
            Manage assignments
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={!onSelfSettings}
            onclick={() => onSelfSettings?.()}
            class={itemClass}
          >
            <Settings2 class="mr-3 size-4 text-muted-foreground" />
            Self-assignment settings
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
</header>
