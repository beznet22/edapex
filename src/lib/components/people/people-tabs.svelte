<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { PeopleTab } from "$lib/server/people/people-types";

  const LABELS: Record<PeopleTab, string> = {
    staff: "Staff",
    parents: "Parents",
    students: "Students",
  };

  let {
    tabs,
    active,
    onselect,
  }: {
    tabs: PeopleTab[];
    active: PeopleTab;
    onselect: (tab: PeopleTab) => void;
  } = $props();
</script>

<nav
  class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:px-0"
  aria-label="People sections"
>
  {#each tabs as tab}
    <Button
      variant={active === tab ? "default" : "ghost"}
      aria-current={active === tab ? "page" : undefined}
      class="shrink-0 rounded-full px-4 text-sm font-bold"
      onclick={() => onselect(tab)}
    >
      {LABELS[tab]}
    </Button>
  {/each}
</nav>
