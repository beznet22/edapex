<script lang="ts">
  import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
  } from "$lib/components/ai-elements/conversation";
  import { useChat } from "$lib/context/chat-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { isToolUIPart } from "ai";
  import { toast } from "svelte-sonner";
  import { Message, MessageContent } from "./ai-elements/message";
  import ChatInput from "./chat-input.svelte";
  import MessageAction from "./message-action.svelte";
  import { Markdown } from "./prompt-kit/markdown";
  import ToolMessage from "./tool-message.svelte";
  import Shimmer from "./ai-elements/shimmer/Shimmer.svelte";

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
  let showModal = $state(false);

  // Context
  const chat = $derived(useChat());
  let doPreview = $derived(
    chat.lastMessage?.parts.some(
      (part) =>
        part.type === "tool-upsertStudentResult" && part.output?.status === "approved" && part.output?.data
    )
  );

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

<main class="bg-background relative flex h-[calc(100vh-5rem)] flex-col">
  {#if chat.messages.length === 0}
    <!-- Empty State with Centered Input -->
    <div class="relative h-full">
      <div
        class="absolute inset-x-0 top-1/2 mx-auto flex max-w-3xl -translate-y-1/2 flex-col gap-4 px-3 pb-3"
      >
        <ChatInput {user} {readonly} />
      </div>
    </div>
  {:else}
    <!-- Chat Messages -->
    <Conversation>
      <ConversationContent class="w-full">
        <div class="space-y-6 py-4 mx-auto max-w-3xl px-4">
          {#each chat.messages as message}
            <div class="group relative">
              <Message from={message.role} class="py-0">
                <MessageContent variant="flat" class="pb-2 {message.role === 'user' ? 'bg-accent!' : ''}">
                  {#each message.parts as part}
                    <!-- Then render tool parts -->
                    {#if isToolUIPart(part)}
                      <div class="flex">
                        <ToolMessage {part} bind:showModal />
                      </div>
                    {/if}
                    <!-- Rrender text parts -->
                    {#if part.type === "text"}
                      {#if message.role === "assistant"}
                        <Markdown content={part.text} animation={{ enabled: true }} />
                      {:else}
                        <div class="prose prose-sm dark:prose-invert max-w-none">
                          {part.text}
                        </div>
                      {/if}
                    {/if}
                  {/each}
                </MessageContent>
              </Message>
              {#if chat.status === "submitted" && chat.lastMessage?.role === "user"}
                <Shimmer as="p" spread={3} duration={2} content_length={18}>
                  {#snippet children()}
                    Generating response...
                  {/snippet}
                </Shimmer>
              {/if}

              <!-- Actions for both user and assistant messages -->
              {#if chat.status === "ready"}
                <MessageAction {message} {isAssistantCopied} {isUserCopied} {copyMessage} />
              {/if}
            </div>
          {/each}
        </div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>

    <!-- Input at bottom -->
    <div class="px-4 py-4">
      <div class="mx-auto max-w-3xl">
        <!-- Help me write an essay about silicon valley -->
        <ChatInput {user} {readonly} isInitial={false} />
      </div>
    </div>
  {/if}
</main>
