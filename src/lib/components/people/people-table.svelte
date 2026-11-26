<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { Button } from "$lib/components/ui/button";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";

  type Column = {
    key: string;
    label: string;
    sortable?: boolean;
    align?: "left" | "right";
  };

  let {
    columns,
    rows,
    sort,
    dir = "asc",
    onsort,
    row,
    card,
    empty,
  }: {
    columns: Column[];
    rows: T[];
    sort?: string;
    dir?: "asc" | "desc";
    onsort?: (key: string) => void;
    row: Snippet<[T]>;
    card: Snippet<[T]>;
    empty?: Snippet<[]>;
  } = $props();
</script>

<div class="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
  <table class="w-full">
    <thead>
      <tr>
        {#each columns as column}
          <th
            scope="col"
            class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground {column.align ===
            'right'
              ? 'text-right'
              : 'text-left'}"
            aria-sort={sort === column.key
              ? dir === "asc"
                ? "ascending"
                : "descending"
              : column.sortable
                ? "none"
                : undefined}
          >
            {#if column.sortable && onsort}
              <Button
                variant="ghost"
                size="xs"
                class="gap-1 -ml-2 px-2 hover:text-foreground"
                onclick={() => onsort?.(column.key)}
              >
                {column.label}
                {#if sort === column.key}
                  {#if dir === "asc"}
                    <ArrowUp class="size-3.5" />
                  {:else}
                    <ArrowDown class="size-3.5" />
                  {/if}
                {:else}
                  <ArrowUpDown class="size-3.5 opacity-50" />
                {/if}
              </Button>
            {:else}
              {column.label}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if rows.length === 0}
        <tr>
          <td
            colspan={columns.length}
            class="px-3 py-8 text-center text-sm text-muted-foreground"
          >
            {#if empty}
              {@render empty()}
            {:else}
              No results
            {/if}
          </td>
        </tr>
      {:else}
        {#each rows as entry}
          <tr class="border-t border-border hover:bg-muted/40">
            {@render row(entry)}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<div class="flex flex-col gap-2 md:hidden">
  {#if rows.length === 0}
    <div
      class="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
    >
      {#if empty}
        {@render empty()}
      {:else}
        No results
      {/if}
    </div>
  {:else}
    {#each rows as entry}
      {@render card(entry)}
    {/each}
  {/if}
</div>
