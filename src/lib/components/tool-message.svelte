<script lang="ts">
  import type { Snippet } from "svelte";
  import type { xUIMessagePart } from "$lib/types/chat-types";

  import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
  } from "./ai-elements/tool";
  // Remove isToolUIPart import as it causes narrowing issues with InferUITools types
  import StudentResultCard from "./chat/student-result-card.svelte";
  import ValidationSummary from "./chat/validation-summary.svelte";

  let { part }: { part: xUIMessagePart } = $props();

  function getToolType(): string {
    const toolName = part.type.replace("tool-", "");
    const operation = toolName.replace(/([A-Z])/g, " $1").trim();
    return operation.charAt(0).toUpperCase() + operation.slice(1);
  }

  // Custom type guard to identify tool parts correctly matching InferUITools definition
  function isTool(p: xUIMessagePart): boolean {
    return p.type.startsWith("tool-");
  }

  // Define snippets type strictly based on tool types
  type ToolSnippet<K extends xUIMessagePart["type"]> = Snippet<
    [Extract<xUIMessagePart, { type: K }>]
  >;

  // Snippets defined outside the object for clarity, though Svelte 5 allows inline
</script>

{#snippet upsertStudentResult(
  p: any,
)}
  {@const output = p.output as any}
  <ToolOutput
    output={`Status: ${output?.status}\nMessage: ${output?.message}`}
    errorText={p.errorText}
  />
  {#if output?.data?.student}
    <StudentResultCard student={output.data.student} />
  {/if}
{/snippet}

{#snippet validateClassResults(
  p: any,
)}
  {@const output = p.output as any}
  <ValidationSummary
    valid={output.validCount}
    invalid={output.invalidCount}
    results={output.resultStatus}
  />
{/snippet}

{#snippet defaultTool(p: xUIMessagePart)}
  {#if p.type.startsWith("tool-") && (p as any).state === "output-available"}
    <ToolOutput
      output={JSON.stringify((p as any).output, null, 2)}
      errorText={(p as any).errorText}
    />
  {/if}
{/snippet}

<div class="max-w-2xl space-y-6">
  {#if isTool(part)}
    <Tool defaultOpen={true}>
      <ToolHeader type={getToolType()} state={(part as any).state} />
      <ToolContent>
        {#if (part as any).state === "input-available"}
          <ToolInput input={(part as any).input} />
        {/if}

        {#if (part as any).state === "output-available" || (part as any).state === "output-error"}
          {#if part.type === "tool-validate-extraction"}
            {@render validateClassResults(part as any)}
          {:else if part.type === "tool-manage-results"}
            {@render upsertStudentResult(part as any)}
          {:else}
            {@render defaultTool(part)}
          {/if}
        {/if}
      </ToolContent>
    </Tool>
  {/if}
</div>
