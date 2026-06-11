<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedClass } from "$lib/context/sync.svelte";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import { cn } from "$lib/utils/shadcn";

  let {
    user,
  }: {
    user?: any;
  } = $props();

  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();

  let groupedClasses = $derived(() => {
    const groups: Record<string, any[]> = {
      CRECHE: [],
      NURSERY: [],
      GRADEK: [],
      "LOWER BASIC": [],
      "MIDDLE BASIC": [],
      OTHER: [],
    };

    for (const cls of userContext?.classes || []) {
      const name = cls.className?.toUpperCase() || "";
      if (
        name.includes("CREACH") ||
        name.includes("CRECHE") ||
        name.includes("DAYCARE")
      ) {
        groups["CRECHE"].push(cls);
      } else if (name.includes("NURSERY")) {
        groups["NURSERY"].push(cls);
      } else if (
        name.includes("GRADE K") ||
        name.includes("GRADEK") ||
        name.includes("GRADE")
      ) {
        groups["GRADEK"].push(cls);
      } else if (name.includes("LOWER BASIC")) {
        groups["LOWER BASIC"].push(cls);
      } else if (name.includes("MIDDLE BASIC")) {
        groups["MIDDLE BASIC"].push(cls);
      } else {
        groups["OTHER"].push(cls);
      }
    }
    return Object.entries(groups).filter(([_, classes]) => classes.length > 0);
  });
</script>

{#if user?.designation && user.designation !== "class_teacher"}
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            size="sm"
            {...props}
            class="w-full text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <FolderIcon />
            <span>Workspace Context</span>
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="hermes-glass border-primary/20 min-w-[260px] max-h-[340px] overflow-y-auto p-1.5 shadow-2xl custom-scrollbar rounded-2xl"
        align="start"
        side="bottom"
      >
        {#each groupedClasses() as [groupName, classes], i}
          <DropdownMenu.Group>
            <DropdownMenu.Label
              class="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2.5 py-2"
            >
              {groupName}
            </DropdownMenu.Label>
            {#each classes as cls (cls.id)}
              <DropdownMenu.Item
                onSelect={() => (selectedClass.data = cls)}
                class={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-50",
                  selectedClass.data?.id === cls.id
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "hover:bg-primary/5",
                )}
              >
                <div class="flex min-w-0 flex-1 justify-between items-center">
                  <span class="text-[13px] font-semibold truncate leading-tight"
                    >{cls.className}</span
                  >
                  <span
                    class={cn(
                      "opacity-70 truncate rounded-lg flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 ml-2 transition-colors",
                      selectedClass.data?.id === cls.id
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "bg-secondary/60 text-muted-foreground",
                    )}>{cls.sectionName || "Univ"}</span
                  >
                </div>
                {#if selectedClass.data?.id === cls.id}
                  <CircleCheckIcon class="size-4 text-primary ml-1 shrink-0" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Group>
        {:else}
          <div
            class="px-3 py-8 text-center text-xs text-muted-foreground/60 italic font-medium"
          >
            No classes assigned to this account
          </div>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
{/if}
