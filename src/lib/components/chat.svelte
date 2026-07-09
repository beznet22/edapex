<script lang="ts">
  import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
  } from "$lib/components/ai-elements/conversation";
  import { useChat } from "$lib/context/chat-context.svelte";
  import {
    deriveDocumentId,
    getDocumentStream,
  } from "$lib/context/thread-data.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import type { AuthUser } from "$lib/types/auth-types";
  import { toast } from "svelte-sonner";
  import { Message, MessageContent } from "./ai-elements/message";
  import Shimmer from "./ai-elements/shimmer/Shimmer.svelte";
  import ChatComposer from "./ChatComposer.svelte";
  import ChatResource from "./chat-resource.svelte";
  import PdfLinkCard from "./chat/pdf-link-card.svelte";
  import MessageAction from "./message-action.svelte";
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
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import FileWarningIcon from "@lucide/svelte/icons/file-warning";

  import ArtifactCard from "./ArtifactCard.svelte";
  import ToolGroup from "./chat/ToolGroup.svelte";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "$lib/components/ui/collapsible";

  import ErrorAlert from "./shared/ErrorAlert.svelte";

  import { cn } from "$lib/utils/shadcn";
  import { onMount } from "svelte";
  import ActionBar from "./chat/ActionBar.svelte";
  import Loader from "./prompt-kit/loader/loader.svelte";

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

  const lastAssistantMessage = $derived(
    [...chat.messages].reverse().find((m) => m.role === "assistant"),
  );

  const lastValidationMessage = $derived(
    chat.messages.find((m) => {
      if (m.role !== "assistant") return false;
      return m.parts.some((p) => p.type === "data-awaitValidation");
    }),
  );

  let awaitValidation = $derived(
    lastValidationMessage?.parts.find((p) => p.type === "data-awaitValidation"),
  );

  const hasDataFields = $derived(
    !!lastAssistantMessage?.parts?.some(
      (p) => p.type === "data-awaitValidation",
    ),
  );

  const hasVisibleContent = $derived(
    !!lastAssistantMessage?.parts?.some(
      (p) => p.type === "reasoning" || p.type === "text",
    ),
  );

  const reasoningIsStreaming = $derived.by(() => {
    if (chat.status !== "streaming") return false;
    if (chat.lastMessage?.id !== lastAssistantMessage?.id) return false;
    return lastAssistantMessage?.parts?.at(-1)?.type === "reasoning";
  });

  const inlineDocumentStreams = $derived.by(() => {
    const result: Array<{
      documentId: string;
      toolCallId: string;
      status: "processing" | "streaming" | "success" | "error";
      title: string;
      content: string;
    }> = [];
    for (const message of chat.messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts ?? []) {
        const p = part as {
          type?: string;
          toolCallId?: string;
          state?:
            | "input-streaming"
            | "input-available"
            | "output-available"
            | "output-error";
          input?: { contentHash?: string; fileName?: string };
          output?: { fileName?: string; title?: string };
        };
        if (p.type !== "tool-streamDocument" || !p.toolCallId) continue;
        const documentId = deriveDocumentId(p.input ?? {});
        const entry = getDocumentStream(documentId);
        const status: "processing" | "streaming" | "success" | "error" =
          p.state === "output-available"
            ? "success"
            : p.state === "output-error"
              ? "error"
              : (entry?.status ?? "processing");
        result.push({
          documentId,
          toolCallId: p.toolCallId,
          status,
          title:
            p.output?.fileName ??
            p.output?.title ??
            p.input?.fileName ??
            entry?.title ??
            "Document",
          content: entry?.content ?? "",
        });
      }
    }
    return result;
  });

  const messagesWithToolSplit = $derived(
    chat.messages.map((m) => ({
      ...m,
      toolParts: m.parts.filter((p) => p.type.startsWith("tool-")),
      nonToolParts: m.parts.filter((p) => !p.type.startsWith("tool-")),
      hasArtifact: m.parts.some(
        (p) => p.type === "data-streamDocument" || p.type === "data-generatePDF",
      ),
    })),
  );
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
          class="size-20 dark:invert opacity-90 relative z-10 drop-shadow-[0_0_15px_color-mix(in_oklch,var(--primary),transparent_70%)] transition-all duration-700 group-hover:opacity-100"
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
        <div class="space-y-6 py-4 mx-auto max-w-3xl px-4 pb-52 sm:pb-56">
          {#each messagesWithToolSplit as message}
            {@const toolParts = message.toolParts}
            {@const hasArtifact = message.hasArtifact}
            <div class="group relative">
              <Message from={message.role} class="py-0">
                <MessageContent
                  variant="flat"
                  class="pb-2 {message.role === 'user' ? 'bg-accent!' : ''}"
                >
                  {#each message.parts as part}
                    {#if part.type === "reasoning"}
                      <Reasoning
                        class="w-full mb-2"
                        isStreaming={reasoningIsStreaming}
                      >
                        <ReasoningTrigger>
                          <span class="text-primary">Thinking...</span>
                        </ReasoningTrigger>
                        <ReasoningContent>
                          <Markdown
                            class="**:text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
                            content={part.text}
                            animation={{ enabled: true }}
                          />
                        </ReasoningContent>
                      </Reasoning>
                    {/if}
                    {#if part.type === "text"}
                      <Markdown
                        class="prose prose-sm dark:prose-invert max-w-none"
                        content={part.text}
                        animation={{ enabled: true }}
                      />
                    {/if}
                  {/each}
                </MessageContent>
              </Message>

              {#if message.role === "assistant" && message.id === lastAssistantMessage?.id && chat.status === "streaming" && !hasVisibleContent}
                <Shimmer as="p" spread={3} duration={2} content_length={20}>
                  <span>Generating response...</span>
                </Shimmer>
              {/if}

              {#if hasArtifact}
                <Collapsible open={true}>
                  <CollapsibleTrigger class="group flex w-full items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
                    Thinking completed
                    <ChevronDownIcon class="size-3 transition-transform group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {#each inlineDocumentStreams as stream (stream.toolCallId)}
                      {#if message.parts?.some((p) => (p as { type?: string; toolCallId?: string }).type === "tool-streamDocument" && (p as { toolCallId?: string }).toolCallId === stream.toolCallId)}
                        <div class="mt-2 mb-2 w-full">
                          <ArtifactCard
                            artifactId={stream.documentId}
                            title={stream.title}
                            status={stream.status}
                          />
                        </div>
                      {/if}
                    {/each}
                  </CollapsibleContent>
                </Collapsible>
              {/if}

              {#if toolParts.length > 0}
                <div class="mt-2">
                  <ToolGroup parts={toolParts} />
                </div>
              {/if}

              {#if chat.lastError && message.id === chat.lastMessage?.id}
                <ErrorAlert
                  error={chat.lastError}
                  onRegenerate={() =>
                    chat.client.regenerate({ messageId: message.id })}
                  onClearContext={() => {
                    chat.client.messages = chat.messages.slice(0, -1);
                    chat.client.clearError();
                  }}
                />
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

  <div
    class="absolute bottom-4 left-0 w-full pt-10 pb-4 px-2 sm:px-4 safe-area-bottom pointer-events-none z-50 flex flex-col items-center gap-0"
  >
    <div
      class="pointer-events-auto w-full max-w-[780px] relative z-20 flex flex-col rounded-4xl overflow-hidden border border-border/10"
    >
      {#if awaitValidation?.type === "data-awaitValidation"}
        <ActionBar
          mode="validation"
          artifactId={awaitValidation.data.artifactId}
          validating={chat.pendingValidationArtifactId ===
            awaitValidation.data.artifactId}
          context="Marksheet validation required"
          subContext={`marksheets/${chat.selectedClass?.classId ?? "?"} · 2nd term`}
          secondaryLabel="Skip"
          onSecondary={() => chat.cancelValidation()}
          dropdownOptions={[
            { id: "force-commit", label: "Force commit (skip auto-fix)" },
            { id: "save-only", label: "Save without committing" },
          ]}
          onValidate={(id, dropdownId) => chat.resumeWorkflow(id, dropdownId)}
        />
      {/if}
      <ChatComposer {user} {readonly} isInitial={false} />
    </div>
  </div>
</div>

<ChatResource onFileSelected={() => {}} />
