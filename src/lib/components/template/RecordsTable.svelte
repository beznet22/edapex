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
    const index = record.titles.findIndex(
      (t) => t.toUpperCase() === title.toUpperCase(),
    );
    return index !== -1 ? record.marks[index] : undefined;
  }

  function getCA(record: ResultOutput["records"][0]): number | string {
    let caTotal = 0;
    let hasCA = false;
    record.titles.forEach((title, index) => {
      if (title.toUpperCase() !== "EXAM") {
        caTotal += record.marks[index] || 0;
        hasCA = true;
      }
    });

    return hasCA ? caTotal : "-";
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
        <th class="py-1 px-6 text-center">CA</th>
        <th class="py-1 px-6 text-center">EXAM</th>
        <th class="py-1 px-6 text-center">SCORE</th>
        <th class="py-1 px-6 text-center">GRADE</th>
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
          {#if (category === "NURSERY" || category === "GRADEK") && record.objectives && record.objectives.length > 0}
            <ul
              class="list-disc ml-4 mt-1 text-[10px] leading-tight font-normal text-gray-500"
            >
              {#each record.objectives as objective}
                <li>{objective}</li>
              {/each}
            </ul>
          {/if}
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
            {@html record.grade}
          </td>
        {:else if category == "NURSERY" || category == "GRADEK"}
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {getCA(record)}
          </td>
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {getMarkByTitle(record, "EXAM") ?? "-"}
          </td>
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {record.totalScore}
          </td>
          <td class="py-3 px-6 text-center">
            <!-- <span class="text-violet-600 py-1 px-3 rounded-full text-xs"> -->
            {@html record.grade}
            <!-- </span> -->
          </td>
        {:else if category == "DAYCARE"}
          <td class="py-3 px-6 max-w-10">
            <span class="text-gray-400">{record.learningOutcome}</span>
          </td>
        {/if}
      </tr>
    {/each}
  </tbody>
</table>
