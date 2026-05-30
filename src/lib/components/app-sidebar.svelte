<script lang="ts" module>
  const workspaceNavItems = [
    { title: "Chat", value: "chat" },
    { title: "Schedule", value: "schedule" },
    { title: "Skills", value: "skills" },
    { title: "Files", value: "files" },
    { title: "Memory", value: "memory" },
    { title: "Workspace", value: "workspace" },
    { title: "Profiles", value: "profiles" },
    { title: "Tasks", value: "tasks" },
  ] as const;
</script>

<script lang="ts">
  import { getTheme } from "@sejohnson/svelte-themes";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import NavSecondary from "./nav-secondary.svelte";
  import NavMain from "./nav-main.svelte";
  import WorkspaceSwitcher from "./workspace-switcher.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { ComponentProps } from "svelte";
  import NavUser from "./nav-user.svelte";
  import { SidebarHistory } from "./sidebar-history";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import SearchIcon from "@lucide/svelte/icons/search";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { goto, pushState } from "$app/navigation";
  import { UserContext } from "$lib/context/user-context.svelte";

  type SidebarProps = {
    user?: AuthUser;
    ref?: HTMLElement | null;
  } & ComponentProps<typeof Sidebar.Root>;

  let { user, ref = $bindable(null), ...restProps }: SidebarProps = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();
  const theme = getTheme();

  let activeWorkspaceNav = $state("orchestrator");
  let hasBackgroundTasks = $state(false);

  let unreadInbox = $state(0);
  let sessionFilter = $state("");

  function handleNewSession() {
    sidebar.setOpenMobile(false);
    goto("/", { invalidateAll: true });
  }
</script>

<Sidebar.Root bind:ref collapsible="icon" {...restProps}>
  <Sidebar.Header>
    <WorkspaceSwitcher items={workspaceNavItems} bind:activeItem={activeWorkspaceNav} />
  </Sidebar.Header>
  
  <Sidebar.Content class="scrollbar-hide">
    <!--
      TODO: Temporarily disabled pending re-architecture/re-strategy of main navigation functionalities.
      <NavMain 
        items={[
          { title: "Dashboard", icon: LayoutDashboardIcon, badge: hasBackgroundTasks },
          { title: "Workspace", icon: FolderIcon, isActive: true },
          { title: "Inbox", icon: InboxIcon, badge: unreadInbox > 0 }
        ]} 
      />
    -->
    
    <Sidebar.Group class="pt-0 pb-2">
      <Sidebar.GroupContent class="flex flex-col gap-2">
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton tooltipContent="New Session" onclick={handleNewSession} class="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors font-medium">
              <PlusIcon class="size-4 text-primary" />
              <span>New Session</span>
              <kbd class="ml-auto group-data-[collapsible=icon]:hidden rounded-md bg-background/50 px-1.5 py-0.5 text-[10px] font-mono text-sidebar-foreground/40 border border-sidebar-border">⌘K</kbd>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>

        <div class="relative group px-2 group-data-[collapsible=icon]:hidden">
          <SearchIcon class="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-sidebar-foreground/30 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter sessions..."
            bind:value={sessionFilter}
            class="h-9 w-full rounded-lg border border-sidebar-border bg-background/50 pl-8 pr-3 text-xs text-sidebar-foreground/80 placeholder:text-sidebar-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 transition-all"
          />
        </div>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <SidebarHistory {user} />

    <NavSecondary 
      class="mt-auto"
      {user}
      items={[
        {
          title: "Settings",
          icon: SettingsIcon,
          action: () => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
            pushState("", { showModal: true });
          }
        },
        {
          title: "Toggle Theme",
          icon: theme.resolvedTheme === "dark" ? MoonIcon : SunIcon,
          action: () => {
            theme.selectedTheme = theme.resolvedTheme === "dark" ? "light" : "dark";
          }
        }
      ]}
    />
  </Sidebar.Content>

  <Sidebar.Footer>
    <NavUser {user} />
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
