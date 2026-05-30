<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { ComponentProps } from "svelte";
  import type { Component } from "svelte";
  import ClassSelector from "./class-selector.svelte";
  
  let {
    ref = $bindable(null),
    items,
    user,
    ...restProps
  }: {
    items: {
      title: string;
      icon: Component;
      action?: () => void;
      url?: string;
    }[];
    user?: any;
  } & ComponentProps<typeof Sidebar.Group> = $props();
</script>

<Sidebar.Group bind:ref {...restProps}>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      <ClassSelector {user} />

      {#each items as item (item.title)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton size="sm">
            {#snippet child({ props })}
              {#if item.action}
                <button onclick={item.action} {...props}>
                  <item.icon />
                  <span>{item.title}</span>
                </button>
              {:else if item.url}
                <a href={item.url} {...props}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              {/if}
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
