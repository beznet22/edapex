<script lang="ts">
  import type { xUIMessagePart } from "$lib/types/chat-types";
  import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
  } from "./ai-elements/tool";
  import { isToolUIPart } from "ai";

  let { part }: { part: xUIMessagePart } = $props();

  function getToolType(): string {
    const toolName = part.type.replace("tool-", "");
    const operation = toolName.replace(/([A-Z])/g, " $1").trim();
    return operation.charAt(0).toUpperCase() + operation.slice(1);
  }

  function formatOutput(status: string, message?: string): string {
    return `Status: ${status}\nMessage: ${message}`;
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
        {#if part.state === "output-available"}
          {#if part.type === "tool-upsertStudentResult"}
            <ToolOutput
              output={formatOutput(part.output.status, part.output.message)}
              errorText={part.errorText}
            />
          {:else if part.type === "tool-upsertAttendance"}
            <ToolOutput
              output={formatOutput(part.output.status, part.output.message)}
              errorText={part.errorText}
            />
          {:else if part.type === "tool-upsertTeacherRemark"}
            <ToolOutput
              output={formatOutput(part.output.status, part.output.message)}
              errorText={part.errorText}
            />
          {:else if part.type === "tool-upsertStudentRatings"}
            <ToolOutput
              output={formatOutput(part.output.status, part.output.message)}
              errorText={part.errorText}
            />
          {/if}
        {/if}
      </ToolContent>
    </Tool>
  {/if}
</div>
