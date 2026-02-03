<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { WithoutChildren } from "$lib/utils/shadcn.js";
  import { type Icon } from "@lucide/svelte";
  import EclipseIcon from "@lucide/svelte/icons/eclipse";
  import type { Component } from "svelte";
  import type { ComponentProps } from "svelte";
  import { getTheme } from "@sejohnson/svelte-themes";
  import Switch from "./ui/switch/switch.svelte";
  import { Label } from "./ui/label";
  import { page } from "$app/state";
  import { pushState } from "$app/navigation";
  import IntegrationsModal from "$lib/components/integrations-modal.svelte";

  let {
    items,
    ...restProps
  }: {
    items: { title: string; url: string; icon: Component<Icon> }[];
  } & WithoutChildren<ComponentProps<typeof Sidebar.Group>> = $props();

  const theme = getTheme();
  let open = $state(false);

  $effect(() => {
    open = !!page.state.showModal;
  });

  function onOpenChange(isOpen: boolean) {
    if (!isOpen && page.state.showModal) {
      history.back();
    }
  }

  const onclick = async (url: string) => {
    if (url === "#settings") {
      pushState(url, { showModal: true });
    }
  };
</script>

<Sidebar.Group {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      {#each items as item (item.title)}
        {@const Icon = item.icon}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton onclick={() => onclick(item.url)}>
            {#snippet child({ props })}
              <a href={item.url} {...props}>
                <Icon />
                <span>{item.title}</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
      <Sidebar.MenuItem>
        <div class="flex w-full justify-between items-center space-x-2 p-2">
          <Label for="theme-switch" class="cursor-pointer">
            <EclipseIcon class="size-4" />
            <span
              >{theme.resolvedTheme === "light" ? "Dark" : "Light"} Mode</span
            >
          </Label>
          <Switch
            class="cursor-pointer"
            checked={theme.resolvedTheme === "dark"}
            id="theme-switch"
            onCheckedChange={() =>
              (theme.selectedTheme =
                theme.resolvedTheme === "light" ? "dark" : "light")}
          />
        </div>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>

<IntegrationsModal bind:open {onOpenChange} />
