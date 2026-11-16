<script lang="ts">
  import type { Transcript, TranscriptTerm } from "$lib/schema/transcript";

  interface Props {
    subjects: Transcript["subjects"];
    terms: Transcript["terms"];
  }

  let { subjects, terms }: Props = $props();

  function formatMark(m: number | null): string {
    if (m === null) return "—";
    return m.toString();
  }
</script>

<table
  class="min-w-max w-full table-auto mb-4 overflow-hidden"
  aria-label="Transcript Records"
>
  <caption class="sr-only">Multi-term Academic Transcript</caption>
  <thead>
    <tr
      class="print:bg-violet-900 bg-neutral text-neutral-content uppercase print:text-slate-300 text-xs leading-normal"
    >
      <th class="py-1 px-6 text-left">Subject</th>
      {#each terms as term (term.examTypeId)}
        <th class="py-1 px-6 text-center">{term.title}</th>
      {/each}
      <th class="py-1 px-6 text-center">Total</th>
      <th class="py-1 px-6 text-center">Grade</th>
    </tr>
  </thead>
  <tbody class="print:text-gray-600 text-sm font-light">
    {#each subjects as subject (subject.subjectId)}
      <tr class="border-b border-gray-200 hover:bg-base-300">
        <td class="py-3 px-6 text-left max-w-xs whitespace-normal print:w-24">
          {subject.subject}
        </td>

        {#each subject.marks as mark, i (i)}
          <td class="py-3 px-6 text-center whitespace-nowrap">
            {formatMark(mark)}
          </td>
        {/each}

        <td class="py-3 px-6 text-center whitespace-nowrap font-semibold">
          {subject.total.toFixed(2)}
        </td>

        <td class="py-3 px-6 text-center">
          <span
            class="text-violet-600 py-1 px-3 rounded-full text-xs {subject.color ?? ''}"
          >
            {subject.grade}
          </span>
        </td>
      </tr>
    {/each}
  </tbody>
</table>