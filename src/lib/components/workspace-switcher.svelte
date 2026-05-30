<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { goto } from "$app/navigation";

  let {
    items,
    activeItem = $bindable()
  }: {
    items: readonly { title: string; value: string }[];
    activeItem: string;
  } = $props();

  function navigateHome() {
    goto("/");
  }
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <!-- 
      TODO: The Workspace selector dropdown functionality has been temporarily disabled.
      Pending re-architecture and re-strategy for how workspace navigation will be implemented.
      For now, clicking the logo acts as a home button.
    -->
    <Sidebar.MenuButton
      size="lg"
      onclick={navigateHome}
      class="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <img src="/logo.svg" alt="Hermes" class="size-5 dark:invert" />
      </div>
      <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-bold tracking-tight text-sidebar-foreground">EdApex Workspace</span>
        <span class="truncate text-[10px] uppercase font-bold text-sidebar-foreground/50">Active</span>
      </div>
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
