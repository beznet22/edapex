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
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { ComponentProps } from "svelte";
  import NavUser from "./nav-user.svelte";
  import { Tooltip, TooltipContent, TooltipTrigger } from "$lib/components/ui/tooltip/index.js";
  import { SidebarHistory } from "./sidebar-history";
  import { Badge } from "./ui/badge";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import CommandIcon from "@lucide/svelte/icons/command";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import SearchIcon from "@lucide/svelte/icons/search";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import { cn } from "$lib/utils/shadcn";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import { Button } from "./ui/button";
  import { goto, pushState } from "$app/navigation";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedClass } from "$lib/context/sync.svelte";

  type SidebarProps = {
    user?: AuthUser;
    ref?: HTMLElement | null;
  } & ComponentProps<typeof Sidebar.Root>;

  let { user, ref = $bindable(null), ...restProps }: SidebarProps = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();
  const theme = getTheme();

  let activeWorkspaceNav = $state("orchestrator");
  let hasBackgroundTasks = $state(false);
  let dropdownOpen = $state(false);


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
  let unreadInbox = $state(0);
  let sessionFilter = $state("");

  let displayContext = $derived(
    userContext.isTeacher && userContext.assignedSection
      ? `${userContext.assignedSection.className} (${userContext.assignedSection.sectionName})`
      : selectedClass.data
        ? `${selectedClass.data.className} (${selectedClass.data.sectionName})`
        : "Workspace Context",
  );

  function handleNewSession() {
    sidebar.setOpenMobile(false);
    goto("/", { invalidateAll: true });
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      handleNewSession();
    }
  }

  $effect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<Sidebar.Root
  bind:ref
  collapsible="icon"
  class="overflow-hidden *:data-[sidebar=sidebar]:flex-row bg-sidebar border-r-0"
  {...restProps}
>
  <!-- Panel 1: The Rail -->
  <Sidebar.Root
    collapsible="none"
    class="w-16! border-e border-sidebar-border/10 bg-sidebar shrink-0 h-full"
  >
    <Sidebar.Header class="items-center py-4">
      <a
        href="/"
        class="flex aspect-square size-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 cursor-pointer overflow-hidden"
      >
        <img src="/logo.svg" alt="Hermes" class="size-6 dark:invert" />
      </a>
    </Sidebar.Header>

    <Sidebar.Content class="items-center py-2 gap-4">
      <Sidebar.Group class="p-0 w-full items-center">
        <Sidebar.GroupContent class="flex flex-col gap-2 w-full items-center">
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="size-12 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent group relative transition-colors"
                >
                  <LayoutDashboardIcon class="size-5" />
                  {#if hasBackgroundTasks}
                    <span
                      class="absolute top-3.5 right-3.5 size-1.5 bg-primary rounded-full border border-sidebar"
                    ></span>
                  {/if}
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Dashboard</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="size-12 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 group relative transition-all"
                >
                  <FolderIcon class="size-5" />
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Workspace</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="size-12 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent group relative transition-colors"
                >
                  <InboxIcon class="size-5" />
                  {#if unreadInbox > 0}
                    <span
                      class="absolute top-3.5 right-3.5 size-1.5 bg-primary rounded-full border border-sidebar"
                    ></span>
                  {/if}
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Inbox</TooltipContent>
          </Tooltip>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>

    <Sidebar.Footer class="flex flex-col items-center gap-2 pb-4">
      <div class="flex flex-col items-center gap-1.5 pb-2 w-full border-b border-sidebar-border/50">
        <Tooltip delayDuration={0}>
          <TooltipTrigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="size-10 rounded-full flex items-center justify-center text-sidebar-foreground/50 hover:text-primary hover:bg-primary/10 hover:shadow-[0_0_15px_rgba(var(--color-primary),0.2)] transition-all duration-300"
                onclick={() => {
                  if (sidebar.isMobile) sidebar.setOpenMobile(false);
                  pushState("", { showModal: true });
                }}
              >
                <SettingsIcon class="size-[22px]" />
              </button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} class="hermes-glass text-xs font-bold border-sidebar-border">
            Settings
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={0}>
          <TooltipTrigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="size-10 rounded-full flex items-center justify-center text-sidebar-foreground/50 hover:text-primary hover:bg-primary/10 hover:shadow-[0_0_15px_rgba(var(--color-primary),0.2)] transition-all duration-300"
                onclick={() => {
                  theme.selectedTheme = theme.resolvedTheme === "dark" ? "light" : "dark";
                }}
              >
                {#if theme.resolvedTheme === "dark"}
                  <MoonIcon class="size-[22px]" />
                {:else}
                  <SunIcon class="size-[22px]" />
                {/if}
              </button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} class="hermes-glass text-xs font-bold border-sidebar-border">
            Toggle Theme
          </TooltipContent>
        </Tooltip>
      </div>

      <div class="w-full flex justify-center mt-1">
        <NavUser {user} hideDetails={true} />
      </div>
    </Sidebar.Footer>
  </Sidebar.Root>

  <!-- Panel 2: Contextual Workspace Sidebar -->
  <Sidebar.Root
    collapsible="none"
    class="hidden flex-1 md:flex bg-sidebar-accent/5 h-full"
  >
    <Sidebar.Header
      class="gap-4 border-b border-sidebar-border/10 p-4 bg-transparent"
    >
      <div class="flex w-full items-center justify-between">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                class="w-full justify-between px-2 font-bold text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent tracking-tight"
              >
                Workspace
                <ChevronDownIcon class="size-3.5 opacity-30" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="w-64 bg-sidebar border-sidebar-border"
            align="start"
          >
            <DropdownMenu.Label
              class="text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-3 py-2"
              >Select Workspace</DropdownMenu.Label
            >
            {#each workspaceNavItems as item (item.value)}
              <DropdownMenu.Item
                onSelect={() => {
                  activeWorkspaceNav = item.value;
                }}
                class="text-sm px-3 py-2 text-sidebar-foreground/70 focus:bg-sidebar-accent focus:text-sidebar-accent-foreground cursor-pointer transition-colors"
              >
                {item.title}
                {#if activeWorkspaceNav === item.value}
                  <CommandIcon class="ml-auto size-3.5 opacity-50" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <Button
        variant="secondary"
        size="sm"
        class="w-full justify-start gap-2.5 text-[11px] font-bold h-10 bg-sidebar-accent/50 hover:bg-sidebar-accent text-sidebar-foreground/60 border border-sidebar-border rounded-xl transition-all"
        onclick={handleNewSession}
      >
        <PlusIcon class="size-4 text-primary/80" />
        New Session
        <kbd
          class="ml-auto rounded-lg bg-background/50 px-2 py-0.5 text-[0.6rem] font-mono text-sidebar-foreground/20 border border-sidebar-border"
          >⌘K</kbd
        >
      </Button>

      <div class="relative group">
        <SearchIcon
          class="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 text-sidebar-foreground/10 group-focus-within:text-primary/50 transition-colors pointer-events-none"
        />
        <input
          type="text"
          placeholder="Filter sessions..."
          class="h-10 w-full rounded-xl border border-sidebar-border bg-background/30 pl-10 pr-3 text-xs text-sidebar-foreground/80 placeholder:text-sidebar-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 transition-all font-medium"
          bind:value={sessionFilter}
        />
      </div>

      {#if userContext.isCoordinator || userContext.isIt}
        <div class="flex gap-2 overflow-x-auto scrollbar-hide py-1">
          {#if userContext.assignedSection}
            <Badge
              variant="secondary"
              class="shrink-0 text-[10px] font-black tracking-tight bg-primary/20 text-primary border-primary/20 px-2.5 py-1 rounded-lg"
            >
              @{userContext.assignedSection.className}{userContext
                .assignedSection.sectionName}
            </Badge>
          {/if}
          <Badge
            variant="outline"
            class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-2.5 py-1 rounded-lg uppercase tracking-wider"
            >#Ext</Badge
          >
          <Badge
            variant="outline"
            class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-2.5 py-1 rounded-lg uppercase tracking-wider"
            >#Pub</Badge
          >
        </div>
      {/if}
    </Sidebar.Header>

    <Sidebar.Content class="scrollbar-hide bg-transparent">
      <SidebarHistory {user} />
    </Sidebar.Content>

    <Sidebar.Footer class="border-t border-sidebar-border/30 bg-transparent p-2">
      {#if user?.designation && user.designation !== "class_teacher"}
        <DropdownMenu.Root bind:open={dropdownOpen}>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button {...props} class="relative w-full flex flex-col px-4 py-3 rounded-xl hermes-glass border-transparent hover:border-primary/30 transition-all duration-300 text-left group/trigger overflow-hidden shadow-sm hover:shadow-primary/10">
                <div class="absolute inset-0 bg-primary/0 group-hover/trigger:bg-primary/10 blur-xl transition-colors duration-500"></div>
                <div class="flex items-center justify-between w-full relative z-10">
                  <span class="text-[10px] font-black tracking-widest uppercase text-sidebar-foreground/50 group-hover/trigger:text-primary/80 transition-colors">Workspace Context</span>
                  <ChevronDownIcon class="size-4 opacity-40 group-hover/trigger:opacity-100 group-hover/trigger:text-primary transition-all duration-300 transform group-hover/trigger:translate-y-0.5" />
                </div>
                <span class="text-[13px] font-bold tracking-wide truncate shrink-0 mt-1 relative z-10 group-hover/trigger:text-primary transition-colors">{displayContext}</span>
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="hermes-glass border-primary/20 min-w-[260px] max-h-[340px] overflow-y-auto p-1.5 shadow-2xl custom-scrollbar rounded-2xl"
            side="top"
            align="center"
            sideOffset={12}
          >
            {#each groupedClasses() as [groupName, classes], i}
              <DropdownMenu.Group>
                <DropdownMenu.Label class="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2.5 py-2">
                  {groupName}
                </DropdownMenu.Label>
                {#each classes as cls (cls.id)}
                  <DropdownMenu.Item
                    onSelect={() => (selectedClass.data = cls)}
                    class={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer mb-0.5 last:mb-0 transition-all duration-200",
                      selectedClass.data?.id === cls.id ? "bg-primary/15 text-primary shadow-sm" : "hover:bg-primary/5"
                    )}
                  >
                    <div class="flex min-w-0 flex-1 justify-between items-center">
                      <span class="text-[13px] font-semibold truncate leading-tight">{cls.className}</span>
                      <span class={cn(
                        "opacity-70 truncate rounded-lg flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 ml-2 transition-colors",
                        selectedClass.data?.id === cls.id ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-secondary/60 text-muted-foreground"
                      )}>{cls.sectionName || "Univ"}</span>
                    </div>
                    {#if selectedClass.data?.id === cls.id}
                      <CircleCheckIcon class="size-4 text-primary ml-1 shrink-0" />
                    {/if}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Group>
            {:else}
              <div class="px-3 py-8 text-center text-xs text-muted-foreground/60 italic font-medium">
                No classes assigned to this account
              </div>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {:else}
        <div class="flex flex-col px-4 py-3">
          <span class="text-[10px] font-black tracking-widest uppercase text-sidebar-foreground/50">Workspace Context</span>
          <span class="text-xs font-bold truncate shrink-0 mt-0.5">{displayContext}</span>
        </div>
      {/if}
    </Sidebar.Footer>
  </Sidebar.Root>
</Sidebar.Root>
