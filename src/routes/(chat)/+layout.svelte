<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { ChatHistory } from "$lib/context/chat-history.svelte.js";
  import { FilesContext } from "$lib/context/file-context.svelte.js";
  import { UserContext } from "$lib/context/user-context.svelte.js";
  import { SelectedModel, SelectedClass } from "$lib/context/sync.svelte";
  import { ImageContext } from "$lib/context/image.context.svelte";
  import { useAI } from "$lib/context/ai-context.svelte";
  import type { PageData } from "./$types.js";

  let { data, children } = $props<{
    data: PageData;
    children: any;
  }>();

  let sidebarOpen = $state(!data.sidebarCollapsed);

  let {
    user,
    classes,
    students,
    assignedSection,
    chats,
    modelId,
    selectedClassRaw,
    uploads,
    sidebarCollapsed,
    // svelte-ignore state_referenced_locally
  } = data;

  const chatHistory = new ChatHistory(chats);
  chatHistory.setContext();

  const selectedChatModel = new SelectedModel(modelId!);
  selectedChatModel.setContext();

  const selectedClass = new SelectedClass(selectedClassRaw || "");
  selectedClass.setContext();

  $effect(() => {
    chatHistory.rehydrate(data.chats);
  });

  $effect(() => {
    selectedChatModel.rehydrate(data.modelId!);
  });

  $effect(() => {
    selectedClass.rehydrate(data.selectedClassRaw || "");
  });

  const appContext = new UserContext(
    user,
    classes,
    students ?? undefined,
    assignedSection,
  );
  appContext.setContext();

  const filesContext = new FilesContext(data.uploads, selectedClass, true);
  filesContext.setContext();

  const imageContext = new ImageContext();
  imageContext.setContext();

  const ai = useAI();
  $effect(() => {
    ai.sync(data);
  });

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

<Sidebar.Provider bind:open={sidebarOpen}>
  <AppSidebar user={data.user ?? undefined} />
  <Sidebar.Inset class="overflow-hidden min-h-0">
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
