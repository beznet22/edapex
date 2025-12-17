<script lang="ts">
  import type { xUIMessagePart } from "$lib/types/chat-types";
  import { getToolName, isToolUIPart } from "ai";
  import { onMount } from "svelte";
  import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "./ai-elements/tool";
  import { useChat } from "$lib/context/chat-context.svelte";
  import PreviewModal from "./pdf-preview.svelte";
  import type { ResultOutput } from "$lib/schema/result";
  import { page } from "$app/state";

  type ToolPartOutput = {
    status: "approved" | "denied";
    message: string;
    data?: ResultOutput;
  };

  let { part, showModal = $bindable(false) }: { part: xUIMessagePart; showModal: boolean } = $props();
  let token = $derived(part.type === "tool-upsertStudentResult" ? part.output?.data?.student.token : "");

  $effect(() => {
    console.log("URL: ", token);
  });

  function formatResult(result: ToolPartOutput): string {
    return [`Status: ${result.status}`, `Message: ${result.message}`].join("\n");
  }
</script>

<div class="max-w-2xl space-y-6">
  {#if part.type === "tool-upsertStudentResult"}
    <Tool defaultOpen={true}>
      <ToolHeader
        type={`${part.input?.operation === "read" ? "Retrieving" : "Updating"} Resulte Data`}
        state={part.state}
      />
      <ToolContent>
        {#if part.state === "input-available"}
          <ToolInput input={part.input} />
        {:else if part.state === "output-available"}
          <ToolOutput
            output={formatResult({
              status: part.output.status,
              message: part.output.message!,
              data: part.output.data,
            })}
            errorText={part.errorText}
          />
        {/if}
      </ToolContent>
    </Tool>
  {/if}
</div>

<PreviewModal bind:open={showModal} token={token || ""} />
