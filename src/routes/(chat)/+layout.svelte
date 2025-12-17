<script lang="ts">
  import { getHistory } from "$lib/api/chat.remote.js";
  import favicon from "$lib/assets/favicon.svg";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { ChatHistory } from "$lib/context/chat-history.svelte.js";
  import { setContext } from "svelte";
  let { data, children } = $props();

  // svelte-ignore state_referenced_locally
  let { user, chats, selectedChatModel, students } = data;

  const chatHistory = new ChatHistory(chats);
  chatHistory.setContext();

  selectedChatModel.setContext();
  if (user) setContext(user.id, students);
</script>

<svelte:head>
  <meta name="description" content="Edapex AI - Your AI Assistant for Education" />
  <title>Edapex AI</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<Sidebar.Provider open={!data.sidebarCollapsed}>
  <AppSidebar user={user ?? undefined} />
  <Sidebar.Inset>{@render children()}</Sidebar.Inset>
</Sidebar.Provider>
