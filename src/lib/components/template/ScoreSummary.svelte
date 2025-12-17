<script lang="ts">
  import type { ResultOutput } from "$lib/schema/result";


  interface Props {
    score: ResultOutput["score"];
    student: ResultOutput["student"];
  }

  let { score, student }: Props = $props();

  // Check if student type is GRADERS
  const isBasic = $derived(student.category === "MIDDLEBASIC" || student.category === "LOWERBASIC");

  // Grading system text based on student type
  const gradingSystemText = $derived(
    isBasic
      ? "A(94-100) B(86-93) C(77-85) D(70-76) E(0-69)"
      : "Emerging(0-80) Expected(81-90) Exceeding(91-100)"
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
      <td class="py-2 text-xs print:text-slate-500">{score.total}</td>

      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Average Score</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500">{score.average}</td>

      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>High Class Average</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500 px-5 text-center">
        <a href="/student/{score.classAverage.max.studentId}">
          {score.classAverage.max.value ?? "N/A"}
        </a>
      </td>

      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Low Class Average</span>
      </td>
      <td></td>
      <td class="py-2 text-xs print:text-slate-500 px-5">
        <a href="/student/{score.classAverage.min.studentId}">
          {score.classAverage.min.value ?? "N/A"}
        </a>
      </td>
    </tr>

    <tr class="border-b">
      <td
        class="print:bg-violet-900 whitespace-nowrap capitalize btn btn-xs border print:text-slate-300 cursor-default rounded-full"
      >
        <span>Grading System</span>
      </td>
      <td></td>

      <td colspan="6" class="py-2 px-5 text-xs print:text-slate-500 uppercase">
        {gradingSystemText}
      </td>
    </tr>
  </tbody>
</table>
