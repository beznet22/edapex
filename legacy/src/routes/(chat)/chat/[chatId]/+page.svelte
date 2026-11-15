<script lang="ts">
  import { page } from "$app/state";
  import type { xUIMessage, ChatThread } from "$lib/types/chat-types";
  import type { AuthUser } from "$lib/types/auth-types";
  import SharedChatView from "$lib/components/SharedChatView.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const chatId = $derived(page.params.chatId);
  const fileKeys = $derived(
    page.url.searchParams
      .get("refs")
      ?.split(",")
      .map(decodeURIComponent)
      .filter(Boolean) ?? [],
  );
</script>

{#key chatId}
  <SharedChatView
    {chatId}
    {fileKeys}
    user={data.user as AuthUser}
    messages={data.messages as xUIMessage[]}
    chatData={data.chat as unknown as ChatThread}
  />
{/key}
