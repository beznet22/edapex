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
  import { cn } from "$lib/utils/shadcn";

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

<div class="relative transition-all duration-300">
  <PromptInput
    class="border-input bg-popover/95 backdrop-blur-md relative z-10 w-full rounded-[26px] sm:rounded-3xl border p-0 pt-1 shadow-sm transition-all duration-200 focus-within:shadow-md focus-within:border-primary/30"
    value={input}
    {onValueChange}
    {onSubmit}
  >
    {#if file.files.length > 0}
      <div
        class="flex flex-wrap gap-1.5 sm:gap-2 px-3 pb-2 transition-all duration-300 ease-in-out"
      >
        {#each file.files as f, i (f.name + i)}
          <div
            class="flex items-center gap-1.5 sm:gap-2 rounded-full border bg-muted/50 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs transition-all hover:bg-muted"
          >
            <span class="max-w-[80px] sm:max-w-[120px] truncate">{f.name}</span>
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
              class="size-3.5 rounded-full cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
              onclick={() => file.remove(i)}
            >
              <X class="size-3" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Mobile Context Toolbar: Row for Agent Selector -->
    {#if chat.activeAgent}
      {@const Icon = iconRegistry[chat.activeAgent.iconName]}
      <div
        class="flex sm:hidden flex-wrap items-center gap-2 px-3 pb-2 transition-all duration-300"
      >
        <Button
          variant="outline"
          class="h-8 rounded-full border-primary/20 bg-primary/5 px-2.5 text-[11px] font-medium gap-1.5 transition-all active:scale-95"
          onclick={() => ((chat.activeAgent = null), (activeSuggestions = []))}
        >
          <Icon class="size-3.5 text-primary" />
          <span class="max-w-[100px] truncate">{chat.activeAgent.label}</span>
          <X class="size-3 opacity-50" />
        </Button>
      </div>
    {/if}

    <PromptInputTextarea
      placeholder="Ask anything..."
      class="min-h-11 pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
      {onkeydown}
    />

    <PromptInputActions
      class="mt-2 sm:mt-5 flex w-full items-end justify-between gap-2 px-2.5 sm:px-3 pb-2.5 sm:pb-3"
    >
      <div class="flex gap-1.5 sm:gap-2 items-center">
        <ChatMenu {input} />
        {#if chat.activeAgent}
          {@const Icon = iconRegistry[chat.activeAgent.iconName]}
          <div class="hidden sm:block">
            <PromptInputAction>
              {#snippet tooltip()}
                <p>{chat.activeAgent?.label || "Active Agent"}</p>
              {/snippet}
              <Button
                variant="outline"
                class="h-9 sm:h-10 rounded-full cursor-pointer gap-1.5 sm:gap-2 px-3 sm:px-4 text-xs sm:text-sm"
                onclick={() => (
                  (chat.activeAgent = null), (activeSuggestions = [])
                )}
              >
                <Icon class="size-3.5 sm:size-4" />
                <span class="max-w-[80px] sm:max-w-none truncate"
                  >{chat.activeAgent.label}</span
                >
              </Button>
            </PromptInputAction>
          </div>
        {/if}
      </div>
      <div class="flex gap-1.5 sm:gap-2 items-center">
        {#if userContext.isCoordinator || userContext.isIt}
          <ClassSelector />
        {:else}
          <div class="hidden sm:block">
            <PromptInputAction>
              {#snippet tooltip()}
                Add Resource
              {/snippet}
              <Button
                variant="ghost"
                size="icon"
                class="size-9 sm:size-10 rounded-full cursor-pointer hover:bg-accent/50 transition-colors"
                onclick={() => file.oprnFileDropZone()}
              >
                <Package class="size-4.5 sm:size-5" />
              </Button>
            </PromptInputAction>
          </div>
        {/if}

        <Button
          size="sm"
          class="h-9 w-9 sm:h-10 sm:w-10 rounded-full cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-95"
          onclick={onSubmit}
          disabled={!input.trim()}
        >
          {#if chat.loading}
            <Square class="size-3.5 sm:size-4 fill-current" />
          {:else}
            <ArrowUp class="size-4.5 sm:size-5" />
          {/if}
        </Button>
      </div>
    </PromptInputActions>
  </PromptInput>

  <div
    class={cn(
      "absolute left-0 w-full flex flex-col items-center justify-center gap-4 transition-all duration-300 pointer-events-none",
      isInitial ? "top-full mt-4 sm:mt-8" : "bottom-full mb-4 sm:mb-8",
    )}
  >
    <div
      class="w-full flex flex-col items-center justify-center gap-2 pointer-events-auto"
    >
      {#if !userContext.isCoordinator && !userContext.isIt}
        {#if activeSuggestions.length > 0}
          <div
            class="flex w-full flex-col items-center justify-center space-y-1"
          >
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
          <div
            class="flex w-full flex-col items-center justify-center space-y-1"
          >
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
      {/if}

      <ChatResource {onFileSelected} />
    </div>
  </div>
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
