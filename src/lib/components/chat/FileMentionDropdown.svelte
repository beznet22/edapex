<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";

  /**
   * File result from /api/files/search
   */
  export interface FileMentionResult {
    key: string;
    name: string;
    type: 'file';
    size?: number;
    url?: string;
  }

  let {
    query,
    visible,
    onSelect,
    onDismiss,
  }: {
    query: string;
    visible: boolean;
    onSelect: (file: FileMentionResult) => void;
    onDismiss: () => void;
  } = $props();

  // State
  let results = $state<FileMentionResult[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  let highlightedIndex = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Derived: the flat list of items for keyboard navigation
  const flatItems = $derived(results);

  /**
   * Format a byte size into a human-readable string.
   */
  function formatSize(bytes: number | undefined): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  /**
   * Truncate file name to 50 chars with ellipsis
   */
  function truncateName(name: string): string {
    if (name.length <= 50) return name;
    return name.slice(0, 50) + '…';
  }

  /**
   * Fetch results from the file search API with debounce
   */
  function fetchResults(searchQuery: string) {
    // Clear previous debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Abort previous request
    if (abortController) {
      abortController.abort();
    }

    // Reset state
    errorMessage = null;

    loading = true;

    debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      abortController = controller;

      // 5-second timeout
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const params = new URLSearchParams({ q: searchQuery, topK: '10' });
        const response = await fetch(`/api/files/search?${params.toString()}`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }

        const data = (await response.json()) as { results?: FileMentionResult[] };
        results = data.results ?? [];
        highlightedIndex = 0;
        errorMessage = null;
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (isAbort) {
          // Check if it was a timeout (not a manual abort from new request)
          if (!controller.signal.aborted || controller === abortController) {
            errorMessage = 'Unable to load files';
            results = [];
          }
        } else {
          errorMessage = err instanceof Error ? err.message : 'Unable to load files';
          results = [];
        }
      } finally {
        loading = false;
      }
    }, 200); // 200ms debounce
  }

  // React to query / visibility changes
  $effect(() => {
    if (visible) {
      fetchResults(query);
    } else {
      // Reset when hidden
      results = [];
      errorMessage = null;
      loading = false;
      highlightedIndex = 0;
    }
  });

  /**
   * Handle keyboard navigation
   */
  function handleKeydown(e: KeyboardEvent) {
    if (!visible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        if (flatItems.length > 0) {
          highlightedIndex = (highlightedIndex + 1) % flatItems.length;
          scrollToHighlighted();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        if (flatItems.length > 0) {
          highlightedIndex = (highlightedIndex - 1 + flatItems.length) % flatItems.length;
          scrollToHighlighted();
        }
        break;

      case 'Enter':
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        if (flatItems.length > 0 && highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
          onSelect(flatItems[highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
        break;
    }
  }

  function scrollToHighlighted() {
    // Scroll the highlighted item into view
    const container = dropdownRef?.querySelector('[data-results]');
    const item = container?.querySelector(`[data-index="${highlightedIndex}"]`);
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Handle click outside to dismiss
   */
  function handleClickOutside(e: MouseEvent) {
    if (visible && dropdownRef && !dropdownRef.contains(e.target as Node)) {
      onDismiss();
    }
  }

  // Attach global listeners
  $effect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeydown, true);
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('keydown', handleKeydown, true);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  });

  // Cleanup on unmount
  $effect(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (abortController) abortController.abort();
    };
  });
</script>

{#if visible}
  <div
    bind:this={dropdownRef}
    class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200"
    role="listbox"
    aria-label="File suggestions"
  >
    <!-- Header -->
    <div class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em]">
      Workspace Files
    </div>

    <!-- Results Area -->
    <div data-results class="flex flex-col gap-0.5 overflow-y-auto max-h-[320px] scrollbar-slick px-0.5">
      <!-- Loading State -->
      {#if loading && results.length === 0}
        <div class="flex items-center justify-center gap-2 p-4">
          <LoaderCircleIcon class="size-4 text-muted-foreground animate-spin" />
          <span class="text-xs text-muted-foreground">Searching files...</span>
        </div>
      <!-- Error State -->
      {:else if errorMessage}
        <div class="flex items-center justify-center gap-2 p-4">
          <AlertCircleIcon class="size-4 text-muted-foreground/60" />
          <span class="text-xs text-muted-foreground">{errorMessage}</span>
        </div>
      <!-- Empty State -->
      {:else if !loading && results.length === 0}
        <div class="p-4 text-center text-xs text-muted-foreground">
          {query.trim() ? 'No files found' : 'Type to search files'}
        </div>
      <!-- Results List -->
      {:else}
        {#each results as item, index (item.key)}
          <button
            data-index={index}
            class={cn(
              "group flex items-center gap-3 w-full p-2 rounded-lg text-left transition-colors cursor-pointer",
              highlightedIndex === index
                ? "bg-primary/10 border border-primary/20"
                : "hover:bg-sidebar-accent/50 border border-transparent"
            )}
            onclick={() => onSelect(item)}
            onmouseenter={() => (highlightedIndex = index)}
            role="option"
            aria-selected={highlightedIndex === index}
          >
            <!-- Icon -->
            <div class={cn(
              "size-8 flex items-center justify-center rounded-md border transition-colors",
              highlightedIndex === index
                ? "border-primary/30 bg-primary/10"
                : "border-border/10 bg-sidebar-accent/20 group-hover:border-primary/20"
            )}>
              <FileTextIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
            </div>

            <!-- Content -->
            <div class="flex flex-col flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class={cn(
                  "text-sm font-medium truncate transition-colors",
                  highlightedIndex === index ? "text-primary" : "text-foreground group-hover:text-primary"
                )}>
                  {truncateName(item.name)}
                </span>
                <span class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-sidebar-accent/40 text-muted-foreground/70 border border-border/10">
                  file
                </span>
              </div>
              {#if item.size !== undefined}
                <span class="text-[10px] text-muted-foreground/60 truncate">
                  {formatSize(item.size)}
                </span>
              {/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Footer hint -->
    {#if results.length > 0}
      <div class="mx-1.5 h-px bg-border/10 mt-0.5"></div>
      <div class="flex items-center gap-3 px-2 py-1.5 text-[9px] text-muted-foreground/40">
        <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">↑↓</kbd> navigate</span>
        <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">↵</kbd> select</span>
        <span><kbd class="px-1 py-0.5 rounded bg-sidebar-accent/30 text-muted-foreground/50 font-mono">esc</kbd> dismiss</span>
      </div>
    {/if}
  </div>
{/if}
