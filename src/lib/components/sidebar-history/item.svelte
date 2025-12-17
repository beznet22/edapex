<script lang="ts">
  import type { DBChat } from "$lib/server/db/schema";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
  } from "../ui/dropdown-menu";
  import { useSidebar, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
  import { Trash2, Globe, CircleCheck, Lock, Share2, MoreHorizontal } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { ChatHistory } from "$lib/context/chat-history.svelte";
  import { onMount } from "svelte";

  let {
    chat,
    active,
    ondelete,
  }: {
    chat: DBChat;
    active: boolean;
    ondelete: (chatId: string) => void;
  } = $props();

  const context = useSidebar();

  const chatHistory = ChatHistory.fromContext();
  const chatFromHistory = $derived(chatHistory.getChatDetails(chat.id));
</script>

<SidebarMenuItem>
  <SidebarMenuButton isActive={active}>
    {#snippet child({ props })}
      <button
        {...props}
        onclick={() => {
          goto(`/chat/${chat.id}`);
          context.setOpenMobile(false);
        }}
      >
        <span>{chat.title}</span>
      </button>
    {/snippet}
  </SidebarMenuButton>

  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <SidebarMenuAction
          {...props}
          class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mr-0.5"
          showOnHover={!active}
        >
          <MoreHorizontal />
          <span class="sr-only">More</span>
        </SidebarMenuAction>
      {/snippet}
    </DropdownMenuTrigger>

    <DropdownMenuContent side="bottom" align="end">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger class="cursor-pointer">
          <Share2 />
          <span>Share</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent align="start">
          <DropdownMenuItem
            class="cursor-pointer flex-row justify-between"
            onclick={() => {
              chatHistory.updateVisibility(chat.id, "private");
            }}
          >
            <div class="flex flex-row items-center gap-2">
              <Lock size={12} />
              <span>Private</span>
            </div>
            {#if chatFromHistory?.visibility === "private"}
              <CircleCheck />
            {/if}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="cursor-pointer flex-row justify-between"
            onclick={() => {
              chatHistory.updateVisibility(chat.id, "public");
            }}
          >
            <div class="flex flex-row items-center gap-2">
              <Globe />
              <span>Public</span>
            </div>
            {#if chatFromHistory?.visibility === "public"}
              <CircleCheck />
            {/if}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuItem
        class="text-destructive focus:bg-destructive/15 focus:text-destructive cursor-pointer dark:text-red-500"
        onclick={() => ondelete(chat.id)}
      >
        <Trash2 />
        <span>Delete</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</SidebarMenuItem>
