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
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import FileWarningIcon from "@lucide/svelte/icons/file-warning";

  import ShimmerArtifactCard from "./ShimmerArtifactCard.svelte";

  import ErrorAlert from "./shared/ErrorAlert.svelte";

  import { cn } from "$lib/utils/shadcn";
  import { onMount } from "svelte";
  import ActionBar from "./ai-elements/ActionBar.svelte";

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

                    {#if part.type === "data-runInfo"}
                      <div class="text-[10px] text-muted-foreground/40 font-mono px-3 py-1" data-run-id={part.data.runId}>
                        run {part.data.runId.slice(0, 8)}
                      </div>
                    {/if}

                    {#if part.type === "data-validationResult"}
                      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-{part.data.status === 'success' ? 'emerald' : 'amber'}-500/10 border border-{part.data.status === 'success' ? 'emerald' : 'amber'}-500/20 text-[11px] font-medium" data-validation-result={part.data.artifactId}>
                        {#if part.data.status === "success"}
                          <CheckCircleIcon class="size-3.5" />
                          <span>Validation passed.</span>
                        {:else}
                          <AlertCircleIcon class="size-3.5" />
                          <span>Validation found {part.data.errorCount ?? 'multiple'} issue(s).</span>
                        {/if}
                      </div>
                    {/if}

                    {#if part.type === "data-validationErrors"}
                      <details class="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px]" data-validation-errors={part.data.artifactId}>
                        <summary class="font-medium text-amber-700 dark:text-amber-300 cursor-pointer">{part.data.errors.length} validation issue(s)</summary>
                        <ul class="mt-2 space-y-1 list-disc list-inside text-amber-700 dark:text-amber-300">
                          {#each part.data.errors as err}
                            <li><code class="font-mono">{err.path}</code>: {err.message}</li>
                          {/each}
                        </ul>
                      </details>
                    {/if}

                    {#if part.type === "data-committed"}
                      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-300" data-committed={part.data.artifactId}>
                        <CheckCircleIcon class="size-3.5" />
                        <span>Saved <strong>{part.data.studentName}</strong> (record #{part.data.recordId}) in {part.data.className} — {part.data.term}.</span>
                      </div>
                    {/if}

                    {#if part.type === "data-noDocuments"}
                      <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/10 text-[11px] font-medium text-muted-foreground" data-no-documents>
                        <FileWarningIcon class="size-3.5" />
                        <span>{part.data.message}</span>
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

              {#if chat.lastError && message.id === chat.lastMessage?.id}
                <ErrorAlert
                  error={chat.lastError}
                  onRegenerate={() => chat.client.regenerate({ messageId: message.id })}
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

  <!-- Shared Floating Input at bottom.
       ActionBars render ABOVE the ChatComposer with negative margin-bottom
       so their bottom portion slides UNDER the ChatComposer (higher
       z-index). Only the top peek-out band is visible — like an IDE
       permission badge popping out from behind the editor. -->
  <div
    class="absolute bottom-4 left-0 w-full pt-10 pb-4 px-2 sm:px-4 safe-area-bottom pointer-events-none z-50 flex flex-col items-center gap-0"
  >
    {#if chat.awaitingValidation}
      <div
        class="pointer-events-auto w-full max-w-[780px] mb-[-0.625rem] relative z-10"
        data-mode="validation"
      >
        <ActionBar
          mode="validation"
          artifactId={chat.awaitingValidation}
          validating={chat.pendingValidationArtifactId === chat.awaitingValidation}
          context="Marksheet validation required"
          subContext={`marksheets/${chat.selectedClass?.classId ?? '?'} · 2nd term`}
          secondaryLabel="Skip"
          onSecondary={() => chat.cancelValidation()}
          dropdownOptions={[
            { id: 'force-commit', label: 'Force commit (skip auto-fix)' },
            { id: 'save-only', label: 'Save without committing' }
          ]}
          onValidate={(id, dropdownId) => chat.resumeWorkflow(id, dropdownId)}
        />
      </div>
    {/if}
    {#if chat.pendingGate}
      <div
        class="pointer-events-auto w-full max-w-[780px] mb-[-0.625rem] relative z-10"
        data-mode="options"
      >
        <ActionBar
          question={chat.pendingGate.question}
          options={chat.pendingGate.options}
          runId={chat.pendingGate.runId}
          stepId={chat.pendingGate.stepId}
          allowFreeText={chat.pendingGate.allowFreeText}
          onSelect={(selection) => chat.resumePendingGate(selection)}
        />
      </div>
    {/if}
    <div class="pointer-events-auto w-full max-w-[780px] relative z-20">
      <ChatComposer {user} {readonly} isInitial={false} />
    </div>
  </div>
</div>

<PreviewModal />
<ChatResource onFileSelected={() => {}} />
