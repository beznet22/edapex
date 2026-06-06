<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
  } from "../ui/dropdown-menu";
  import {
    useSidebar,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
  } from "../ui/sidebar";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import LockIcon from "@lucide/svelte/icons/lock";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { ChatHistory } from "$lib/context/chat-history.svelte";
    import type { ChatThread } from "$lib/types/chat-types";

  let {
    chat,
    active,
    ondelete,
  }: {
    chat: ChatThread;
    active: boolean;
    ondelete: (chatId: string) => void;
  } = $props();

  const context = useSidebar();

  const chatHistory = ChatHistory.fromContext();
  const chatFromHistory = $derived(chatHistory.getChatDetails(chat.threadId));
</script>

<SidebarMenuItem>
  <SidebarMenuButton>
    {#snippet child({ props })}
      <a
        href={`/chat/${chat.threadId}`}
        {...props}
        onclick={(e) => {
          e.preventDefault();
          if (context.isMobile) {
            context.setOpenMobile(false);
          }
          goto(`/chat/${chat.threadId}`);
        }}
      >
        <span>{chat.title}</span>
      </a>
    {/snippet}
  </SidebarMenuButton>

  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <SidebarMenuAction
          {...props}
          class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mr-0.5"
          showOnHover={false}
        >
          <MoreHorizontalIcon />
          <span class="sr-only">More</span>
        </SidebarMenuAction>
      {/snippet}
    </DropdownMenuTrigger>

    <DropdownMenuContent side="bottom" align="end">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="cursor-pointer">
          <Share2Icon />
          <span>Share</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent align="start">
          <DropdownMenuItem
            class="cursor-pointer flex-row justify-between"
            onclick={() => {
              chatHistory.updateVisibility(chat.threadId, "PRIVATE");
            }}
          >
            <div class="flex flex-row items-center gap-2">
              <LockIcon size={12} />
              <span>Private</span>
            </div>
            {#if chatFromHistory?.visibility === "PRIVATE"}
              <CircleCheckIcon />
            {/if}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="cursor-pointer flex-row justify-between"
            onclick={() => {
              chatHistory.updateVisibility(chat.threadId, "PUBLIC");
            }}
          >
            <div class="flex flex-row items-center gap-2">
              <GlobeIcon />
              <span>Public</span>
            </div>
            {#if chatFromHistory?.visibility === "PUBLIC"}
              <CircleCheckIcon />
            {/if}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuItem
        class="text-destructive focus:bg-destructive/15 focus:text-destructive cursor-pointer dark:text-red-500"
        onclick={() => ondelete(chat.threadId)}
      >
        <Trash2Icon />
        <span>Delete</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</SidebarMenuItem>
