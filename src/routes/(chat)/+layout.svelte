<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { ChatHistory } from "$lib/context/chat-history.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import type { PageData } from "./$types.js";

  let { data, children } = $props<{
    data: PageData;
    children: any;
  }>();

  // svelte-ignore state_referenced_locally
  let { user, chats, uploads, selectedChatModel, students, classes } =
    data as PageData;

  const chatHistory = new ChatHistory(chats);
  chatHistory.setContext();

  selectedChatModel.setContext();

  const appContext = new UserContext(user, classes, students ?? undefined);
  appContext.setContext();

  const filesContext = new FilesContext(uploads, true);
  filesContext.setContext();
</script>

<svelte:head>
  <meta
    name="description"
    content="Edapex AI - Your AI Assistant for Education"
  />
  <title>Edapex AI</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<Sidebar.Provider open={!data.sidebarCollapsed}>
  <AppSidebar user={user ?? undefined} />
  <Sidebar.Inset>
    <Sidebar.Trigger
      variant="outline"
      class="absolute top-2 left-2 z-50 h-8 w-8 md:h-[34px] md:w-[34px] bg-background shadow-xs"
    />
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
