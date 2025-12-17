<script lang="ts">
  import type { ResultOutput } from "$lib/schema/result";


  interface Props {
    student: ResultOutput["student"];
  }

  let { student }: Props = $props();

  // Pad admission number with leading zeros
  const paddedAdminNo = $derived(String(student.adminNo).padStart(4, "0"));

  // Student photo is already base64 encoded from the service
  const studentPhoto = $derived(student.studentPhoto);
</script>

<div class="flex w-full p-2">
  <div class="w-full grid grid-rows-3 grid-flow-col">
    <!-- Name and Term -->
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
          Term
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.term}</span
        >
      </div>
    </div>

    <!-- Class, Admission No, Academic Year -->
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
          Academic Year
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase">
          {student.sessionYear}
        </span>
      </div>
    </div>

    <!-- Attendance -->
    <div class="border-b grid grid-cols-3 py-1">
      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Opened
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.opened}</span
        >
      </div>

      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Absent
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.absent}</span
        >
      </div>

      <div>
        <span
          class="print:bg-violet-900 uppercase btn btn-xs border print:text-slate-300 rounded-full"
        >
          Days Present
        </span>
        <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"
          >{student.present}</span
        >
      </div>
    </div>
  </div>

  <!-- Student Photo -->
  <div class="avatar flex flex-col justify-center items-center ml-5">
    <div
      class="w-24 rounded-full ring ring-neutral print:ring-violet-900 ring-offset-10"
    >
      <img src={studentPhoto} alt={student.fullName} />
    </div>
  </div>
</div>
