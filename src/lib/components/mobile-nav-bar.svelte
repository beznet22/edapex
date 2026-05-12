<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Tooltip, TooltipContent, TooltipTrigger } from "$lib/components/ui/tooltip";
  import SearchIcon from "@lucide/svelte/icons/search";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import UserIcon from "@lucide/svelte/icons/user";
  import { IsMobile } from "$lib/hooks/is-mobile.svelte.js";

  let {
    activeTab = "chat",
    onTabChange,
  }: {
    activeTab?: "search" | "workspace" | "chat" | "account";
    onTabChange?: (tab: string) => void;
  } = $props();

  const isMobile = new IsMobile();

  const tabs = [
    { id: "search", icon: SearchIcon, label: "Search" },
    { id: "workspace", icon: FolderIcon, label: "Workspace" },
    { id: "chat", icon: MessageSquareIcon, label: "Chat" },
    { id: "account", icon: UserIcon, label: "Account" },
  ] as const;
</script>

{#if isMobile.current}
  <nav
    class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t bg-background/95 backdrop-blur-lg px-2 safe-area-bottom"
    aria-label="Mobile navigation"
  >
    {#each tabs as tab (tab.id)}
      {@const Icon = tab.icon}
      {@const isActive = activeTab === tab.id}
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              class="flex flex-col items-center gap-0.5 h-14 w-14 rounded-none cursor-pointer transition-colors {isActive ? 'text-primary' : 'text-muted-foreground'}"
              onclick={() => onTabChange?.(tab.id)}
              aria-selected={isActive}
              role="tab"
            >
              <Icon class="size-5" />
              <span class="text-[0.5625rem] font-medium leading-none">{tab.label}</span>
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">{tab.label}</TooltipContent>
      </Tooltip>
    {/each}
  </nav>
{/if}
