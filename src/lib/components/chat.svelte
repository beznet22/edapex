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
  import PdfLinkCard from "./chat/pdf-link-card.svelte";
  import MessageAction from "./message-action.svelte";
  import PreviewModal from "./pdf-preview.svelte";
  import { Markdown } from "./prompt-kit/markdown";
  import {
    Reasoning,
    ReasoningTrigger,
    ReasoningContent,
  } from "./prompt-kit/reasoning";
  import ToolMessage from "./tool-message.svelte";
  import { Button } from "./ui/button";
  import * as Tooltip from "./ui/tooltip";

  import FolderIcon from "@lucide/svelte/icons/folder";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import MapIcon from "@lucide/svelte/icons/map";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import * as Alert from "$lib/components/ui/alert";

  import ShimmerArtifactCard from "./ShimmerArtifactCard.svelte";

  import { cn } from "$lib/utils/shadcn";
  import { onMount } from "svelte";

  let {
    user,
    readonly,
    class: className,
  }: {
    class?: string;
    user?: AuthUser;
    readonly: boolean;
  } = $props();

  // State
  let isAssistantCopied = $state(false);
  let isUserCopied = $state(false);

  // Context
  const chat = $derived(useChat());
  const userContext = UserContext.fromContext();

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

  $effect(() => {
    console.log(chat.messages);
  });
</script>

<div
  class={cn(
    "relative flex flex-1 min-h-0 w-full flex-col bg-background font-sans selection:bg-primary/30",
    className,
  )}
>
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
                  {@const mergedReasoning = (() => {
                    // Collect ALL reasoning parts regardless of position
                    return message.parts
                      .filter((p) => p.type === "reasoning")
                      .map((p) => (p as any).text || "")
                      .filter(Boolean)
                      .join("\n\n");
                  })()}
                  {@const nonReasoningParts = message.parts.filter(
                    (p) => p.type !== "reasoning",
                  )}

                  <!-- Render single merged reasoning block at the top -->
                  {#if mergedReasoning}
                    <div class="mb-2">
                      <Reasoning
                        isStreaming={chat.status === "streaming" &&
                          message.id === chat.lastMessage?.id}
                      >
                        <ReasoningTrigger>Thinking process...</ReasoningTrigger>
                        <ReasoningContent
                          class="border-l-2 border-primary/20 pl-4 py-1 my-2"
                          contentClass="!text-muted prose-sm"
                        >
                          <Markdown
                            content={mergedReasoning}
                            animation={{ enabled: false }}
                          />
                        </ReasoningContent>
                      </Reasoning>
                    </div>
                  {/if}

                  <!-- Render all non-reasoning parts -->
                  {#each nonReasoningParts as part}
                    {#if part.type === "data-createDocument"}
                      <div class="my-2">
                        <ShimmerArtifactCard
                          id={part.id ?? `shimmer-${part.data?.title ?? "doc"}`}
                          title={part.data?.title ?? "Document"}
                          status={part.data?.status ?? "processing"}
                          content={part.data?.content ?? ""}
                        />
                      </div>
                    {/if}

                    {#if part.type === "data-generatePDF"}
                      <div class="my-2">
                        <ShimmerArtifactCard
                          id={part.id ?? `shimmer-${part.data?.title ?? "pdf"}`}
                          title={part.data?.title ?? "PDF"}
                          status={part.data?.status ?? "processing"}
                          content={part.data?.data ?? ""}
                          kind="pdf"
                        />
                      </div>
                    {/if}

                    {#if part.type === "tool-invocation"}
                      <div class="flex">
                        <ToolMessage {part} />
                      </div>
                    {/if}

                    {#if part.type === "text"}
                      {#if message.role === "assistant"}
                        {@const pdfLinks = Array.from(
                          part.text.matchAll(
                            /\[([^\]]+)\]\(([^)]+\.pdf|[^)]+\/api\/results\/[^)]+)\)/g,
                          ),
                        ).map((m) => ({ text: m[1], url: m[2] }))}
                        <Markdown
                          content={part.text}
                          animation={{ enabled: true }}
                        />
                        {#if pdfLinks.length > 0}
                          <div class="mt-4 flex flex-col gap-2">
                            {#each pdfLinks as link}
                              <PdfLinkCard
                                filename={link.text}
                                url={link.url}
                              />
                            {/each}
                          </div>
                        {/if}
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
              {#if chat.status === "submitted" && message.id === chat.lastMessage?.id && chat.lastMessage?.role === "assistant"}
                <Shimmer as="p" spread={3} duration={2} content_length={18}>
                  {#snippet children()}
                    Generating response...
                  {/snippet}
                </Shimmer>
              {/if}

              {#if chat.error && message.id === chat.lastMessage?.id}
                <Alert.Root
                  variant="destructive"
                  class="bg-destructive/10 border-dashed border-destructive/50 text-destructive"
                >
                  <TriangleAlertIcon class="size-4" />
                  <Alert.Title>Error</Alert.Title>
                  <Alert.Description>
                    {(() => {
                      const message = chat.error?.message ?? "";
                      const retryInfo =
                        "\n\nIf the issue persists, try clearing the conversation or contacting support for assistance.";
                      return message + retryInfo;
                    })()}
                  </Alert.Description>
                </Alert.Root>
              {/if}
              <!-- Actions for both user and assistant messages -->
              {#if chat.status === "ready" || chat.status === "error"}
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
    class="absolute bottom-4 left-0 w-full pt-10 pb-4 px-2 sm:px-4 safe-area-bottom pointer-events-none z-50 flex justify-center"
  >
    <div class="pointer-events-auto w-full max-w-[780px]">
      <ChatComposer {user} {readonly} isInitial={false} />
    </div>
  </div>
</div>

<PreviewModal />
<ChatResource onFileSelected={() => {}} />
