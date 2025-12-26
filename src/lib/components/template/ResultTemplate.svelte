<script lang="ts">
  import ResultHeader from "./ResultHeader.svelte";
  import StudentInfo from "./StudentInfo.svelte";
  import RecordsTable from "./RecordsTable.svelte";
  import ScoreSummary from "./ScoreSummary.svelte";
  import StudentRatings from "./StudentRatings.svelte";
  import TeacherRemark from "./TeacherRemark.svelte";
  import type { ResultOutput } from "$lib/schema/result-output";

  interface Props {
    data: ResultOutput;
  }

  let { data }: Props = $props();
  const { category } = data.student;

  // Check if student type is GRADERS to conditionally show ratings
</script>

<div class="w-full h-full bg-custom">
  <!-- Header Section -->
  <ResultHeader school={data.school} />


  <!-- Student Info Section -->
  <StudentInfo student={data.student} />

  <!-- Records Table -->
  <RecordsTable records={data.records} student={data.student} />

  <!-- Score Summary -->
  {#if category !== "DAYCARE"}
    <ScoreSummary score={data.score} student={data.student} />
  {/if}

  <!-- Student Ratings (for GRADERS only) -->
  {#if category === "MIDDLEBASIC" || (category === "LOWERBASIC" && data.ratings.length > 0)}
    <StudentRatings ratings={data.ratings} />
  {/if}

  <!-- Teacher's Remark -->
  {#if category !== "DAYCARE"}
    <TeacherRemark remark={data.remark} />
  {/if}
</div>
