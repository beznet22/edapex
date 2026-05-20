<script lang="ts">
  import ChatHeader from "$lib/components/chat-header.svelte";
  import Chat from "$lib/components/chat.svelte";
  import WorkspaceSidebar from "$lib/components/workspace/WorkspaceSidebar.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
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

<!-- Hermes 4-Panel Row: Panel 3 (Chat Stage) & Panel 4 (Workspace Inspector) -->
<Resizable.PaneGroup direction="horizontal" class="flex flex-1 min-h-0 w-full">
  <!-- Panel 3: Chat Stage -->
  <Resizable.Pane defaultSize={inspectorOpen && !isMobile.current ? 70 : 100} minSize={30} class="flex flex-col min-h-0 min-w-0 h-full relative">
    <ChatHeader user={data.user} chat={data.chat} onToggleInspector={() => inspectorOpen = !inspectorOpen} />
    <Chat readonly={false} user={data.user} />
  </Resizable.Pane>

  <!-- Panel 4: Workspace Inspector (Desktop Resizable) -->
  {#if inspectorOpen && !isMobile.current}
    <Resizable.Handle withHandle class="w-1.5 bg-muted/20 hover:bg-muted/50 active:bg-muted transition-colors z-10" />
    <Resizable.Pane defaultSize={50} minSize={20} maxSize={60}>
      <WorkspaceSidebar bind:open={inspectorOpen} isMobile={isMobile.current} />
    </Resizable.Pane>
  {/if}
</Resizable.PaneGroup>

<!-- Mobile Sheet Overlay -->
{#if isMobile.current && inspectorOpen}
  <WorkspaceSidebar bind:open={inspectorOpen} isMobile={true} />
{/if}
