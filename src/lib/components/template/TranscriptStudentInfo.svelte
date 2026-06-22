<script lang="ts">
  import type { Transcript } from "$lib/schema/transcript";

  interface Props {
    student: Transcript["student"];
    academicYearLabel: string;
  }

  let { student, academicYearLabel }: Props = $props();

  const paddedAdminNo = $derived(String(student.adminNo).padStart(4, "0"));
  const studentPhoto = $derived(student.studentPhoto);
</script>

<div class="flex w-full p-2">
  <div class="w-full grid grid-rows-3 grid-flow-col">
    <div class="border-b grid grid-cols-12 py-1">
      <div class="col-span-5">
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Name
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.fullName}</span
        >
      </div>

      <div class="col-span-7">
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Academic Year
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{academicYearLabel}</span
        >
      </div>
    </div>

    <div class="border-b grid grid-cols-12 py-1">
      <div class="col-span-3">
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Class
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase">
          {student.className} ({student.sectionName})
        </span>
      </div>

      <div class="col-span-4">
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Admission No
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{paddedAdminNo}</span
        >
      </div>

      <div class="col-span-5">
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Category
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase">
          {student.category}
        </span>
      </div>
    </div>

    <div class="border-b grid grid-cols-3 py-1">
      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Opened
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.daysOpened}</span
        >
      </div>

      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Absent
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.daysAbsent}</span
        >
      </div>

      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Present
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.daysPresent}</span
        >
      </div>
    </div>
  </div>

  <div class="avatar flex flex-col justify-center items-center ml-5">
    <div
      class="w-24 rounded-full ring ring-neutral print:ring-violet-900 ring-offset-10"
    >
      <img src={studentPhoto} alt={student.fullName} />
    </div>
  </div>
</div>
