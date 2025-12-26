<script lang="ts">
  import { PromptSuggestion } from "$lib/components/prompt-kit/prompt-suggestion";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { ArrowUp, Package, Square, X } from "@lucide/svelte";

  import { useChat } from "$lib/context/chat-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { ClassStudent } from "$lib/server/repository/student.repo";
  import type { AuthUser } from "$lib/types/auth-types";
  import { iconRegistry } from "$lib/utils/icons";
  import { searchFilter } from "$lib/utils/search";
  import ChatMenu from "./chat-menu.svelte";
  import ChatResource from "./chat-resource.svelte";
  import DropZone from "./drop-zone.svelte";
  import {
    PromptInput,
    PromptInputAction,
    PromptInputActions,
    PromptInputTextarea,
  } from "./prompt-kit/prompt-input";
  import ClassSelector from "./class-selector.svelte";
  import { onMount } from "svelte";
  import { Loader } from "./prompt-kit/loader";
  import { Check, CircleAlert, TriangleAlert } from "@lucide/svelte";

  let {
    user,
    readonly,
    isInitial = true,
  }: {
    user?: AuthUser;
    readonly: boolean;
    isInitial?: boolean;
  } = $props();

  // State
  let input = $state("");
  let found = $state<ClassStudent[]>([]);
  let activeSuggestions = $state<readonly string[]>([]);
  let activeHighlight = $state<string>("");

  // Context
  const chat = useChat();
  const file = useFileActions();
  const userContext = UserContext.fromContext();
  const students = $derived(userContext.students);

  // const isUploading = true;

  // svelte-ignore state_referenced_locally
  if (!userContext.user) chat.activeAgent = null;

  // Handlers
  function onSubmit() {
    if (chat.loading) {
      chat.client.stop();
      return;
    }

    if (input.trim() && chat.status === "ready") {
      chat.client.sendMessage({ text: input });
      input = "";
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && e.shiftKey) {
      input += "\n";
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      onSubmit();
      e.preventDefault();
      return;
    }
  }

  function onValueChange(value: string) {
    input = value;
    activeSuggestions = [];

    found = searchFilter(value, students);
  }

  let handleSuggestionClick = (suggestion: string) => {
    input = suggestion;
    activeHighlight = suggestion;
  };

  function handleStudentClick(student: ClassStudent) {
    found = searchFilter(student.name || "", students);
    input = `${activeHighlight} for ${student.name} (Student Admission No: ${student.admissionNo})`;
  }

  let handleAgentClick = (id: string) => {
    const agent = chat.agents.find((a) => a.id === id);
    if (!agent) return;
    const { suggestions, highlight } = agent.assistants[0];

    activeSuggestions = suggestions ?? [];
    activeHighlight = highlight ?? "";
    chat.activeAgent = agent ?? null;
    input = "";
  };

  function onFileSelected(files: FileList) {
    file.add(files);
  }
</script>

<div class="relative">
  <PromptInput
    class="border-input bg-popover relative z-10 w-full rounded-3xl border p-0 pt-1 shadow-xs"
    value={input}
    {onValueChange}
    {onSubmit}
  >
    {#if file.files.length > 0}
      <div
        class="flex flex-wrap gap-2 px-3 pb-2 transition-all duration-300 ease-in-out"
      >
        {#each file.files as f, i (f.name + i)}
          <div
            class="flex items-center gap-2 rounded-full border bg-muted px-2 py-1 text-xs"
          >
            <span class="max-w-[100px] truncate">{f.name}</span>
            {#if file.uploads.some((u) => u.filename === f.name && u.status === "done")}
              <Check class="size-3 text-green-500" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "pending")}
              <TriangleAlert class="size-3 text-primary" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "uploading")}
              <Loader variant="circular" class="size-3" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "error")}
              <CircleAlert class="size-3 text-destructive" />
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="size-3 rounded-full cursor-pointer"
              onclick={() => file.remove(i)}
            >
              <X class="size-3" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <PromptInputTextarea
      placeholder="Ask anything..."
      class="min-h-11 pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
      {onkeydown}
    />

    <PromptInputActions
      class="mt-5 flex w-full items-end justify-between gap-2 px-3 pb-3"
    >
      <div class="flex gap-2">
        <ChatMenu {input} />
        {#if chat.activeAgent}
          <PromptInputAction>
            {#snippet tooltip()}
              <p>{chat.activeAgent?.label || "Active Agent"}</p>
            {/snippet}
            {@const Icon = iconRegistry[chat.activeAgent.iconName]}
            <Button
              variant="outline"
              class="rounded-full cursor-pointer"
              onclick={() => (
                (chat.activeAgent = null), (activeSuggestions = [])
              )}
            >
              <Icon class="size-4" />
              {chat.activeAgent.label}
            </Button>
          </PromptInputAction>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if userContext.isCoordinator || userContext.isIt}
          <ClassSelector />
        {:else}
          <PromptInputAction>
            {#snippet tooltip()}
              Add Resource
            {/snippet}
            <Button
              variant="ghost"
              size="icon"
              class="size-9 rounded-full cursor-pointer"
              onclick={() => file.oprnFileDropZone()}
            >
              <Package class="size-5" />
            </Button>
          </PromptInputAction>
        {/if}

        <Button
          size="sm"
          class="h-9 w-9 rounded-full cursor-pointer"
          onclick={onSubmit}
          disabled={!input.trim()}
        >
          {#if chat.loading}
            <Square class="size-4 fill-current" />
          {:else}
            <ArrowUp class="size-5" />
          {/if}
        </Button>
      </div>
    </PromptInputActions>
  </PromptInput>

  {#if isInitial && !userContext.isCoordinator && !userContext.isIt}
    <div
      class="absolute top-full left-0 w-full flex flex-col items-center justify-center mt-2 gap-4"
    >
      {#if activeSuggestions.length > 0}
        <div class="flex w-full flex-col items-center justify-center space-y-1">
          {#each activeSuggestions as suggestion}
            <PromptSuggestion
              highlight={activeHighlight}
              onclick={() => handleSuggestionClick(suggestion)}
              class="transition-all hover:scale-[1.02] hover:shadow-sm"
            >
              {suggestion}
            </PromptSuggestion>
            <Separator class="me-2" />
          {/each}
        </div>
      {:else if input.trim() && found.length > 0}
        <div class="flex w-full flex-col items-center justify-center space-y-1">
          {#each found as student}
            <PromptSuggestion
              highlight={input}
              onclick={() => handleStudentClick(student)}
              class="transition-all hover:scale-[1.02] hover:shadow-sm"
            >
              {student.name}
            </PromptSuggestion>
            <Separator class="me-2" />
          {/each}
        </div>
      {:else}
        <div
          class="relative flex w-full flex-wrap items-center justify-center gap-2"
        >
          {#each chat.agents as agent}
            <PromptSuggestion
              onclick={() => handleAgentClick(agent.id)}
              class="capitalize transition-all hover:scale-105 hover:shadow-md"
            >
              {@const Icon = iconRegistry[agent.iconName]}
              <Icon class="mr-2 h-4 w-4" />
              {agent.label}
            </PromptSuggestion>
          {/each}
        </div>
      {/if}
      {#if !userContext.isCoordinator && !userContext.isIt}
        <ChatResource {onFileSelected} />
      {/if}
    </div>
  {/if}
</div>

<input
  type="file"
  onchange={file.onchange}
  class="hidden"
  id="file-upload"
  accept=".png, .jpg, .jpeg"
  bind:this={file.fileInputRef}
/>
<DropZone />
