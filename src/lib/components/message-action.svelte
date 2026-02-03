<script lang="ts">
  import { Action, Actions } from "$lib/components/ai-elements/action";
  import type { xUIMessage, xUIMessagePart } from "$lib/types/chat-types";
  import { useChat } from "$lib/context/chat-context.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import PlayIcon from "@lucide/svelte/icons/play";
  import RefreshCcwIcon from "@lucide/svelte/icons/refresh-ccw";
  import ThumbsDownIcon from "@lucide/svelte/icons/thumbs-down";
  import ThumbsUpIcon from "@lucide/svelte/icons/thumbs-up";
  import PreviewModal from "./pdf-preview.svelte";
  import { goto } from "$app/navigation";

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
        part.type === "tool-upsertStudentResult" &&
        (part as any).output?.status === "approved" &&
        (part as any).output?.data,
    ),
  );

  let token = $derived(
    (
      message.parts.find(
        (part) => part.type === "tool-upsertStudentResult",
      ) as any
    )?.output?.data?.student.token,
  );
</script>

{#if message.role === "assistant"}
  <Actions>
    {#if doPreview}
      <Action
        variant="outline"
        tooltip="Preview"
        class="rounded-full text-primary bg-primary/10! border-primary! cursor-pointer"
        onclick={() => goto(`#${token}`)}
      >
        <PlayIcon class="size-4" />
      </Action>
    {/if}
    <Action
      tooltip="Copy"
      onclick={() =>
        copyMessage(
          message.parts
            .map((p: xUIMessagePart) => (p.type === "text" ? p.text : ""))
            .join(""),
          message.role,
        )}
    >
      {#if isAssistantCopied}
        <CheckIcon class="size-4" />
      {:else}
        <CopyIcon class="size-4" />
      {/if}
    </Action>
    <Action tooltip="Retry" onclick={() => chat.client.regenerate()}>
      <RefreshCcwIcon class="size-4" />
    </Action>
    <Action tooltip="Like">
      <ThumbsUpIcon class="size-4" />
    </Action>
    <Action tooltip="Dislike">
      <ThumbsDownIcon class="size-4" />
    </Action>
  </Actions>
{:else}
  <Actions class="flex justify-end">
    <Action
      tooltip="Copy"
      onclick={() =>
        copyMessage(
          message.parts
            .map((p: xUIMessagePart) => (p.type === "text" ? p.text : ""))
            .join(""),
          message.role,
        )}
    >
      {#if isUserCopied}
        <CheckIcon class="size-4" />
      {:else}
        <CopyIcon class="size-4" />
      {/if}
    </Action>
  </Actions>
{/if}
