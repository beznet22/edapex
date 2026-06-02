<script lang="ts">
  import type { xUIMessage, ChatThread } from "$lib/types/chat-types";
  import type { AuthUser } from "$lib/types/auth-types";
  import SharedChatView from "$lib/components/SharedChatView.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

{#key data.chat?.threadId}
  <SharedChatView
    user={data.user as AuthUser}
    messages={data.messages as xUIMessage[]}
    chatData={data.chat as unknown as ChatThread}
  />
{/key}
