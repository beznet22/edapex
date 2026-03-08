<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { SelectedClass, SelectedAgent } from "$lib/context/sync.svelte";

  let { data } = $props();

  const selectedClass = SelectedClass.fromContext();
  const selectedAgent = SelectedAgent.fromContext();

  // svelte-ignore state_referenced_locally
  const chatContext = new ChatContext({
    initialMessages: data.messages,
    chatData: data.chat ?? undefined,
    agents: data.agents,
    selectedClass,
    selectedAgent,
  });

  chatContext.setContext();
</script>

<div class="flex-1 flex flex-col min-h-0 w-full">
  <ChatHeader user={data.user} />
  <Chat readonly={false} user={data.user} />
</div>
