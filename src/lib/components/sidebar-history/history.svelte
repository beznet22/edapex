<script lang="ts">
  import { page } from "$app/state";
  import { ChatHistory } from "$lib/context/chat-history.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import * as AlertDialog from "../ui/alert-dialog";
  import { SidebarGroup, SidebarGroupContent, SidebarMenu } from "../ui/sidebar";
  import { Skeleton } from "../ui/skeleton";
  import ChatItem from "./item.svelte";

  let { user }: { user?: AuthUser } = $props();
  const chatHistory = ChatHistory.fromContext();
  let chatIdToDelete = $state<string | undefined>(undefined);
  let groupedChats = $derived(chatHistory.groupChatsByDate(chatHistory.chats));

  const chatGroupTitles = {
    today: "Today",
    yesterday: "Yesterday",
    lastWeek: "Last 7 days",
    lastMonth: "Last 30 days",
    older: "Older",
  } as const;
</script>

{#if !user}
  <SidebarGroup>
    <SidebarGroupContent>
      <div class="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
        Login to save and revisit previous chats!
      </div>
    </SidebarGroupContent>
  </SidebarGroup>
{:else if chatHistory.loading}
  <SidebarGroup>
    <div class="text-sidebar-foreground/50 px-2 py-1 text-xs">Today</div>
    <SidebarGroupContent>
      <div class="flex flex-col">
        {#each [44, 32, 28, 64, 52] as width (width)}
          <div class="flex h-8 items-center gap-2 rounded-md px-2">
            <Skeleton
              class="bg-sidebar-accent-foreground/10 h-4 max-w-[--skeleton-width] flex-1"
              style="--skeleton-width: {width}%"
            />
          </div>
        {/each}
      </div>
    </SidebarGroupContent>
  </SidebarGroup>
{:else if chatHistory.chats.length === 0}
  <SidebarGroup>
    <SidebarGroupContent>
      <div class="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
        Your conversations will appear here once you start chatting!
      </div>
    </SidebarGroupContent>
  </SidebarGroup>
{:else}
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        {#each Object.entries(groupedChats) as [group, chats] (group)}
          {#if chats.length > 0}
            <div class="text-sidebar-foreground/50 px-2 py-1 text-xs">
              {chatGroupTitles[group as keyof typeof chatGroupTitles]}
            </div>
            {#each chats as chat (chat.id)}
              <ChatItem
                {chat}
                active={chat.id === page.params.chatId}
                ondelete={(chatId) => {
                  chatIdToDelete = chatId;
                  chatHistory.alertDialogOpen = true;
                }}
              />
            {/each}
          {/if}
        {/each}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
  <AlertDialog.Root bind:open={chatHistory.alertDialogOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
        <AlertDialog.Description>
          This action cannot be undone. This will permanently delete your chat and remove it from our servers.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => chatHistory.deleteChat(chatIdToDelete)}
          >Continue</AlertDialog.Action
        >
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
