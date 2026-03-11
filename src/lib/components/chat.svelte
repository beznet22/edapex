<script lang="ts">
  import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
  } from "$lib/components/ai-elements/conversation";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { isToolUIPart } from "ai";
  import { toast } from "svelte-sonner";
  import { Message, MessageContent } from "./ai-elements/message";
  import Shimmer from "./ai-elements/shimmer/Shimmer.svelte";
  import ChatInput from "./chat-input.svelte";
  import ChatResource from "./chat-resource.svelte";
  import MessageAction from "./message-action.svelte";
  import PreviewModal from "./pdf-preview.svelte";
  import { Markdown } from "./prompt-kit/markdown";
  import ToolMessage from "./tool-message.svelte";

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
  const userContext = $derived(UserContext.fromContext());

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

<main class="bg-background relative flex flex-1 min-h-0 w-full flex-col">
  {#if chat.messages.length === 0}
    <!-- Empty State with Centered Input -->
    <div class="relative h-full">
      <div
        class="absolute inset-x-0 top-1/2 mx-auto flex max-w-3xl -translate-y-1/2 flex-col gap-4 px-3 pb-3"
      >
        <h1 class="flex justify-center text-2xl sm:text-4xl font-bold mb-6 sm:mb-10 px-2 text-center">
          {`Good ${userContext.greeting()}, ${userContext.getName(user?.firstName) || "Guest"}!`}
        </h1>
        <ChatInput {user} {readonly} />
      </div>
    </div>
  {:else}
    <!-- Chat Messages -->
    <Conversation class="flex-1 min-h-0 h-auto w-full">
    <ConversationContent class="w-full overscroll-contain touch-pan-y pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
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
                    {#if isToolUIPart(part)}
                      <div class="flex">
                        <ToolMessage {part} />
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

    <!-- Floating Input at bottom -->
    <div class="absolute bottom-0 left-0 w-full bg-linear-to-t from-background via-background/90 to-transparent pt-10 pb-4 px-4 safe-area-bottom pointer-events-none z-10">
      <div class="mx-auto max-w-3xl pointer-events-auto shadow-2xl rounded-3xl sm:rounded-4xl">
        <!-- Help me write an essay about silicon valley -->
        <ChatInput {user} {readonly} isInitial={false} />
      </div>
    </div>
  {/if}
</main>

<PreviewModal />
<ChatResource onFileSelected={() => {}} />
