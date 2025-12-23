<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import { ChatHistory } from "$lib/context/chat-history.svelte.js";
  import { setContext } from "svelte";
  let { data, children } = $props();

  // svelte-ignore state_referenced_locally
  let { user, chats, selectedClass, selectedChatModel, students, classes } = data;
  const chatHistory = new ChatHistory(chats);
  chatHistory.setContext();

  selectedChatModel.setContext();
  selectedClass.setContext();
  
  const appContext = new UserContext(user, classes, students|| []);
  appContext.setContext();
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
