<script lang="ts">
  import { goto, pushState } from "$app/navigation";
  import { signout } from "$lib/api/auth.remote";
  import { usePWA } from "$lib/context/pwa.svelte";
  import { getTheme } from "@sejohnson/svelte-themes";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { clearLocalStore } from "$lib/utils/index";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import UserIcon from "@lucide/svelte/icons/user";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import LifeBuoyIcon from "@lucide/svelte/icons/life-buoy";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import MinimizeIcon from "@lucide/svelte/icons/minimize";
  import SunIcon from "@lucide/svelte/icons/sun";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import { SelectedClass } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn";
  import { Badge } from "./ui/badge";

  let { user, hideDetails = false }: { user?: AuthUser, hideDetails?: boolean } = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();
  const pwa = usePWA();
  const theme = getTheme();

  let designationLabel = $derived.by(() => {
    if (userContext.isIt) return "IT";
    if (userContext.isCoordinator) return "Coordinator";
    if (userContext.isTeacher) return "Class Teacher";
    return "Staff";
  });

  let workspaceLockLabel = $derived.by(() => {
    if (!userContext.assignedSection) return null;
    const s = userContext.assignedSection;
    return `${s.className} ${s.sectionName}`;
  });
  let displayContext = $derived(
    userContext.isTeacher && userContext.assignedSection
      ? `${userContext.assignedSection.className} (${userContext.assignedSection.sectionName})`
      : selectedClass.data
        ? `${selectedClass.data.className} (${selectedClass.data.sectionName})`
        : user?.email || "Guest",
  );

  let groupedClasses = $derived(() => {
    const groups: Record<string, any[]> = {
      "CRECHE": [],
      "NURSERY": [],
      "GRADEK": [],
      "LOWER BASIC": [],
      "MIDDLE BASIC": [],
      "OTHER": []
    };
    
    for (const cls of userContext?.classes || []) {
      const name = cls.className?.toUpperCase() || "";
      if (name.includes("CREACH") || name.includes("CRECHE") || name.includes("DAYCARE")) {
        groups["CRECHE"].push(cls);
      } else if (name.includes("NURSERY")) {
        groups["NURSERY"].push(cls);
      } else if (name.includes("GRADE K") || name.includes("GRADEK") || name.includes("GRADE")) {
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

{#snippet menuContent()}
  <DropdownMenu.Label class="p-1 font-normal">
    <div class="flex items-center gap-2.5 px-2 py-2 text-start text-sm border-b border-primary/5 pb-2.5 mb-1.5">
      <img
        src={`https://avatar.vercel.sh/${user?.email || "user"}`}
        alt={user?.email ?? "User Avatar"}
        width={32}
        height={32}
        class="rounded-full size-8 object-cover border border-primary/10"
      />
      <div class="grid flex-1 text-start text-sm leading-tight min-w-0">
        <span class="truncate font-bold text-sidebar-foreground text-[13px]"
          >{user?.fullName || "Guest"}</span
        >
        <span class="truncate text-xs text-muted-foreground/80">{displayContext}</span>
      </div>
    </div>
  </DropdownMenu.Label>

  <!-- Designation + Workspace Badges -->
  <div class="flex flex-wrap gap-1.5 px-2 pb-2">
    <span class="workspace-badge workspace-badge--active">
      {designationLabel}
    </span>
    {#if workspaceLockLabel}
      <span class="workspace-badge workspace-badge--active">
        {workspaceLockLabel}
      </span>
    {:else}
      <span class="workspace-badge workspace-badge--unassigned">
        <TriangleAlertIcon class="size-3" />
        Unassigned
      </span>
    {/if}
    {#if userContext.isCoordinator || userContext.isIt}
      <Badge
        variant="outline"
        class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-1 py-0 rounded-lg uppercase tracking-wider"
        >#Ext</Badge
      >
      <Badge
        variant="outline"
        class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-1 py-0 rounded-lg uppercase tracking-wider"
        >#Pub</Badge
      >
    {/if}
  </div>

  <DropdownMenu.Separator class="bg-primary/10 my-1" />
  <DropdownMenu.Group>
    <DropdownMenu.Item class="flex items-center gap-2.5 px-2.5 py-2 min-h-12 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200 hover:bg-primary/10 hover:text-primary text-[13px] font-semibold text-sidebar-foreground/80 focus:bg-primary/10 focus:text-primary focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60">
      <SparklesIcon />
      Try Plus free
    </DropdownMenu.Item>
  </DropdownMenu.Group>
  <DropdownMenu.Separator class="bg-primary/10 my-1" />
  <DropdownMenu.Group>
    <DropdownMenu.Item class="flex items-center gap-2.5 px-2.5 py-2 min-h-12 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200 hover:bg-primary/10 hover:text-primary text-[13px] font-semibold text-sidebar-foreground/80 focus:bg-primary/10 focus:text-primary focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60">
      <UserIcon />
      Profile
    </DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => pwa.toggleFullscreen()} class="flex items-center gap-2.5 px-2.5 py-2 min-h-12 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200 hover:bg-primary/10 hover:text-primary text-[13px] font-semibold text-sidebar-foreground/80 focus:bg-primary/10 focus:text-primary focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60">
      {#if pwa.isFullscreen}
        <MinimizeIcon />
        Exit Focus Mode
      {:else}
        <MaximizeIcon />
        Focus Mode
      {/if}
    </DropdownMenu.Item>
  </DropdownMenu.Group>
  <DropdownMenu.Separator class="bg-primary/10 my-1" />
  <DropdownMenu.Group>
    <DropdownMenu.Item class="flex items-center gap-2.5 px-2.5 py-2 min-h-12 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200 hover:bg-primary/10 hover:text-primary text-[13px] font-semibold text-sidebar-foreground/80 focus:bg-primary/10 focus:text-primary focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60">
      <LifeBuoyIcon />
      Help
    </DropdownMenu.Item>
    <DropdownMenu.Item
      onSelect={async () => {
        if (sidebar.isMobile) sidebar.setOpenMobile(false);
        const result = await signout();
        if (result) {
          clearLocalStore("selected-class");
          goto("/signin");
        }
      }}
      class="flex items-center gap-2.5 px-2.5 py-2 min-h-12 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive text-[13px] font-semibold text-sidebar-foreground/80 focus:bg-destructive/10 focus:text-destructive focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-60"
    >
      <LogOutIcon />
      Log out
    </DropdownMenu.Item>
  </DropdownMenu.Group>
{/snippet}

{#if hideDetails}
  <div class="flex w-full justify-center">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="flex size-12 min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full overflow-hidden transition-all hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <img
              src={`https://avatar.vercel.sh/${user?.email || "user"}`}
              alt={user?.email ?? "User Avatar"}
              width={40}
              height={40}
              class="size-12 rounded-full object-cover"
            />
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="hermes-glass border-primary/20 min-w-56 p-1.5 shadow-2xl rounded-2xl"
        side="right"
        align="end"
        sideOffset={12}
      >
        {@render menuContent()}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
{:else}
  <Sidebar.Menu>
    <Sidebar.MenuItem>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Sidebar.MenuButton
              size="lg"
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              {...props}
            >
              <img
                src={`https://avatar.vercel.sh/${user?.email || "user"}`}
                alt={user?.email ?? "User Avatar"}
                width={32}
                height={32}
                class="rounded-full size-8 object-cover"
              />
              <div class="grid flex-1 text-start text-sm leading-tight">
                <span class="truncate font-medium">{user?.fullName || "Guest"}</span>
                <span class="text-muted-foreground truncate text-xs">{user?.email || "m@example.com"}</span>
              </div>
              <ChevronsUpDownIcon class="ms-auto size-4" />
            </Sidebar.MenuButton>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          class="hermes-glass border-primary/20 w-(--bits-dropdown-menu-anchor-width) min-w-56 p-1.5 shadow-2xl rounded-2xl"
          side={sidebar.isMobile ? "bottom" : "right"}
          align="end"
          sideOffset={4}
        >
          {@render menuContent()}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Sidebar.MenuItem>
  </Sidebar.Menu>
{/if}
