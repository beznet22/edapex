<script lang="ts">
  import type { ResultOutput, Student } from "$lib/schema/result-output";

  interface Props {
    records: ResultOutput["records"];
    student: Student;
  }

  let { records, student }: Props = $props();
  const { category, fullName } = student;

  function getMarkByTitle(
    record: ResultOutput["records"][0],
    title: string,
  ): number | undefined {
    const index = record.titles.indexOf(title);
    return index !== -1 ? record.marks[index] : undefined;
  }
</script>

<table
  class="min-w-max w-full table-auto mb-4 overflow-hidden"
  aria-label="Student Records"
>
  <caption class="sr-only">Student Records for {fullName}</caption>
  {#if category == "MIDDLEBASIC" || category == "LOWERBASIC"}
    <thead>
      <tr
        class="print:bg-violet-900 bg-neutral text-neutral-content uppercase print:text-slate-300 text-xs leading-normal"
      >
        <th class="py-1 px-6 text-left"></th>
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

        {#if category == "MIDDLEBASIC" || category == "LOWERBASIC"}
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
            <span class="text-gray-400">{record.learningOutcome}</span>
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>
