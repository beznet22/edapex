<script lang="ts">
  import type { Transcript } from "$lib/schema/transcript";

  interface Props {
    score: {
      yearlyTotal: Transcript["yearlyTotal"];
      yearlyAverage: Transcript["yearlyAverage"];
      classAverage: Transcript["classAverage"];
      maxPossibleTotal: Transcript["maxPossibleTotal"];
    };
    category: Transcript["student"]["category"];
  }

  let { score, category }: Props = $props();

  const isBasic = $derived(
    category === "MIDDLEBASIC" || category === "LOWERBASIC",
  );

  const gradingSystemText = $derived(
    isBasic
      ? "A(94-100) B(86-93) C(77-85) D(70-76) E(0-69)"
      : "Emerging(0-80) Expected(81-90) Exceeding(91-100)",
  );
</script>

<table
  class="min-w-max w-full table-fixed mb-5 rounded print:break-inside-avoid"
>
  <tbody class="align-baseline">
    <tr class="border-b">
      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Total Score</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500">
        {score.yearlyTotal.toFixed(2)} / {score.maxPossibleTotal.toFixed(0)}
      </td>

      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Average Score</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500">
        {score.yearlyAverage.toFixed(2)}%
      </td>

      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Class Average</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500">
        {score.classAverage.toFixed(2)}%
      </td>
    </tr>

    <tr class="border-b">
      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Grading System</span>
      </td>
      <td></td>

      <td colspan="7" class="py-2 px-5 text-xs print:text-slate-500 uppercase">
        {gradingSystemText}
      </td>
    </tr>
  </tbody>
</table>
