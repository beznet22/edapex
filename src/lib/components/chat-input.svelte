 and https://mastra.ai/docs/workspace/skills<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import PackageIcon from "@lucide/svelte/icons/package";
  import SquareIcon from "@lucide/svelte/icons/square";
  import XIcon from "@lucide/svelte/icons/x";
  import SearchIcon from "@lucide/svelte/icons/search";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import { innerWidth } from "svelte/reactivity/window";

  import { useChat } from "$lib/context/chat-context.svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { ClassStudent } from "$lib/server/repository/student.repo";
  import type { AuthUser } from "$lib/types/auth-types";
  import { iconRegistry } from "$lib/utils/icons";
  import { searchFilter } from "$lib/utils/search";
  import ChatMenu from "./chat-menu.svelte";
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
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { cn } from "$lib/utils/shadcn";
  import { loadStudentFile } from "$lib/api/student-api";
  import { toast } from "svelte-sonner";

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
  let autocompleteMode = $state<"agent" | "student" | null>(null);
  let agentWidth = $state(80); // Sensible default to prevent large layout shifts

  // Context
  const chat = useChat();
  const file = useFileActions();
  const userContext = UserContext.fromContext();
  const students = $derived(userContext.students);

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
      // scroll to bottom
      chat.scrollToBottom();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    // On mobile-width screens, Enter just inserts newline; send button is used instead
    if ((innerWidth.current ?? 768) < 640) return;

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
    autocompleteMode = null;

    // Agent Autocomplete (/)
    const agentMatch = value.match(/\/(\w*)$/);
    if (agentMatch) {
      autocompleteMode = "agent";
      // Optional: filter agents based on query if needed,
      // e.g., chat.agents.filter(a => a.label.toLowerCase().includes(agentMatch[1].toLowerCase()))
      // For now, we show all, or let the user pick.
    }

    // Student Autocomplete (@)
    else {
      const studentMatch = value.match(/@([^@]*)$/);
      if (studentMatch) {
        autocompleteMode = "student";
        const query = studentMatch[1];
        if (!query.trim()) {
          found = students;
        } else {
          found = searchFilter(query, students);
        }
      } else {
        // Legacy search filter - can keep or refactor
        found = searchFilter(value, students);
      }
    }
  }

  let handleSuggestionClick = (suggestion: string) => {
    input = suggestion;
    activeHighlight = suggestion;
  };

  async function handleStudentClick(student: ClassStudent) {
    if (!chat.selectedClass) {
      toast.error("No class selected context");
      input = input.replace(/@\w*$/, "");
      autocompleteMode = null;
      return;
    }

    try {
      toast.info(`Loading context for ${student.name || "Student"}...`);
      // Optimistic update
      chat.studentData = student;

      const data = await loadStudentFile(
        student.id!,
        chat.selectedClass!.classId!,
        chat.selectedClass!.sectionId!,
      );

      // Remove the @mention query from input
      const replaceQuery = (val: string) => {
        const match = val.match(/@([^@]*)$/);
        if (match) {
          const query = match[1];
          const lastIndex = val.lastIndexOf("@" + query);
          if (lastIndex !== -1) {
            return val.substring(0, lastIndex).trimEnd();
          }
        }
        return val.replace(/@\w*$/, "").trimEnd();
      };

      input = replaceQuery(input);

      if (data) {
        toast.success("Student context loaded");
        chat.studentData = { ...student, ...data }; // Update context
      } else {
        toast.warning("No assessment file found for student");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load student file");
      // Even if failed, we should probably clear the query or let user retry
    }

    autocompleteMode = null;
  }

  let handleAgentClick = (id: string) => {
    const agent = chat.agents.find((a) => a.id === id);
    if (!agent) return;
    const { suggestions, highlight } = agent.assistants[0];

    activeSuggestions = suggestions ?? [];
    activeHighlight = highlight ?? "";
    chat.activeAgent = agent ?? null;
    input = input.replace(/\/$/, ""); // Remove the slash
    autocompleteMode = null;
    toast.success(`Agent switched to ${agent.label}`);
  };

  function onFileSelected(files: FileList) {
    file.add(files);
  }
</script>

<div class="relative transition-all duration-300">
  <PromptInput
    class="border-input bg-popover/95 backdrop-blur-md relative z-10 w-full rounded-[20px] sm:rounded-3xl border p-0 pt-1 shadow-sm transition-all duration-200 focus-within:shadow-md focus-within:border-primary/30"
    value={input}
    {onValueChange}
    {onSubmit}
  >
    {#if file.files.length > 0 || chat.studentData}
      <div
        class="flex flex-wrap gap-1.5 sm:gap-2 px-3 pb-2 transition-all duration-300 ease-in-out"
      >
        {#if chat.studentData}
          <div
            class="flex items-center gap-1.5 sm:gap-2 rounded-full border bg-primary/10 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs transition-all hover:bg-primary/20"
          >
            <GraduationCapIcon class="size-3.5 text-primary" />
            <span
              class="max-w-20 sm:max-w-[120px] truncate font-medium text-primary"
            >
              @{chat.studentData.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              class="size-3.5 rounded-full cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors"
              onclick={() => (chat.studentData = undefined)}
            >
              <XIcon class="size-3" />
            </Button>
          </div>
        {/if}

        {#each file.files as f, i (f.name + i)}
          <div
            class="flex items-center gap-1.5 sm:gap-2 rounded-full border bg-muted/50 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs transition-all hover:bg-muted"
          >
            <span class="max-w-20 sm:max-w-[120px] truncate">{f.name}</span>
            {#if file.uploads.some((u) => u.filename === f.name && ["extracted", "approved", "published"].includes(u.status))}
              <CheckIcon class="size-3 text-green-500" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "uploaded")}
              <TriangleAlertIcon class="size-3 text-primary" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "uploading")}
              <Loader variant="circular" class="size-3" />
            {:else if file.uploads.some((u) => u.filename === f.name && u.status === "error")}
              <CircleAlertIcon class="size-3 text-destructive" />
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="size-3.5 rounded-full cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
              onclick={() => file.remove(i)}
            >
              <XIcon class="size-3" />
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Inlined Agent UI -->
    {#if chat.activeAgent}
      {@const Icon = iconRegistry[chat.activeAgent.iconName]}
      <div
        bind:clientWidth={agentWidth}
        class="absolute top-[8px] left-2.5 z-20 pointer-events-auto"
      >
        <div
          class="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 pl-2 pr-1 h-[28px] text-[11px] font-semibold backdrop-blur-md shadow-sm text-primary animate-in fade-in zoom-in duration-200"
        >
          <Icon class="size-3.5" />
          <span class="max-w-[50px] truncate">{chat.activeAgent.label}</span>
          <Button
            variant="ghost"
            size="icon"
            class="size-5 rounded-full hover:bg-primary/20 transition-colors cursor-pointer"
            onclick={() => {
              chat.activeAgent = null;
              activeSuggestions = [];
            }}
          >
            <XIcon class="size-3.5" />
          </Button>
        </div>
      </div>
    {/if}

    <PromptInputTextarea
      placeholder="Ask anything..."
      class="min-h-[44px] pt-[11px] text-base leading-tight sm:text-base md:text-base selection:bg-primary/30 placeholder:transition-all"
      style="text-indent: {chat.activeAgent ? agentWidth + 8 : 0}px; padding-left: 12px;"
      {onkeydown}
    />

    <PromptInputActions
      class="mt-2 sm:mt-5 flex w-full items-end justify-between gap-2 px-2.5 sm:px-3 pb-2.5 sm:pb-3"
    >
      <div class="flex gap-1 sm:gap-1.5 items-center">
        <ChatMenu {input} />
      </div>
      <div class="flex gap-1.5 sm:gap-2 items-center">
        <div>
          <PromptInputAction>
            {#snippet tooltip()}
              Add Resource
            {/snippet}
            <Button
              variant="ghost"
              size="icon"
              class="size-9 sm:size-10 rounded-full cursor-pointer hover:bg-accent/50 transition-colors"
              aria-label="Add Resource"
              onclick={() => {
                if (userContext.students.length === 0) {
                  toast("Please Select a class");
                  return;
                }
                file.openFileDropZone();
              }}
            >
              <PackageIcon class="size-4.5 sm:size-5" />
            </Button>
          </PromptInputAction>
        </div>

        <Button
          size="sm"
          class="h-9 w-9 sm:h-10 sm:w-10 rounded-full cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-95"
          onclick={onSubmit}
          disabled={!input.trim()}
          aria-label={chat.loading ? "Stop generation" : "Send message"}
        >
          {#if chat.loading}
            <SquareIcon class="size-3.5 sm:size-4 fill-current" />
          {:else}
            <ArrowUpIcon class="size-4.5 sm:size-5" />
          {/if}
        </Button>
      </div>
    </PromptInputActions>
  </PromptInput>

  <div
    class={cn(
      "absolute left-0 w-full flex flex-col items-start justify-end gap-2 transition-all duration-300 pointer-events-none px-4",
      "bottom-full mb-2",
    )}
  >
    <div
      class="w-full flex flex-col items-start justify-end gap-2 pointer-events-auto"
    >
      {#if autocompleteMode || (!userContext.isCoordinator && !userContext.isIt && isInitial)}
        {#if autocompleteMode === "student" && found.length > 0}
          <div
            class="flex min-w-[300px] flex-col overflow-x-hidden overflow-y-auto max-h-[300px] rounded-xl border bg-popover p-1 shadow-md"
          >
            <div
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground/70"
            >
              Select Student
            </div>
            {#each found as student}
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                onclick={() => handleStudentClick(student)}
              >
                <div
                  class="flex size-8 items-center justify-center rounded-lg border bg-background"
                >
                  <GraduationCapIcon class="size-4 text-muted-foreground" />
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="font-medium text-foreground">{student.name}</span
                  >
                  <span class="text-[10px] text-muted-foreground">
                    {student.admissionNo}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {:else if autocompleteMode === "agent"}
          <div
            class="flex min-w-[300px] flex-col overflow-x-hidden overflow-y-auto max-h-[300px] rounded-xl border bg-popover p-1 shadow-md"
          >
            <div
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground/70"
            >
              Select Agent
            </div>
            {#each chat.agents as agent}
              {@const Icon = iconRegistry[agent.iconName]}
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                onclick={() => handleAgentClick(agent.id)}
              >
                <div
                  class="flex size-8 items-center justify-center rounded-lg border bg-background"
                >
                  <Icon class="size-4 text-muted-foreground" />
                </div>
                <div class="flex flex-col gap-0.5">
                  <span class="font-medium text-foreground">{agent.label}</span>
                  <span class="text-[10px] text-muted-foreground capitalize">
                    AI Agent
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {:else if activeSuggestions.length > 0}
          <!-- Default suggestions when input is empty or no trigger -->
          <div
            class="flex min-w-[300px] flex-col overflow-x-hidden overflow-y-auto max-h-[300px] rounded-xl border bg-popover p-1 shadow-md"
          >
            <div
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground/70"
            >
              Suggestions
            </div>
            {#each activeSuggestions as suggestion}
              <button
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                onclick={() => handleSuggestionClick(suggestion)}
              >
                <div
                  class="flex size-8 items-center justify-center rounded-lg border bg-background"
                >
                  <SearchIcon class="size-4 text-muted-foreground" />
                </div>
                <span class="text-foreground">{suggestion}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
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
