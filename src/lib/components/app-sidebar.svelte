<script lang="ts" module>
  // sample data
  const data = [
    {
      title: "AI Providers",
      url: "#settings",
      icon: SettingsIcon,
    },
    {
      title: "Get Help",
      url: "#",
      icon: CircleQuestionMark,
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
  import { SettingsIcon, SearchIcon, CircleQuestionMark, CommandIcon, Plus } from "@lucide/svelte";
  import { Button } from "./ui/button";
  import { goto } from "$app/navigation";
  let {
    user,
    ref = $bindable(null),
    ...restProps
  }: { user?: AuthUser } & ComponentProps<typeof Sidebar.Root> = $props();

  const context = useSidebar();
</script>

<Sidebar.Root {...restProps} bind:ref>
  <Sidebar.Header>
    <Sidebar.Menu>
      <div class="flex h-10 flex-row items-center justify-between md:h-[34px]">
        <Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:py-6!">
          {#snippet child({ props })}
            <a href="##" {...props}>
              <div
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <CommandIcon class="size-4" />
              </div>
              <div class="grid flex-1 text-start text-sm leading-tight">
                <span class="truncate font-medium">Edapex AI</span>
                <span class="truncate text-xs">Enterprise</span>
              </div>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                type="button"
                class="h-fit p-2"
                onclick={() => {
                  context.setOpenMobile(false);
                  goto("/", { invalidateAll: true });
                }}
              >
                <Plus />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent align="end">New Chat</TooltipContent>
        </Tooltip>
      </div>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <SidebarHistory {user} />
    <NavSecondary items={data} class="mt-auto" />
  </Sidebar.Content>
  <Sidebar.Footer>
    <NavUser {user} />
  </Sidebar.Footer>
  <Sidebar.Rail />
  <Sidebar.Rail />
</Sidebar.Root>
