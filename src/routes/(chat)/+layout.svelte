<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { ChatHistory } from "$lib/context/chat-history.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import {
    SelectedModel,
    SelectedClass,
    SelectedAgent,
  } from "$lib/context/sync.svelte";
  import type { PageData } from "./$types.js";

  let { data, children } = $props<{
    data: PageData;
    children: any;
  }>();

  let {
    user,
    classes,
    students,
    assignedSection,
    chats,
    modelId,
    selectedClassRaw,
    selectedAgentId,
    uploads,
    sidebarCollapsed,
  } = data;

  const chatHistory = new ChatHistory(chats);
  chatHistory.setContext();

  const selectedChatModel = new SelectedModel(modelId!);
  selectedChatModel.setContext();

  const selectedClass = new SelectedClass(selectedClassRaw || "");
  selectedClass.setContext();

  const selectedAgent = new SelectedAgent(selectedAgentId || "");
  selectedAgent.setContext();

  $effect(() => {
    chatHistory.rehydrate(chats);
  });

  $effect(() => {
    selectedChatModel.rehydrate(modelId!);
  });

  $effect(() => {
    selectedClass.rehydrate(selectedClassRaw || "");
  });

  $effect(() => {
    selectedAgent.rehydrate(selectedAgentId || "");
  });

  const appContext = new UserContext(user, classes, students ?? undefined, assignedSection);
  appContext.setContext();

  const filesContext = new FilesContext(uploads, true);
  filesContext.setContext();

  $effect(() => {
    appContext.rehydrate(data.user, data.classes, data.assignedSection);
  });

  $effect(() => {
    filesContext.rehydrate(data.uploads);
  });
</script>

<svelte:head>
  <meta
    name="description"
    content="Edapex AI - Your AI Assistant for Education"
  />
  <title>Edapex AI</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<Sidebar.Provider open={!sidebarCollapsed}>
  <AppSidebar user={user ?? undefined} />
  <Sidebar.Inset>
    <Sidebar.Trigger
      variant="outline"
      class="absolute top-2 left-2 z-50 h-8 w-8 md:h-[34px] md:w-[34px] bg-background shadow-xs"
    />
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
