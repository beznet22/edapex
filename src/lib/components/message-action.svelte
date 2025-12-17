<script lang="ts">
  import { Action, Actions } from "$lib/components/ai-elements/action";
  import type { xUIMessage, xUIMessagePart } from "$lib/types/chat-types";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { Check, Copy, PlayIcon, RefreshCcw, ThumbsDown, ThumbsUp } from "@lucide/svelte";
  import PreviewModal from "./pdf-preview.svelte";

  let {
    message,
    isAssistantCopied,
    isUserCopied,
    copyMessage,
  }: {
    message: xUIMessage;
    isAssistantCopied: boolean;
    isUserCopied: boolean;
    copyMessage: (text: string, role: string) => void;
  } = $props();

  let showModal = $state(false);

  const chat = useChat();
  let doPreview = $derived(
    message.parts.some(
      (part) =>
        part.type === "tool-upsertStudentResult" && part.output?.status === "approved" && part.output?.data
    )
  );

  let token = $derived(
    message.parts.find((part) => part.type === "tool-upsertStudentResult")?.output?.data?.student.token
  );
</script>

{#if message.role === "assistant"}
  <Actions>
    {#if doPreview}
      <Action
        variant="outline"
        tooltip="Preview"
        class="rounded-full text-primary bg-primary/10! border-primary! cursor-pointer"
        onclick={() => {
          showModal = true;
        }}
      >
        <PlayIcon class="size-4" />
      </Action>
    {/if}
    <Action
      tooltip="Copy"
      onclick={() =>
        copyMessage(
          message.parts.map((p: xUIMessagePart) => (p.type === "text" ? p.text : "")).join(""),
          message.role
        )}
    >
      {#if isAssistantCopied}
        <Check class="size-4" />
      {:else}
        <Copy class="size-4" />
      {/if}
    </Action>
    <Action tooltip="Retry" onclick={() => chat.client.regenerate()}>
      <RefreshCcw class="size-4" />
    </Action>
    <Action tooltip="Like">
      <ThumbsUp class="size-4" />
    </Action>
    <Action tooltip="Dislike">
      <ThumbsDown class="size-4" />
    </Action>
  </Actions>
{:else}
  <Actions class="flex justify-end">
    <Action
      tooltip="Copy"
      onclick={() =>
        copyMessage(
          message.parts.map((p: xUIMessagePart) => (p.type === "text" ? p.text : "")).join(""),
          message.role
        )}
    >
      {#if isUserCopied}
        <Check class="size-4" />
      {:else}
        <Copy class="size-4" />
      {/if}
    </Action>
  </Actions>
{/if}

<PreviewModal bind:open={showModal} token={token || ""} />
