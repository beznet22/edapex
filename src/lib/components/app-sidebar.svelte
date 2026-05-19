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
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { cn } from "$lib/utils/shadcn";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { ComponentProps } from "svelte";
  import NavUser from "./nav-user.svelte";
  import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
  import { SidebarHistory } from "./sidebar-history";
  import { Badge } from "./ui/badge";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import CommandIcon from "@lucide/svelte/icons/command";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import InboxIcon from "@lucide/svelte/icons/inbox";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import SearchIcon from "@lucide/svelte/icons/search";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import MinimizeIcon from "@lucide/svelte/icons/minimize";
  import { Button } from "./ui/button";
  import { goto, pushState } from "$app/navigation";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedClass } from "$lib/context/sync.svelte";
  import { getTheme } from "@sejohnson/svelte-themes";
  import { usePWA } from "$lib/context/pwa.svelte";

  type SidebarProps = {
    user?: AuthUser;
    ref?: HTMLElement | null;
  } & ComponentProps<typeof Sidebar.Root>;

  let {
    user,
    ref = $bindable(null),
    ...restProps
  }: SidebarProps = $props();

  const sidebar = useSidebar();
  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();
  const theme = getTheme();
  const pwa = usePWA();

  let activeWorkspaceNav = $state("orchestrator");
  let hasBackgroundTasks = $state(false);
  let unreadInbox = $state(0);
  let sessionFilter = $state("");

  let displayContext = $derived(
    userContext.isTeacher && userContext.assignedSection
      ? `${userContext.assignedSection.className} (${userContext.assignedSection.sectionName})`
      : selectedClass.data
        ? `${selectedClass.data.className} (${selectedClass.data.sectionName})`
        : "Workspace Context"
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
  <Sidebar.Root collapsible="none" class="w-16! border-e border-sidebar-border/10 bg-sidebar shrink-0 h-full">
    <Sidebar.Header class="items-center py-4">
      <div class="flex aspect-square size-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 cursor-pointer overflow-hidden">
        <img src="/logo.svg" alt="Hermes" class="size-6 dark:invert" />
      </div>
    </Sidebar.Header>

    <Sidebar.Content class="items-center py-2 gap-4">
      <Sidebar.Group class="p-0 items-center">
        <Sidebar.GroupContent class="flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="size-12 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent group relative transition-colors">
                  <LayoutDashboardIcon class="size-5" />
                  {#if hasBackgroundTasks}
                    <span class="absolute top-3.5 right-3.5 size-1.5 bg-primary rounded-full border border-sidebar"></span>
                  {/if}
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Dashboard</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="size-12 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 group relative transition-all">
                  <FolderIcon class="size-5" />
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Workspace</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon" class="size-12 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent group relative transition-colors">
                  <InboxIcon class="size-5" />
                  {#if unreadInbox > 0}
                    <span class="absolute top-3.5 right-3.5 size-1.5 bg-primary rounded-full border border-sidebar"></span>
                  {/if}
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right">Inbox</TooltipContent>
          </Tooltip>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>

    <Sidebar.Footer class="items-center pb-4 gap-2">
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-10 rounded-xl text-sidebar-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
              onclick={() => pwa.toggleFullscreen()}
            >
              {#if pwa.isFullscreen}
                <MinimizeIcon class="size-4.5" />
              {:else}
                <MaximizeIcon class="size-4.5" />
              {/if}
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="right">{pwa.isFullscreen ? "Exit Focus" : "Focus Mode"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-10 rounded-xl text-sidebar-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
              onclick={() => {
                theme.selectedTheme = theme.resolvedTheme === "light" ? "dark" : "light";
              }}
            >
              <div class="relative size-4.5 flex items-center justify-center">
                <SunIcon class="size-full rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <MoonIcon class="absolute size-full rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </div>
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="right">Toggle Theme</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-10 rounded-xl text-sidebar-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
              onclick={() => pushState("#settings", { showModal: true })}
            >
              <SettingsIcon class="size-4.5" />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>

      <div class="mt-2 h-px w-8 bg-sidebar-border/10"></div>

      <NavUser {user} hideDetails={true} />
    </Sidebar.Footer>
  </Sidebar.Root>

  <!-- Panel 2: Contextual Workspace Sidebar -->
  <Sidebar.Root collapsible="none" class="hidden flex-1 md:flex bg-sidebar-accent/5 h-full">
    <Sidebar.Header class="gap-4 border-b border-sidebar-border/10 p-4 bg-transparent">
      <div class="flex w-full items-center justify-between">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" class="w-full justify-between px-2 font-bold text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent tracking-tight">
                Workspace
                <ChevronDownIcon class="size-3.5 opacity-30" />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content class="w-64 bg-sidebar border-sidebar-border" align="start">
            <DropdownMenu.Label class="text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-3 py-2">Select Workspace</DropdownMenu.Label>
            {#each workspaceNavItems as item (item.value)}
              <DropdownMenu.Item
                onSelect={() => { activeWorkspaceNav = item.value; }}
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

      <Button variant="secondary" size="sm" class="w-full justify-start gap-2.5 text-[11px] font-bold h-10 bg-sidebar-accent/50 hover:bg-sidebar-accent text-sidebar-foreground/60 border border-sidebar-border rounded-xl transition-all" onclick={handleNewSession}>
        <PlusIcon class="size-4 text-primary/80" />
        New Session
        <kbd class="ml-auto rounded-lg bg-background/50 px-2 py-0.5 text-[0.6rem] font-mono text-sidebar-foreground/20 border border-sidebar-border">⌘K</kbd>
      </Button>

      <div class="relative group">
        <SearchIcon class="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 text-sidebar-foreground/10 group-focus-within:text-primary/50 transition-colors pointer-events-none" />
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
            <Badge variant="secondary" class="shrink-0 text-[10px] font-black tracking-tight bg-primary/20 text-primary border-primary/20 px-2.5 py-1 rounded-lg">
              @{userContext.assignedSection.className}{userContext.assignedSection.sectionName}
            </Badge>
          {/if}
          <Badge variant="outline" class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-2.5 py-1 rounded-lg uppercase tracking-wider">#Ext</Badge>
          <Badge variant="outline" class="shrink-0 text-[10px] font-bold border-sidebar-border text-sidebar-foreground/20 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-foreground/40 transition-all px-2.5 py-1 rounded-lg uppercase tracking-wider">#Pub</Badge>
        </div>
      {/if}
    </Sidebar.Header>

    <Sidebar.Content class="scrollbar-hide bg-transparent">
      <SidebarHistory {user} />
    </Sidebar.Content>

    <Sidebar.Footer class="border-t border-sidebar-border bg-transparent">
      <div class="flex flex-col px-2 py-1.5">
        <span class="text-[10px] font-black tracking-widest uppercase">Workspace Context</span>
        <span class="text-[10px] opacity-20 font-bold truncate shrink-0">{displayContext}</span>
      </div>
    </Sidebar.Footer>
  </Sidebar.Root>
</Sidebar.Root>

