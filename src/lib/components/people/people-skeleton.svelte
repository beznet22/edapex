<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";

  let { rows = 6 }: { rows?: number } = $props();
</script>

<div class="space-y-2" aria-busy="true" aria-label="Loading people">
  {#each Array.from({ length: rows }) as _, index (index)}
    <Skeleton class="h-14 w-full rounded-xl bg-muted" />
  {/each}
</div>
