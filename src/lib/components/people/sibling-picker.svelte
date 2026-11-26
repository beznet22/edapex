<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";

  export type SiblingSearchRow = {
    id: number;
    fullName: string | null;
    admissionNo: number | null;
    className: string | null;
    sectionName: string | null;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianMobile: string | null;
  };

  let {
    selected = null,
    onselect,
  }: {
    selected?: SiblingSearchRow | null;
    onselect: (row: SiblingSearchRow | null) => void;
  } = $props();

  let term = $state("");
  let results = $state<SiblingSearchRow[]>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(next: string): void {
    term = next;
    error = null;
    if (timer !== null) clearTimeout(timer);
    const query = next.trim();
    if (query.length < 2) {
      results = [];
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void search(query);
    }, 300);
  }

  async function search(query: string): Promise<void> {
    busy = true;
    try {
      const response = await fetch(
        `/people/students/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        error = "Could not search students";
        results = [];
        return;
      }
      const body = (await response.json()) as { results?: SiblingSearchRow[] };
      results = body.results ?? [];
    } catch {
      error = "Could not search students";
      results = [];
    } finally {
      busy = false;
    }
  }

  function rowLabel(row: SiblingSearchRow): string {
    const klass = `${row.className ?? "Class"} ${row.sectionName ?? ""}`.trim();
    return [row.fullName ?? "Unnamed", row.admissionNo ? `ADM ${row.admissionNo}` : null, klass]
      .filter(Boolean)
      .join(" · ");
  }

  function choose(row: SiblingSearchRow): void {
    onselect(row);
    term = "";
    results = [];
  }
</script>

<div class="space-y-2">
  <Label for="sibling-search" class="text-sm font-normal text-muted-foreground">
    Sibling (optional)
  </Label>

  {#if selected}
    <div class="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <div class="min-w-0">
        <p class="truncate text-sm text-foreground">{rowLabel(selected)}</p>
        <p class="truncate text-xs text-muted-foreground">
          Will reuse the parent of this student
          {#if selected.guardianName}· {selected.guardianName}{/if}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Clear sibling"
        onclick={() => onselect(null)}
      >
        <X class="size-4" />
      </Button>
    </div>
  {:else}
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="sibling-search"
        class="min-h-11 bg-background pl-9 text-foreground sm:min-h-9"
        placeholder="Search by name or admission number"
        value={term}
        oninput={(event) => schedule(event.currentTarget.value)}
        autocomplete="off"
      />
    </div>
    {#if busy}
      <p class="text-xs text-muted-foreground">Searching…</p>
    {:else if error}
      <p class="text-xs text-destructive">{error}</p>
    {:else if results.length > 0}
      <ul class="max-h-44 overflow-y-auto rounded-md border border-border">
        {#each results as row (row.id)}
          <li class="border-b border-border last:border-b-0">
            <Button
              variant="ghost"
              class="h-auto min-h-11 w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
              onclick={() => choose(row)}
            >
              <span class="truncate">{rowLabel(row)}</span>
            </Button>
          </li>
        {/each}
      </ul>
    {:else if term.trim().length >= 2}
      <p class="text-xs text-muted-foreground">No matching students.</p>
    {:else}
      <p class="text-xs text-muted-foreground">
        Leave empty to match an existing parent by guardian email, or create a new parent.
      </p>
    {/if}
  {/if}
</div>
