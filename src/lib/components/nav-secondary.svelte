<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { WithoutChildren } from "$lib/utils/shadcn.js";
  import { type Icon } from "@lucide/svelte";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import type { Component } from "svelte";
  import type { ComponentProps } from "svelte";
  import { getTheme } from "@sejohnson/svelte-themes";
  import { page } from "$app/state";
  import { pushState } from "$app/navigation";
  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { usePWA } from "$lib/context/pwa.svelte";
  import Maximize from "@lucide/svelte/icons/maximize";
  import Minimize from "@lucide/svelte/icons/minimize";
  
  let {
    items,
    ...restProps
  }: {
    items: { title: string; url: string; icon: Component<Icon> }[];
  } & WithoutChildren<ComponentProps<typeof Sidebar.Group>> = $props();

  const sidebar = useSidebar();
  const theme = getTheme();
  const pwa = usePWA();

  const onclick = async (url: string) => {
    if (sidebar.isMobile) {
      sidebar.setOpenMobile(false);
    }
    if (url === "#settings") {
      pushState(url, { showModal: true });
    }
  };
</script>

<Sidebar.Group {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu class="gap-4">
      {#each items as item (item.title)}
        {@const Icon = item.icon}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            onclick={() => onclick(item.url)}
            class="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! cursor-pointer"
          >
            {#snippet child({ props })}
              <a
                href={item.url}
                {...props}
                class="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
              >
                <div
                  class="flex size-4 shrink-0 items-center justify-center group-data-[collapsible=icon]:mx-auto"
                >
                  <Icon />
                </div>
                <span class="group-data-[collapsible=icon]:hidden">
                  {item.title}
                </span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          onclick={() => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
            pwa.toggleFullscreen();
          }}
          class="w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
        >
          {#snippet child({ props })}
            <button
              {...props}
              class="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 cursor-pointer"
            >
              <div
                class="relative size-4 flex items-center justify-center shrink-0 group-data-[collapsible=icon]:mx-auto"
              >
                {#if pwa.isFullscreen}
                  <Minimize class="size-4" />
                {:else}
                  <Maximize class="size-4" />
                {/if}
              </div>
              <span class="group-data-[collapsible=icon]:hidden">
                {pwa.isFullscreen ? "Exit Focus" : "Focus Mode"}
              </span>
            </button>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>

      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          onclick={() => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
            theme.selectedTheme =
              theme.resolvedTheme === "light" ? "dark" : "light";
          }}
          class="w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
        >
          {#snippet child({ props })}
            <button
              {...props}
              class="flex w-full items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 cursor-pointer"
            >
              <div
                class="relative size-4 flex items-center justify-center shrink-0 group-data-[collapsible=icon]:mx-auto"
              >
                <Sun
                  class="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
                />
                <Moon
                  class="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
                />
              </div>
              <span class="group-data-[collapsible=icon]:hidden"
                >{theme.resolvedTheme === "light" ? "Dark" : "Light"} Mode</span
              >
            </button>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>

