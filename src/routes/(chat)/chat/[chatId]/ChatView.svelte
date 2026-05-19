<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/WorkspaceSidebar.svelte";
  import { ChatContext } from "$lib/context/chat-context.svelte.js";
  import { SelectedClass } from "$lib/context/sync.svelte";
  import { IsMobile } from "$lib/hooks/is-mobile.svelte.js";

  let { data } = $props();

  const selectedClass = SelectedClass.fromContext();
  const isMobile = new IsMobile();
  let inspectorOpen = $state(false);

  // svelte-ignore state_referenced_locally
  const chatContext = new ChatContext({
    initialMessages: data.messages,
    chatData: data.chat ?? undefined,
    agents: data.agents,
    selectedClass,
  });

  chatContext.setContext();
</script>

<!-- Hermes 4-Panel: Panel 3 (Chat Stage) -->
<div class="flex flex-1 min-h-0 w-full">
  <div class="flex-1 flex flex-col min-h-0 min-w-0">
    <ChatHeader user={data.user} chat={data.chat} onToggleInspector={() => inspectorOpen = !inspectorOpen} />
    <Chat readonly={false} user={data.user} />
  </div>
</div>

<WorkspaceSidebar bind:open={inspectorOpen} />
