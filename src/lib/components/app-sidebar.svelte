<script lang="ts" module>
  // sample data
  const data = [
    {
      title: "Integrations",
      url: "#settings",
      icon: SettingsIcon,
    },
  ];
</script>

<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import type { AuthUser } from "$lib/types/auth-types";
  import type { ComponentProps } from "svelte";
  import NavUser from "./nav-user.svelte";
  import NavSecondary from "./nav-secondary.svelte";
  import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
  import { SidebarHistory } from "./sidebar-history";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import CircleQuestionMark from "@lucide/svelte/icons/circle-help";
  import CommandIcon from "@lucide/svelte/icons/command";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { Button } from "./ui/button";
  import { goto } from "$app/navigation";
  import { useFileActions } from "$lib/context/file-context.svelte";

  type SidebarProps = {
    user?: AuthUser;
    ref?: HTMLElement | null;
    items?: unknown[]; // Assuming items is part of SidebarProps
    version?: string; // Assuming version is part of SidebarProps
  } & ComponentProps<typeof Sidebar.Root>;

  let {
    user,
    ref = $bindable(null),
    items, // Added items
    version, // Added version
    ...restProps
  }: SidebarProps = $props();

  const context = useSidebar();
  let fileCtx = $derived(useFileActions());
</script>

<Sidebar.Root collapsible="icon" {...restProps} bind:ref>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          size="lg"
          class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          {#snippet child({ props })}
            <a href="/" {...props}>
              <div
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <CommandIcon class="size-4" />
              </div>
              <div
                class="grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden"
              >
                <span class="truncate font-medium">Edapex AI</span>
                <span class="truncate text-xs">Enterprise</span>
              </div>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
        <Sidebar.MenuAction
          class="group-data-[collapsible=icon]:hidden top-1/2 -translate-y-1/2"
        >
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  type="button"
                  class="h-fit p-1"
                  onclick={() => {
                    context.setOpenMobile(false);
                    goto("/", { invalidateAll: true });
                  }}
                >
                  <PlusIcon class="size-4" />
                </Button>
              {/snippet}
            </TooltipTrigger>
            <TooltipContent align="end">New Chat</TooltipContent>
          </Tooltip>
        </Sidebar.MenuAction>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <SidebarHistory {user} />
  </Sidebar.Content>
  <Sidebar.Footer>
    <NavSecondary items={data} class="mt-auto" />
    <NavUser {user} />
  </Sidebar.Footer>
  <Sidebar.Rail />
</Sidebar.Root>
