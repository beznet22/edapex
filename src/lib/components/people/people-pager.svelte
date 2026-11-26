<script lang="ts">
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { Button } from "$lib/components/ui/button";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Label } from "$lib/components/ui/label";
  import PeopleSelect from "./people-select.svelte";
  import { pagerWindow } from "$lib/people/people-display";
  import { PAGE_SIZES, type PageSize } from "$lib/people/people-url";

  let {
    page,
    pageSize,
    total,
    onpage,
    onpagesize,
  }: {
    page: number;
    pageSize: number;
    total: number;
    onpage: (page: number) => void;
    onpagesize: (size: PageSize) => void;
  } = $props();

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));
  const currentPage = $derived(Math.min(Math.max(1, page), totalPages));
  const first = $derived(total === 0 ? 0 : (currentPage - 1) * pageSize + 1);
  const last = $derived(Math.min(currentPage * pageSize, total));
  const tokens = $derived(pagerWindow(currentPage, totalPages));


  const sizeOptions = PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  function handlePageSize(next: string): void {
    const value = Number(next);
    if (value === 25 || value === 50 || value === 100) onpagesize(value);
  }
</script>

<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <p class="text-xs text-muted-foreground">
    {#if total === 0}
      No results
    {:else}
      Showing {first}–{last} of {total}
    {/if}
  </p>

  <div class="flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <Label for="people-page-size" class="text-xs text-muted-foreground">Rows</Label>
      <div class="w-20">
        <PeopleSelect
          id="people-page-size"
          ariaLabel="Rows per page"
          value={String(pageSize)}
          options={sizeOptions}
          onchange={handlePageSize}
        />
      </div>
    </div>

    <Button
      variant="outline"
      size="icon-sm"
      disabled={currentPage <= 1}
      aria-label="Previous page"
      onclick={() => onpage(currentPage - 1)}
    >
      <ChevronLeft class="size-4" />
    </Button>

    {#each tokens as token}
      {#if token === "gap"}
        <span class="px-1 text-sm text-muted-foreground">…</span>
      {:else}
        <Button
          variant={token === currentPage ? "default" : "outline"}
          size="icon-sm"
          aria-current={token === currentPage ? "page" : undefined}
          aria-label={`Page ${token}`}
          onclick={() => onpage(token)}
        >
          {token}
        </Button>
      {/if}
    {/each}

    <Button
      variant="outline"
      size="icon-sm"
      disabled={currentPage >= totalPages}
      aria-label="Next page"
      onclick={() => onpage(currentPage + 1)}
    >
      <ChevronRight class="size-4" />
    </Button>
  </div>
</div>
