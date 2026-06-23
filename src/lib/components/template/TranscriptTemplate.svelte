<script lang="ts">
  import type { Transcript } from "$lib/schema/transcript";
  import TranscriptHeader from "./TranscriptHeader.svelte";
  import TranscriptStudentInfo from "./TranscriptStudentInfo.svelte";
  import TranscriptRecordsTable from "./TranscriptRecordsTable.svelte";
  import TranscriptScoreSummary from "./TranscriptScoreSummary.svelte";
  import TranscriptFooter from "./TranscriptFooter.svelte";

  interface Props {
    data: Transcript;
  }

  let { data }: Props = $props();

  const academicYearLabel = $derived(
    data.academicYear.year
      ? `${data.academicYear.year} — ${data.academicYear.title}`
      : data.academicYear.title || "Academic Year",
  );

  const score = $derived({
    yearlyTotal: data.yearlyTotal,
    yearlyAverage: data.yearlyAverage,
    classAverage: data.classAverage,
    maxPossibleTotal: data.maxPossibleTotal,
  });
</script>

<div class="w-full h-full bg-custom">
  <TranscriptHeader school={data.school} academicYearTitle={academicYearLabel} />

  <TranscriptStudentInfo student={data.student} {academicYearLabel} />

  <TranscriptRecordsTable subjects={data.subjects} terms={data.terms} />

  <TranscriptScoreSummary {score} category={data.student.category} />

  <TranscriptFooter school={data.school} principalName="School Principal" />
</div>