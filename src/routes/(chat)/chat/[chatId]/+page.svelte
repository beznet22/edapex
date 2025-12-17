<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let { chat, messages, agents, user } = data;

  const chatContext = new ChatContext({
    initialMessages: messages,
    chatData: chat ?? undefined,
    agents: agents,
  });

  chatContext.setContext();

  const filesContext = new FilesContext(true);
  filesContext.setContext();
</script>

<div class="">
  <ChatHeader {user} />
  <Chat readonly={false} {user} />
</div>
