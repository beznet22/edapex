<script lang="ts">
  import type { xUIMessagePart } from "$lib/types/chat-types";
  import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "./ai-elements/tool";
  import PreviewModal from "./pdf-preview.svelte";
  import type { ResultOutput } from "$lib/schema/result-input";
  import { isToolUIPart } from "ai";

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

  function getToolType(): string {
    const toolName = part.type.replace("tool-", "");
    const operation = toolName.replace(/([A-Z])/g, " $1").trim();
    return operation.charAt(0).toUpperCase() + operation.slice(1);
  }

  function formatOutput(part: xUIMessagePart): string {
    if (isToolUIPart(part)) {
      switch (part.type) {
        case "tool-upsertStudentResult":
          if (part.state !== "output-available") return "";
          return `Status: ${part.output.status}\nMessage: ${part.output.message}`;
        case "tool-upsertAttendance":
          if (part.state !== "output-available") return "";
          return `Status: ${part.output.status}\nMessage: ${part.output.message}`;
        case "tool-upsertTeacherRemark":
          if (part.state !== "output-available") return "";
          return `Status: ${part.output.status}\nMessage: ${part.output.message}`;
        case "tool-upsertStudentRatings":
          if (part.state !== "output-available") return "";
          return `Status: ${part.output.status}\nMessage: ${part.output.message}`;
        default:
          return JSON.stringify(part.output);
      }
    }
    return "";
  }
</script>

<div class="max-w-2xl space-y-6">
  {#if isToolUIPart(part)}
    <Tool defaultOpen={true}>
      <ToolHeader type={getToolType()} state={part.state} />
      <ToolContent>
        {#if part.state === "input-available"}
          <ToolInput input={part.input} />
        {/if}
        <ToolOutput output={formatOutput(part)} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  {/if}
</div>

<PreviewModal bind:open={showModal} token={token || ""} />
