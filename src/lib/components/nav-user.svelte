<script lang="ts">
  import { goto } from "$app/navigation";
  import { signout } from "$lib/api/auth.remote";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { clearLocalStore } from "$lib/utils";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import UserIcon from "@lucide/svelte/icons/user";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import LifeBuoyIcon from "@lucide/svelte/icons/life-buoy";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { cn } from "$lib/utils/shadcn";

  let { user, hideDetails = false }: { user?: AuthUser, hideDetails?: boolean } = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();

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
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            {...props}
          >
            <img
              src={`https://avatar.vercel.sh/${user?.email || "user"}`}
              alt={user?.email ?? "User Avatar"}
              width={24}
              height={24}
              class="rounded-full"
            />
            <div
              class={cn(
                "grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden",
                hideDetails && "hidden"
              )}
            >
              <span class="truncate font-medium"
                >{user?.fullName || "Guest"}</span
              >
              <span class="text-muted-foreground truncate text-xs">
                {user?.email || "m@example.com"}</span
              >
            </div>

            {#if !hideDetails}
              <ChevronsUpDownIcon
                class="ms-auto size-4 group-data-[collapsible=icon]:hidden"
              />
            {/if}
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
        side={sidebar.isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenu.Label class="p-0 font-normal">
          <div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
            <img
              src={`https://avatar.vercel.sh/${user?.email || "user"}`}
              alt={user?.email ?? "User Avatar"}
              width={32}
              height={32}
              class="rounded-full"
            />
            <div class="grid flex-1 text-start text-sm leading-tight">
              <span class="truncate font-medium"
                >{user?.fullName || "Guest"}</span
              >
              <span class="truncate text-xs text-muted-foreground">{user?.email || "Guest"}</span>
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
        </div>

        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <SparklesIcon />
            Try Plus free
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <MoonIcon />
            Personalization
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <UserIcon />
            Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
          }}>
            <SettingsIcon />
            Settings
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
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
          >
            <LogOutIcon />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
