<script lang="ts">
  import { untrack } from "svelte";
  import Search from "@lucide/svelte/icons/search";
  import { Input } from "$lib/components/ui/input";

  let {
    value = "",
    onSearch,
    placeholder = "Search people",
  }: {
    value?: string;
    onSearch: (query: string) => void;
    placeholder?: string;
  } = $props();

  let term = $state(untrack(() => value));
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const external = value;
    if (untrack(() => term) !== external) {
      term = external;
    }
  });

  $effect(() => () => {
    if (timer !== null) clearTimeout(timer);
  });

  function schedule(next: string): void {
    term = next;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const query = term.trim();
      if (query.length >= 2) onSearch(query);
      else if (query.length === 0) onSearch("");
    }, 300);
  }
</script>

<div class="group relative w-full sm:w-80">
  <Search
    class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
  />
  <Input
    type="search"
    {placeholder}
    value={term}
    oninput={(event) => schedule(event.currentTarget.value)}
    class="min-h-11 w-full rounded-full border border-border bg-muted/40 pl-11 text-sm sm:min-h-10"
    aria-label="Search people"
  />
</div>
