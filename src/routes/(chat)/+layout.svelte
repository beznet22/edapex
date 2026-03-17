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
  import { ImageContext } from "$lib/context/image.context.svelte";
  import { untrack } from "svelte";
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
    // svelte-ignore state_referenced_locally
  } = data;

  const chatHistory = new ChatHistory(untrack(() => data.chats));
  chatHistory.setContext();

  const selectedChatModel = new SelectedModel(untrack(() => data.modelId || ""));
  selectedChatModel.setContext();

  const selectedClass = new SelectedClass(untrack(() => data.selectedClassRaw || ""));
  selectedClass.setContext();

  const selectedAgent = new SelectedAgent(untrack(() => data.selectedAgentId || ""));
  selectedAgent.setContext();

  $effect(() => {
    chatHistory.rehydrate(data.chats);
  });

  $effect(() => {
    selectedChatModel.rehydrate(data.modelId!);
  });

  $effect(() => {
    selectedClass.rehydrate(data.selectedClassRaw || "");
  });

  $effect(() => {
    selectedAgent.rehydrate(data.selectedAgentId || "");
  });

  const appContext = new UserContext(
    untrack(() => data.user),
    untrack(() => data.classes),
    untrack(() => data.students ?? undefined),
    untrack(() => data.assignedSection),
  );
  appContext.setContext();

  const filesContext = new FilesContext(untrack(() => data.uploads), selectedClass, true);
  filesContext.setContext();

  const imageContext = new ImageContext();
  imageContext.setContext();

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

<Sidebar.Provider open={!data.sidebarCollapsed}>
  <AppSidebar user={data.user ?? undefined} />
  <Sidebar.Inset>
    <Sidebar.Trigger
      variant="outline"
      class="absolute top-2 left-2 z-50 h-11 w-11 md:h-[34px] md:w-[34px] bg-background shadow-xs"
    />
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
