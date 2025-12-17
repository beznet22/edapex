<script lang="ts">
  import { Pencil, Save, X } from "@lucide/svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Input from "$lib/components/ui/input/input.svelte";
  import type { RecordData } from "$lib/types/result-types";
  import type { ResultOutput, Student } from "$lib/schema/result";

  interface Props {
    records: ResultOutput["records"];
    student: Student;
  }

  let { records, student }: Props = $props();

  // Check if student type is GRADERS
  let category = $derived(student.category);
  // Edit mode state
  let editingCell = $state<{ recordIndex: number; titleIndex: number } | null>(
    null
  );
  let editValue = $state<string>("");

  // Helper function to get mark by title
  function getMarkByTitle(
    record: ResultOutput["records"][0],
    title: string
  ): number | undefined {
    const index = record.titles.indexOf(title);
    return index !== -1 ? record.marks[index] : undefined;
  }

  // Start editing a cell
  function startEdit(
    recordIndex: number,
    titleIndex: number,
    currentValue: number | undefined
  ) {
    editingCell = { recordIndex, titleIndex };
    editValue = currentValue?.toString() || "";
  }

  // Save the edited value
  function saveEdit() {
    if (editingCell && editValue) {
      const { recordIndex, titleIndex } = editingCell;
      const newValue = parseFloat(editValue);

      if (!isNaN(newValue) && newValue >= 0) {
        // Update the marks array
        records[recordIndex].marks[titleIndex] = newValue;

        // Recalculate total score
        const validMarks = records[recordIndex].marks.filter(
          (mark) => !isNaN(mark) && mark >= 0
        );
        records[recordIndex].totalScore = validMarks.reduce(
          (sum, mark) => sum + mark,
          0
        );
      }
    }
    cancelEdit();
  }

  // Cancel editing
  function cancelEdit() {
    editingCell = null;
    editValue = "";
  }

  // Handle key press events
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      saveEdit();
    } else if (event.key === "Escape") {
      cancelEdit();
    }
  }
</script>

<table
  class="min-w-max w-full table-auto mb-4 overflow-hidden"
  aria-label="Student Records"
>
  <caption class="sr-only">Student Records for {student.fullName}</caption>
  {#if category == "MIDDLEBASIC" || "LOWERBASIC"}
    <thead>
      <tr
        class="print:bg-violet-900 bg-neutral text-neutral-content uppercase print:text-slate-300 text-xs leading-normal"
      >
        <th class="py-1 px-6 text-left">Subject</th>
        {#each records[0]?.titles || [] as title}
          <th class="py-1 px-6 text-center">{title}</th>
        {/each}
        <th class="py-1 px-6 text-center">Score</th>
        <th class="py-1 px-6 text-center">Grade</th>
      </tr>
    </thead>
  {:else if category == "NURSERY" || category == "GRADEK"}
    <thead>
      <tr
        class="print:bg-violet-900 bg-neutral text-neutral-content uppercase print:text-slate-300 text-xs leading-normal"
      >
        <th class="py-1 px-6 text-center">Learning Areas</th>
        {#each records[0]?.titles || [] as title}
          <th class="py-1 px-6 text-center">{title}</th>
        {/each}
        <th class="py-1 px-6 text-center">Score</th>
        <th class="py-1 px-6 text-center">Grade</th>
      </tr>
    </thead>
  {:else if category == "DAYCARE"}
    <thead>
      <tr
        class="print:bg-violet-900 bg-neutral text-neutral-content uppercase print:text-slate-300 text-xs leading-normal"
      >
        <th class="py-1 px-6 text-left">Learning Areas</th>
        <th class="py-1 px-6 text-center">Outcome</th>
      </tr>
    </thead>
  {/if}

  <tbody class="print:text-gray-600 text-sm font-light">
    {#each records as record}
      <tr class="border-b border-gray-200 hover:bg-base-300">
        <td class="py-3 px-6 text-left max-w-xs whitespace-normal print:w-24">
          {record.subject}
        </td>

        {#if category == "MIDDLEBASIC" || "LOWERBASIC"}
          {#each record.titles as title}
            <td class="py-3 px-6 text-center whitespace-nowrap relative group">
              <span>{getMarkByTitle(record, title) ?? "-"}</span>
            </td>
          {/each}
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {record.totalScore}
          </td>
          <td class="py-3 px-6 text-center">
            {#if record.color}
              <span
                class="text-violet-600 py-1 px-3 rounded-full text-xs {record.color}"
              >
                {record.grade || "-"}
              </span>
            {:else}
              {@html record.grade}
            {/if}
          </td>
          {:else if category == "NURSERY" || category == "GRADEK"}
          <td class="py-3 px-6 max-w-xs">
            {#if record.objectives && record.objectives.length > 0}
              <ul class="list-disc">
                {#each record.objectives as objective}
                  <li>{objective}</li>
                {/each}
              </ul>
            {:else}
              <span class="text-gray-400">No objectives</span>
            {/if}
          </td>
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {record.totalScore}
          </td>
          <td class="py-3 px-6 text-center">
            <span class="text-violet-600 py-1 px-3 rounded-full text-xs">
              {record.grade || "-"}
            </span>
          </td>
        {:else if category == "DAYCARE"}
          <td class="py-3 px-6 max-w-xs">
            {#if record.objectives && record.objectives.length > 0}
              <ul class="list-disc">
                {#each record.objectives as objective}
                  <li>{objective}</li>
                {/each}
              </ul>
            {:else}
              <span class="text-gray-400">No objectives</span>
            {/if}
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>
