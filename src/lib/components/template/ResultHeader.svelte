<script lang="ts">
  import type { ResultOutput } from "$lib/schema/result";


  interface Props {
    school: ResultOutput["school"];
  }

  let { school }: Props = $props();
</script>

<header class="flex items-center justify-between lg:mb-0 mb-3 w-full px-4">
  <div class="flex items-center">
    <div class="avatar">
      <div class="mask mask-squircle w-12 h-12">
        <img src={school.logo || "/school-logo.png"} alt="School Logo" />
      </div>
    </div>

    <div class="leading-7">
      <div class="font-bold text-lg">{school.name}</div>
      <div class="text-sm opacity-50 flex items-center">
        <svg
          class="text-xl mr-1"
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 2C7.589 2 4 5.589 4 9.995C3.971 16.44 11.696 21.784 12 22c0 0 8.029-5.56 8-12c0-4.411-3.589-8-8-8zm0 12c-2.21 0-4-1.79-4-4s1.79-4 4-4s4 1.79 4 4s-1.79 4-4 4z"
            fill="currentColor"
          ></path>
        </svg>
        {school.city}, {school.state}
      </div>
    </div>
  </div>

  <div class="flex flex-col text-right leading-7">
    <div class="font-bold text-sm">{school.title}</div>
    <div class="text-sm opacity-50 flex justify-end">
      {school.vacation_date}
    </div>
  </div>
</header>
