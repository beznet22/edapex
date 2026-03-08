<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { SelectedClass, SelectedAgent } from "$lib/context/sync.svelte";

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let { chat, messages, agents, user } = data;
  const selectedClass = SelectedClass.fromContext();
  const selectedAgent = SelectedAgent.fromContext();

  const chatContext = new ChatContext({
    initialMessages: messages,
    chatData: chat ?? undefined,
    agents: agents,
    selectedClass,
    selectedAgent,
  });

  chatContext.setContext();
</script>

<div class="flex-1 flex flex-col min-h-0 w-full">
  <ChatHeader {user} />
  <Chat readonly={false} {user} />
</div>
