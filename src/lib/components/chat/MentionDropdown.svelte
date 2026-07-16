<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { untrack } from "svelte";
  import SchoolIcon from "@lucide/svelte/icons/school";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
  import TableIcon from "@lucide/svelte/icons/table";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";

  /**
   * Entity result from /api/mentions/search
   */
  export interface MentionSearchResult {
    id: number;
    name: string;
    category: string;
    typeBadge: string;
    parentContext?: string;
  }

  type MentionCategory = 'schools' | 'students' | 'class_section' | 'academic_year' | 'exam' | 'file';

  interface CategoryDef {
    id: MentionCategory;
    label: string;
    icon: typeof SchoolIcon;
  }

  let {
    query,
    designationId,
    visible,
    onSelect,
    onDismiss,
  }: {
    query: string;
    designationId: number;
    visible: boolean;
    onSelect: (entity: MentionSearchResult) => void;
    onDismiss: () => void;
  } = $props();

  // All possible categories with their icons
  const ALL_CATEGORIES: CategoryDef[] = [
    { id: 'schools', label: 'Schools', icon: SchoolIcon },
    { id: 'students', label: 'Students', icon: GraduationCapIcon },
    { id: 'class_section', label: 'Class & Section', icon: LayoutGridIcon },
    { id: 'academic_year', label: 'Academic Year', icon: CalendarIcon },
    { id: 'exam', label: 'Exam Term', icon: ClockIcon },
    { id: 'file', label: 'Workspace Files', icon: FolderIcon },
  ];

  // Role-based category filtering
  const allowedCategories = $derived(
    (designationId === ALLOWED_DESIGNATIONS.IT || designationId === ALLOWED_DESIGNATIONS.COORDINATOR)
      ? ALL_CATEGORIES
      : designationId === ALLOWED_DESIGNATIONS.CLASS_TEACHER
        ? ALL_CATEGORIES.filter(c => ['students', 'class_section', 'academic_year', 'exam', 'file'].includes(c.id))
        : []
  );

  // State
  let activeCategory = $state<MentionCategory | null>(null);
  let results = $state<MentionSearchResult[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  let highlightedIndex = $state(0);
  let debounceTimer = $state.raw<ReturnType<typeof setTimeout> | null>(null);
  let abortController = $state.raw<AbortController | null>(null);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  // Derived: the categories to show
  const categories = $derived(allowedCategories);

  // Derived: category inferred from the typed @prefix (e.g. @class → class_section).
  // Bare `@` (no prefix) defaults to `student` so the scoped roster shows up
  // immediately when the user starts an @mention — typing `@jo` then narrows
  // by name without the user having to type the `student` keyword first.
  const inferredCategory = $derived.by<MentionCategory | null>(() => {
    if (!visible) return null;
    if (query.startsWith("class ")) return "class_section";
    if (query.startsWith("year ")) return "academic_year";
    if (query.startsWith("term ")) return "exam";  // alias for exam
    if (query.startsWith("exam ")) return "exam";
    if (query.startsWith("file ")) return "file";
    if (query.startsWith("student ")) return "students";
    // Bare `@` (no name fragment yet, no prefix) → students tab. ChatComposer
    // sends `"student "` for a bare `@` so this branch matches before the
    // user types a name.
    if (query === "student") return "students";
    return null;
  });

  // Effective category: typed prefix wins over user-clicked tab
  const effectiveCategory = $derived<MentionCategory | null>(
    inferredCategory ?? activeCategory,
  );

  // Derived: the flat list of items for keyboard navigation
  const flatItems = $derived(results);

  /**
   * Truncate entity name to 40 chars with ellipsis
   */
  function truncateName(name: string): string {
    if (name.length <= 40) return name;
    return name.slice(0, 40) + '…';
  }

  /**
   * Build a unique key for each result item.
   *
   * For `class_section` results the id is an OBJECT `{ classId, sectionId }`,
   * which JS stringifies to `"[object Object]"` — that caused
   * `each_key_duplicate` because every class_section row shared the same key.
   * JSON.stringify the object so the (classId, sectionId) tuple is encoded.
   */
  function keyFor(item: MentionSearchResult): string {
    const idPart =
      item.id !== null && typeof item.id === 'object'
        ? JSON.stringify(item.id)
        : String(item.id);
    return `${idPart}-${item.category}`;
  }

  /**
   * Fetch results from the search API with debounce
   */
  function fetchResults(rawQuery: string, category: MentionCategory | null) {
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

    // Strip typed @category prefix (e.g. "class foo" → "foo") so the search API
    // receives just the entity-name fragment. `student` is the implicit
    // category for a bare `@` (no prefix), so it's stripped the same way.
    const searchQuery = rawQuery.replace(/^(?:class|year|exam|term|file|student)\s+/, "");

    // Empty query is allowed — the backend returns the default tab
    // (students + class_section). Only bail on hidden state.
    loading = true;

    debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      abortController = controller;

      // 3-second timeout
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const params = new URLSearchParams({ q: searchQuery, limit: '10' });
        if (category) {
          params.set('category', category);
        }

        const response = await fetch(`/api/mentions/search?${params.toString()}`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        results = data.results ?? [];
        highlightedIndex = 0;
        errorMessage = null;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Check if it was a timeout (not a manual abort from new request)
          if (!controller.signal.aborted || controller === abortController) {
            errorMessage = 'Unable to load suggestions';
            results = [];
          }
        } else {
          errorMessage = 'Unable to load suggestions';
          results = [];
        }
      } finally {
        loading = false;
      }
    }, 200); // 200ms debounce
  }

  /**
   * Imperatively refresh the suggestion list. Called by ChatComposer via
   * bind:this when mentionQuery or showMentions change.
   *
   * Wrapped in `untrack()` so the inner reads (debounceTimer, abortController,
   * effectiveCategory, results, loading, etc.) do NOT register as
   * dependencies of the calling $effect. Without untrack, Svelte 5 detects
   * the read+write on debounceTimer inside fetchResults as a self-loop and
   * trips `effect_update_depth_exceeded` after ~50 iterations.
   */
  export function refresh(rawQuery: string, v: boolean): void {
    untrack(() => {
      if (v) {
        fetchResults(rawQuery, effectiveCategory);
      } else {
        results = [];
        errorMessage = null;
        loading = false;
        highlightedIndex = 0;
      }
    });
  }

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

  function selectCategory(cat: MentionCategory | null) {
    activeCategory = cat;
    highlightedIndex = 0;
  }
</script>

{#if visible}
  <div
    bind:this={dropdownRef}
    class="w-full min-w-[320px] bg-popover/90 backdrop-blur-2xl border border-border/10 rounded-xl shadow-2xl p-1 animate-in fade-in slide-in-from-bottom-2 duration-200"
    role="listbox"
    aria-label="Mention suggestions"
  >
    <!-- Category Tabs -->
    {#if categories.length > 1}
      <div class="flex items-center gap-0.5 px-1.5 py-1.5 overflow-x-auto scrollbar-hide">
        <button
          class={cn(
            "shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
            effectiveCategory === null
              ? "bg-primary/15 text-primary border border-primary/20"
              : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent/30"
          )}
          onclick={() => selectCategory(null)}
        >
          All
        </button>
        {#each categories as cat (cat.id)}
          <button
            class={cn(
              "shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer",
              effectiveCategory === cat.id
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent/30"
            )}
            onclick={() => selectCategory(cat.id)}
            >
            <cat.icon class="size-3" />
            {cat.label}
          </button>
        {/each}
      </div>
      <div class="mx-1.5 h-px bg-border/10 my-0.5"></div>
    {/if}

    <!-- Results Area -->
    <div data-results class="flex flex-col gap-0.5 overflow-y-auto max-h-[320px] scrollbar-slick px-0.5">
      <!-- Loading State -->
      {#if loading && results.length === 0}
        <div class="flex items-center justify-center gap-2 p-4">
          <LoaderCircleIcon class="size-4 text-muted-foreground animate-spin" />
          <span class="text-xs text-muted-foreground">Searching...</span>
        </div>
      <!-- Error State -->
      {:else if errorMessage}
        <div class="flex items-center justify-center gap-2 p-4">
          <AlertCircleIcon class="size-4 text-muted-foreground/60" />
          <span class="text-xs text-muted-foreground">{errorMessage}</span>
        </div>
      <!-- Empty State -->
      {:else if !loading && results.length === 0 && query.trim()}
        <div class="p-4 text-center text-xs text-muted-foreground">
          No results found
        </div>
      <!-- Results List -->
      {:else}
        {#each results as item, index (keyFor(item))}
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
              {#if item.category === 'schools'}
                <SchoolIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else if item.category === 'students'}
                <GraduationCapIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else if item.category === 'class_section'}
                <LayoutGridIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else if item.category === 'academic_year'}
                <CalendarIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else if item.category === 'exam'}
                <ClockIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else if item.category === 'file'}
                <FolderIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {:else}
                <GraduationCapIcon class={cn("size-4", highlightedIndex === index ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
              {/if}
            </div>

            <!-- Content -->
            <div class="flex flex-col flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class={cn(
                  "text-sm font-medium truncate transition-colors",
                  highlightedIndex === index ? "text-primary" : "text-foreground group-hover:text-primary"
                )}>
                  @{truncateName(item.name)}
                </span>
                <span class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-sidebar-accent/40 text-muted-foreground/70 border border-border/10">
                  {item.typeBadge}
                </span>
              </div>
              {#if item.parentContext}
                <span class="text-[10px] text-muted-foreground/60 truncate">
                  {item.parentContext}
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
