<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";
  import { setContext } from "svelte";

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  const { user, agents } = data;

  const chatContext = new ChatContext({
    initialMessages: [],
    chatData: undefined,
    agents,
  });

  chatContext.setContext();

  const filesContext = new FilesContext(true);
  filesContext.setContext();
</script>

<div class="">
  <ChatHeader {user} />
  <Chat readonly={false} {user} />
</div>
