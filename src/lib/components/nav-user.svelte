<script lang="ts">
  import { goto } from "$app/navigation";
  import { signout } from "$lib/api/auth.remote";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";

  import { useSidebar } from "$lib/components/ui/sidebar/index.js";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { clearLocalStore } from "$lib/utils";
  import BadgeCheckIcon from "@lucide/svelte/icons/badge-check";
  import BellIcon from "@lucide/svelte/icons/bell";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import CreditCardIcon from "@lucide/svelte/icons/credit-card";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import CircleHelpIcon from "@lucide/svelte/icons/circle-help";
  import FolderIcon from "@lucide/svelte/icons/folder";

  let { user }: { user?: AuthUser } = $props();

  const sidebar = useSidebar();
  let fileCtx = $derived(useFileActions());
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            {...props}
          >
            <img
              src={`https://avatar.vercel.sh/${user?.email || "user"}`}
              alt={user?.email ?? "User Avatar"}
              width={24}
              height={24}
              class="rounded-full"
            />
            <div
              class="grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden"
            >
              <span class="truncate font-medium"
                >{user?.fullName || "Guest"}</span
              >
              <span class="text-muted-foreground truncate text-xs">
                {user?.email || "m@example.com"}</span
              >
            </div>

            <ChevronsUpDownIcon
              class="ms-auto size-4 group-data-[collapsible=icon]:hidden"
            />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
        side={sidebar.isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenu.Label class="p-0 font-normal">
          <div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
            <img
              src={`https://avatar.vercel.sh/${user?.email || "user"}`}
              alt={user?.email ?? "User Avatar"}
              width={24}
              height={24}
              class="rounded-full"
            />
            <div class="grid flex-1 text-start text-sm leading-tight">
              <span class="truncate font-medium"
                >{user?.fullName || "Guest"}</span
              >
              <span class="truncate text-xs">{user?.email || "Guest"}</span>
            </div>
          </div>
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <SparklesIcon />
            Upgrade to Pro
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item>
            <BadgeCheckIcon />
            Account
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
            goto("/filestore");
          }}>
            <FolderIcon />
            Filestore
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <BellIcon />
            Notifications
          </DropdownMenu.Item>
          <DropdownMenu.Item>
            <CircleHelpIcon />
            Get Help
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={async () => {
            if (sidebar.isMobile) sidebar.setOpenMobile(false);
            const result = await signout();
            if (result) {
              clearLocalStore("selected-class");
              goto("/signin");
            }
          }}
        >
          <LogOutIcon />
          Log out
          <!-- <a href="/signout" data-sveltekit-preload-data="false" data-sveltekit-reload>Log out</a> -->
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
