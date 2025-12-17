<script lang="ts">
  import { PromptSuggestion } from "$lib/components/prompt-kit/prompt-suggestion";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { ArrowUp, Package, Plus, Square } from "@lucide/svelte";

  import { useChat } from "$lib/context/chat-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import {
    PromptInput,
    PromptInputAction,
    PromptInputActions,
    PromptInputTextarea,
  } from "./prompt-kit/prompt-input";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import DropZone from "./drop-zone.svelte";
  import ChatMenu from "./chat-menu.svelte";
  import { iconRegistry } from "$lib/utils/icons";
  import type { ClassStudent } from "$lib/server/repository/student.repo";
  import type { ExamType } from "$lib/schema/result";
  import { getContext } from "svelte";
  import { searchFilter } from "$lib/utils/search";

  let {
    user,
    readonly,
    isInitial = true,
  }: {
    user?: AuthUser;
    readonly: boolean;
    isInitial?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  const students = getContext<ClassStudent[]>(user?.id);

  // State
  let input = $state("");
  let found = $state<ClassStudent[]>([]);
  let activeSuggestions = $state<readonly string[]>([]);
  let activeHighlight = $state<string>("");

  // Context
  const chat = $derived(useChat());
  const file = $derived(useFileActions());

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
    input = `${activeHighlight} for ${student.name} (ID: ${student.id})`;
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
</script>

<div class="relative">
  <PromptInput
    class="border-input bg-popover relative z-10 w-full rounded-3xl border p-0 pt-1 shadow-xs"
    value={input}
    {onValueChange}
    {onSubmit}
  >
    <PromptInputTextarea
      placeholder="Ask anything..."
      class="min-h-11 pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
      {onkeydown}
    />
    <PromptInputActions class="mt-5 flex w-full items-end justify-between gap-2 px-3 pb-3">
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
              onclick={() => ((chat.activeAgent = null), (activeSuggestions = []))}
            >
              <Icon class="size-4" />
              {chat.activeAgent.label}
            </Button>
          </PromptInputAction>
        {/if}
      </div>
      <div class="flex">
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

  {#if isInitial}
    <div class="absolute top-full left-0 w-full flex items-center justify-center mt-2">
      {#if activeSuggestions.length > 0}
        <div class="flex w-full flex-col items-center justify-center space-y-1">
          {#each activeSuggestions as suggestion}
            <PromptSuggestion
              highlight={activeHighlight ?? ""}
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
        <div class="relative flex w-full flex-wrap items-center justify-center gap-2">
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
    </div>
  {/if}
</div>

<input type="file" onchange={file.onchange} class="hidden" id="file-upload" bind:this={file.fileInputRef} />

<DropZone />
