<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import type { Component } from "svelte";

  let {
    items,
  }: {
    items: {
      title: string;
      url?: string;
      icon: Component;
      isActive?: boolean;
      badge?: boolean;
    }[];
  } = $props();
</script>

<Sidebar.Group>
  <Sidebar.GroupContent>
    <Sidebar.Menu>
      {#each items as item (item.title)}
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            tooltipContent={item.title}
            isActive={item.isActive}
            class={item.isActive ? "bg-primary/10 text-primary font-semibold" : ""}
          >
            {#snippet child({ props })}
              <a href={item.url || "#"} {...props}>
                <item.icon class="size-4" />
                <span>{item.title}</span>
                {#if item.badge}
                  <span class="absolute right-2 top-1/2 -translate-y-1/2 size-1.5 bg-primary rounded-full"
                  ></span>
                {/if}
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      {/each}
    </Sidebar.Menu>
  </Sidebar.GroupContent>
</Sidebar.Group>
