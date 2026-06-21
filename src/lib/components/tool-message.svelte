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
  import StudentResultCard from "./chat/student-result-card.svelte";
  import ValidationSummary from "./chat/validation-summary.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "$lib/components/ui/collapsible";

  let { part }: { part: xUIMessagePart } = $props();

  type ToolState =
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";

  type ToolResultObject = {
    message?: unknown;
    status?: unknown;
    recordId?: unknown;
    studentId?: unknown;
    data?: unknown;
    validCount?: unknown;
    invalidCount?: unknown;
    resultStatus?: unknown;
    [key: string]: unknown;
  };

  function isTool(p: xUIMessagePart): boolean {
    return p.type.startsWith("tool-");
  }

  function getToolType(): string {
    const toolName = part.type.replace("tool-", "");
    const operation = toolName.replace(/([A-Z])/g, " $1").trim();
    return operation.charAt(0).toUpperCase() + operation.slice(1);
  }

  function readRecordValue(
    obj: ToolResultObject,
    key: string,
  ): string | number | undefined {
    const value = obj[key];
    return typeof value === "string" || typeof value === "number"
      ? value
      : undefined;
  }

  function getState(p: xUIMessagePart): ToolState {
    const state = (p as { state?: unknown }).state;
    if (
      state === "input-streaming" ||
      state === "input-available" ||
      state === "output-available" ||
      state === "output-error"
    ) {
      return state;
    }
    return "input-available";
  }

  function getOutput(p: xUIMessagePart): unknown {
    return (p as { output?: unknown }).output;
  }

  function getInput(p: xUIMessagePart): unknown {
    return (p as { input?: unknown }).input;
  }

  function getErrorText(p: xUIMessagePart): string | undefined {
    const err = (p as { errorText?: unknown }).errorText;
    return typeof err === "string" ? err : undefined;
  }

  function isResultObject(value: unknown): value is ToolResultObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function extractStudent(
    data: unknown,
  ): { student: unknown } | undefined {
    if (
      data !== null &&
      typeof data === "object" &&
      "student" in data &&
      (data as { student?: unknown }).student !== undefined
    ) {
      return data as { student: unknown };
    }
    return undefined;
  }

  type ToolSnippet<K extends xUIMessagePart["type"]> = Snippet<
    [Extract<xUIMessagePart, { type: K }>]
  >;
</script>

{#snippet upsertStudentResult(p: xUIMessagePart)}
  {@const output = getOutput(p)}
  {@const result = isResultObject(output) ? output : undefined}
  <ToolOutput
    output={`Status: ${typeof result?.status === "string" ? result.status : "unknown"}\nMessage: ${typeof result?.message === "string" ? result.message : ""}`}
    errorText={getErrorText(p)}
  />
  {#if result}
    {@const studentData = extractStudent(result.data)}
    {#if studentData}
      <StudentResultCard student={studentData.student} />
    {/if}
  {/if}
{/snippet}

{#snippet validateClassResults(p: xUIMessagePart)}
  {@const output = getOutput(p)}
  {@const result = isResultObject(output) ? output : {}}
  {@const validCount = typeof result.validCount === "number" ? result.validCount : 0}
  {@const invalidCount = typeof result.invalidCount === "number" ? result.invalidCount : 0}
  {@const resultStatus = Array.isArray(result.resultStatus)
    ? result.resultStatus
    : []}
  <ValidationSummary
    valid={validCount}
    invalid={invalidCount}
    results={resultStatus}
  />
{/snippet}

{#snippet defaultTool(p: xUIMessagePart)}
  {@const output = getOutput(p)}
  {#if !isResultObject(output)}
    <ToolOutput
      output={typeof output === "string"
        ? output
        : JSON.stringify(output, null, 2)}
      errorText={getErrorText(p)}
    />
  {:else}
    {@const message = typeof output.message === "string" ? output.message : undefined}
    {@const status = typeof output.status === "string" ? output.status : undefined}
    {@const isError = status === "ERROR"}
    {@const recordId = readRecordValue(output, "recordId")}
    {@const studentId = readRecordValue(output, "studentId")}
    <Card class="w-full">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-sm font-medium">
          {isError ? "Error" : status ?? "Result"}
        </CardTitle>
        {#if isError}
          <Badge variant="destructive">Failed</Badge>
        {:else if status}
          <Badge variant="secondary">{status}</Badge>
        {/if}
      </CardHeader>
      {#if message}
        <CardContent class="pt-0">
          <p class="text-sm">{message}</p>
        </CardContent>
      {/if}
      {#if recordId !== undefined || studentId !== undefined}
        <CardContent class="flex flex-wrap gap-2 pt-0">
          {#if recordId !== undefined}
            <Badge variant="outline">Record #{recordId}</Badge>
          {/if}
          {#if studentId !== undefined}
            <Badge variant="outline">Student #{studentId}</Badge>
          {/if}
        </CardContent>
      {/if}
    </Card>
    <Collapsible class="rounded-md border">
      <CollapsibleTrigger
        class="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
      >
        View raw output
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ToolOutput output={JSON.stringify(output, null, 2)} />
      </CollapsibleContent>
    </Collapsible>
  {/if}
{/snippet}

<div class="max-w-2xl space-y-6">
  {#if isTool(part)}
    <Tool defaultOpen={true}>
      <ToolHeader type={getToolType()} state={getState(part)} />
      <ToolContent>
        {#if getState(part) === "input-available"}
          <ToolInput input={getInput(part)} />
        {/if}

        {#if getState(part) === "output-available" || getState(part) === "output-error"}
          {#if part.type === "tool-validate-marksheet"}
            {@render validateClassResults(part)}
          {:else if part.type === "tool-manage-results"}
            {@render upsertStudentResult(part)}
          {:else}
            {@render defaultTool(part)}
          {/if}
        {/if}
      </ToolContent>
    </Tool>
  {/if}
</div>