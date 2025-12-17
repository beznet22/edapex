<script lang="ts">
  import type { ResultOutput } from "$lib/schema/result";

  const badgeColors = [
    "bg-green-200 text-green-600",
    "bg-blue-200 text-blue-600",
    "bg-yellow-200 text-yellow-600",
    "bg-red-200 text-red-600",
    "bg-purple-200 text-purple-600",
    "bg-gray-200 text-gray-600",
    "bg-pink-200 text-pink-600",
  ];
  const progress = ["success", "info", "warning", "error", "primary", "secondary", "accent"];

  interface Props {
    ratings: ResultOutput["ratings"];
  }

  let { ratings }: Props = $props();

  // Helper function to get badge color class
  function getBadgeColorClass(rate?: number): string {
    if (!rate) return "bg-gray-200 text-gray-600";
    return badgeColors[rate - 1] || "bg-gray-200 text-gray-600";
  }

  // Calculate percentage value for range input (rate is 0-5, convert to 0-100)
  function getRangeValue(rate: number | null): number {
    if (rate === null) return 0;
    return (rate / 5) * 100;
  }

  // Helper function to split a string and get a specific part
  function split(str: string | null): string | null {
    if (!str) return null;
    return str.split("-")[1];
  }
</script>

{#if ratings.length > 0}
  <section class="mb-4">
    <h2 class="text-sm font-bold mr-1 text-slate-700 opacity-75">Student Ratings</h2>
    <div class="text-sm opacity-50 flex items-center">
      <svg
        class="text-xl mr-1"
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3s-3-1.34-3-3s1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22c.03-1.99 4-3.08 6-3.08c1.99 0 5.97 1.09 6 3.08c-1.29 1.94-3.5 3.22-6 3.22z"
        />
      </svg>
      <span>Social and Personal Development</span>
    </div>
    <hr class="my-2" />

    {#each ratings as rating}
      <div class="border-b grid grid-cols-6 py-1">
        <div class="col-span-2">
          <span class="py-2 pl-2 text-xs print:text-slate-500 uppercase"> {rating.attribute}</span>
        </div>

        <div class="col-span-3 flex items-center gap-2">
          <!-- Determinate progress bar showing percentage -->
          <div class="progress-bar-container">
            <div class="progress-bar-track">
              <div
                class="progress-bar-fill progress-bar-{progress[rating.rate! - 1] || 'info'}"
                style="width: {getRangeValue(rating.rate)}%"
              ></div>
            </div>
          </div>
          <span class="progress-percentage print:text-slate-500!">{getRangeValue(rating.rate)}%</span>
        </div>

        <span class="col-span-1 text-xs text-center text-slate-500">
          <span class="{getBadgeColorClass(rating.rate || 0)} py-1 px-3 rounded-full text-xs uppercase">
            {rating.remark}
          </span>
        </span>
      </div>
    {/each}
  </section>
{/if}
