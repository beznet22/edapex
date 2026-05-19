<script lang="ts">
  import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
  } from "$lib/components/ai-elements/conversation";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { toast } from "svelte-sonner";
  import { Message, MessageContent } from "./ai-elements/message";
  import Shimmer from "./ai-elements/shimmer/Shimmer.svelte";
  import ChatComposer from "./ChatComposer.svelte";
  import ChatResource from "./chat-resource.svelte";
  import MessageAction from "./message-action.svelte";
  import PreviewModal from "./pdf-preview.svelte";
  import { Markdown } from "./prompt-kit/markdown";
  import { Reasoning, ReasoningTrigger, ReasoningContent } from "./prompt-kit/reasoning";
  import ToolMessage from "./tool-message.svelte";
  import { Button } from "./ui/button"; 
  import * as Tooltip from "./ui/tooltip";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuGroup,
    DropdownMenuLabel,
  } from "./ui/dropdown-menu";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import MapIcon from "@lucide/svelte/icons/map";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import { cn } from "$lib/utils/shadcn";

  let {
    user,
    readonly,
  }: {
    user?: AuthUser;
    readonly: boolean;
  } = $props();

  // State
  let isAssistantCopied = $state(false);
  let isUserCopied = $state(false);

  // Context
  const chat = $derived(useChat());
  const userContext = UserContext.fromContext();
  let dropdownOpen = $state(false);

  let groupedClasses = $derived(() => {
    const groups: Record<string, any[]> = {
      "CRECHE": [],
      "NURSERY": [],
      "GRADEK": [],
      "LOWER BASIC": [],
      "MIDDLE BASIC": [],
      "OTHER": []
    };
    
    for (const cls of userContext?.classes || []) {
      const name = cls.className?.toUpperCase() || "";
      if (name.includes("CREACH") || name.includes("CRECHE") || name.includes("DAYCARE")) {
        groups["CRECHE"].push(cls);
      } else if (name.includes("NURSERY")) {
        groups["NURSERY"].push(cls);
      } else if (name.includes("GRADE K") || name.includes("GRADEK") || name.includes("GRADE")) {
        groups["GRADEK"].push(cls);
      } else if (name.includes("LOWER BASIC")) {
        groups["LOWER BASIC"].push(cls);
      } else if (name.includes("MIDDLE BASIC")) {
        groups["MIDDLE BASIC"].push(cls);
      } else {
        groups["OTHER"].push(cls);
      }
    }
    return Object.entries(groups).filter(([_, classes]) => classes.length > 0);
  });

  let copyMessage = (content: string, role: string) => {
    navigator.clipboard.writeText(content);
    if (role === "assistant") {
      isAssistantCopied = true;
    } else {
      isUserCopied = true;
    }

    toast.success("Copied to clipboard!");
    setTimeout(() => {
      if (role === "assistant") {
        isAssistantCopied = false;
      } else {
        isUserCopied = false;
      }
    }, 2000);
  };
</script>

<div
  class="relative flex flex-1 min-h-0 w-full flex-col bg-background font-sans selection:bg-primary/30"
>
  {#if user?.designation && user.designation !== "class_teacher"}
    <div
      class="absolute top-10 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-4 duration-1000"
    >
      <DropdownMenu bind:open={dropdownOpen}>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              class="h-10 px-6 gap-3 rounded-full hermes-glass border border-primary/20 hover:border-primary/50 transition-all duration-300 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] hover:shadow-primary/20 group/trigger relative overflow-hidden"
            >
              <!-- Sublte gold glow behind button -->
              <div class="absolute inset-0 bg-primary/5 blur-xl group-hover:bg-primary/10 transition-colors"></div>
              
              <div class="flex flex-col items-start leading-none relative z-10">
                <span
                  class="text-[9px] uppercase tracking-widest text-primary/50 font-bold mb-0.5"
                  >Staff Portal</span
                >
                <span
                  class="text-[12px] font-bold tracking-wide uppercase text-primary/90 group-hover/trigger:text-primary transition-colors"
                >
                  {chat.selectedClass?.className || "Switch Context"}
                </span>
              </div>
              <ChevronDownIcon
                class="size-4 opacity-60 group-hover/trigger:opacity-100 transition-opacity relative z-10"
              />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="hermes-glass border-primary/20 min-w-[260px] max-h-[320px] overflow-y-auto p-1.5 shadow-2xl custom-scrollbar"
          align="center"
          sideOffset={12}
        >
          {#each groupedClasses() as [groupName, classes], i}
            <DropdownMenuGroup>
              <DropdownMenuLabel
                class="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5"
              >
                {groupName}
              </DropdownMenuLabel>
              {#each classes as cls (cls.id)}
                <DropdownMenuItem
                  onSelect={() => (chat.selectedClass = cls)}
                  class={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl transition-all duration-200 cursor-pointer mb-0.5 last:mb-0",
                    chat.selectedClass?.id === cls.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-primary/5",
                  )}
                >
                  <div class="flex min-w-0 flex-1 justify-between">
                    <span class="text-[13px] font-semibold truncate leading-tight"
                      >{cls.className}</span
                    >
                    <span 
                      class={cn(
                        "opacity-60 truncate size-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors",
                        chat.selectedClass?.id === cls.id
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          : "bg-secondary text-muted-foreground",
                      )}
                      >{cls.sectionName || "Universal Content"}</span
                    >
                  </div>
                  {#if chat.selectedClass?.id === cls.id}
                    <CircleCheckIcon class="size-4 text-primary ml-auto" />
                  {/if}
                </DropdownMenuItem>
              {/each}
            </DropdownMenuGroup>
          {:else}
            <div
              class="px-3 py-6 text-center text-xs text-muted-foreground italic"
            >
              No classes assigned to this account
            </div>
          {/each}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  {/if}

  {#if chat.messages.length === 0}
    <!-- Welcome Hero State -->
    <div class="flex-1 flex flex-col items-center justify-center px-4 -mt-12">

      <div class="mb-8 relative group">
        <!-- Ultra-soft outer glow -->
        <div
          class="absolute inset-0 bg-primary/10 blur-[160px] rounded-full scale-150 animate-pulse-slow transition-all duration-1000"
          style="animation-duration: 8s;"
        ></div>
        <!-- Medium inner glow -->
        <div
          class="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-110 group-hover:scale-125 transition-transform duration-1000"
        ></div>
        <!-- Core warmth layer -->
        <div
          class="absolute inset-0 bg-primary/25 blur-xl rounded-full scale-90 group-hover:scale-105 transition-transform duration-1000"
        ></div>

        <img
          src="/logo.svg"
          alt="Hermes Logo"
          class="size-20 dark:invert opacity-90 relative z-10 drop-shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all duration-700 group-hover:opacity-100"
        />
      </div>

      <div class="text-center space-y-3 mb-10 max-w-xl">
        <h1
          class="text-3xl sm:text-4xl font-bold text-foreground tracking-tight"
        >
          What can I help with?
        </h1>
        <p class="text-muted-foreground text-sm sm:text-base leading-relaxed">
          Ask anything, run commands, explore files, or<br
            class="hidden sm:block"
          /> manage your scheduled tasks.
        </p>
      </div>

      <!-- Suggestion Buttons -->
      <div class="w-full max-w-xl space-y-3">
        <Button
          variant="ghost"
          class="w-full h-14 justify-start px-5 gap-4 bg-secondary/40 border border-primary/20 hover:bg-secondary/60 hover:border-primary/50 text-foreground/80 rounded-3xl group transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/5"
        >
          <FolderIcon
            class="size-5 text-muted-foreground group-hover:text-primary transition-colors"
          />
          <span class="text-sm font-medium"
            >What files are in this workspace?</span
          >
        </Button>
        <Button
          variant="ghost"
          class="w-full h-14 justify-start px-5 gap-4 bg-secondary/40 border border-primary/20 hover:bg-secondary/60 hover:border-primary/50 text-foreground/80 rounded-3xl group transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/5"
        >
          <CalendarIcon
            class="size-5 text-muted-foreground group-hover:text-primary transition-colors"
          />
          <span class="text-sm font-medium">What's on my schedule today?</span>
        </Button>
        <Button
          variant="ghost"
          class="w-full h-14 justify-start px-5 gap-4 bg-secondary/40 border border-primary/20 hover:bg-secondary/60 hover:border-primary/50 text-foreground/80 rounded-3xl group transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-primary/5"
        >
          <MapIcon
            class="size-5 text-muted-foreground group-hover:text-primary transition-colors"
          />
          <span class="text-sm font-medium">Help me plan a small project.</span>
        </Button>
      </div>
    </div>
  {:else}
    <!-- Chat Messages -->
    <Conversation class="flex-1 min-h-0 h-auto w-full">
      <ConversationContent
        class="w-full overscroll-contain touch-pan-y pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <!-- Add padding bottom so messages don't hide behind floating input -->
        <div class="space-y-6 py-4 mx-auto max-w-3xl px-4 pb-32 sm:pb-36">
          {#each chat.messages as message}
            <div class="group relative">
              <Message from={message.role} class="py-0">
                <MessageContent
                  variant="flat"
                  class="pb-2 {message.role === 'user' ? 'bg-accent!' : ''}"
                >
                  {#each message.parts as part}
                    <!-- Then render tool parts -->
                    {#if part.type === 'tool-invocation'}
                      <div class="flex">
                        <ToolMessage {part} />
                      </div>
                    {/if}
                    <!-- Render reasoning parts -->
                    {#if part.type === "reasoning"}
                      <div class="mb-2">
                        <Reasoning isStreaming={chat.status === "streaming" && message.id === chat.lastMessage?.id}>
                          <ReasoningTrigger>Thinking process...</ReasoningTrigger>
                          <ReasoningContent class="text-muted-foreground text-sm border-l-2 border-primary/20 pl-4 py-1 my-2">
                            <Markdown content={part.text || ""} animation={{ enabled: false }} />
                          </ReasoningContent>
                        </Reasoning>
                      </div>
                    {/if}

                    <!-- Render text parts -->
                    {#if part.type === "text"}
                      {#if message.role === "assistant"}
                        <Markdown
                          content={part.text}
                          animation={{ enabled: true }}
                        />
                      {:else}
                        <div
                          class="prose prose-sm dark:prose-invert max-w-none"
                        >
                          {part.text}
                        </div>
                      {/if}
                    {/if}
                  {/each}
                </MessageContent>
              </Message>
              {#if chat.status === "submitted" && message.id === chat.lastMessage?.id && chat.lastMessage?.role === "user"}
                <Shimmer as="p" spread={3} duration={2} content_length={18}>
                  {#snippet children()}
                    Generating response...
                  {/snippet}
                </Shimmer>
              {/if}

              <!-- Actions for both user and assistant messages -->
              {#if chat.status === "ready"}
                <MessageAction
                  {message}
                  {isAssistantCopied}
                  {isUserCopied}
                  {copyMessage}
                />
              {/if}
            </div>
          {/each}
        </div>
      </ConversationContent>
      <ConversationScrollButton class="bottom-36 sm:bottom-40 z-20" />
    </Conversation>
  {/if}

  <!-- Shared Floating Input at bottom -->
  <div
    class="absolute bottom-0 left-0 w-full pt-10 pb-4 px-4 safe-area-bottom pointer-events-none z-50 flex justify-center"
  >
    <div class="pointer-events-auto w-full max-w-[780px]">
      <ChatComposer {user} {readonly} isInitial={false} />
    </div>
  </div>
</div>

<PreviewModal />
<ChatResource onFileSelected={() => {}} />
