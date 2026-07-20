<script lang="ts">
  import {
  	SelectedModel,
  	ResolvedModelHolder,
  	AvailableModelsHolder,
  	AVAILABLE_MODELS_STALE_MS
  } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import * as Popover from "./ui/popover";
  import * as Command from "./ui/command";
  import { Badge } from "./ui/badge";
  import { Spinner } from "./ui/spinner";
  import { getAvailableModels } from "$lib/api/agent.remote";
  import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
  import type { ModelInfo, AugmentedModelInfo } from "$lib/provider/spec";
  import type { ProviderId } from "$lib/provider/types";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import CheckIcon from "@lucide/svelte/icons/check";
  import RefreshIcon from "@lucide/svelte/icons/refresh-cw";
  import type { ClassValue } from "svelte/elements";

  type ModelGroup = { id: string; label: string; models: AugmentedModelInfo[] };

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  const selectedChatModel = SelectedModel.fromContext();
  const resolvedModelHolder = ResolvedModelHolder.fromContext();
  const availableModelsHolder = AvailableModelsHolder.fromContext();

  let open = $state(false);
  let searchQuery = $state("");

  const providerLabel = (providerId: string): string => {
    const builtin = BUILTIN_PROVIDERS[providerId as ProviderId];
    if (builtin) return builtin.name;
    return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  const isModelFree = (m: ModelInfo): boolean =>
    m.cost !== undefined && m.cost.input === 0 && m.cost.output === 0;

  // SSR-derived: the popover renders the holder's visibility-filtered
  // set on first paint with no fetch. The `$derived` re-runs whenever
  // the holder's models / hiddenIds / enabledIds change (e.g. after a
  // credential add in Settings, or a model toggle in Models tab), so
  // the popover reflects the new state without a manual refresh.
  const visibleModels = $derived(availableModelsHolder.visibleModels);

  const selectedModelEntry = $derived.by<ModelInfo | null>(() => {
    const value = selectedChatModel.value;
    if (!value) {
      return resolvedModelHolder.value;
    }
    const fromList = visibleModels.find(
      (m) => m.id === value || value.startsWith(`${m.id}@`)
    );
    if (fromList) return fromList;
    const resolved = resolvedModelHolder.value;
    if (resolved && (resolved.id === value || value.startsWith(`${resolved.id}@`))) {
      return resolved;
    }
    return resolved;
  });

  const providerGroups = $derived.by<ModelGroup[]>(() => {
    const seen = new Set<string>();
    const groups: ModelGroup[] = [];
    for (const m of visibleModels) {
      // Mistral is OCR-only; never show in the chat model selector.
      if (m.providerId === "mistral") continue;
      if (seen.has(m.providerId)) continue;
      seen.add(m.providerId);
      const providerModels = visibleModels.filter((x) => x.providerId === m.providerId);
      groups.push({
        id: m.providerId,
        label: providerLabel(m.providerId),
        models: providerModels
      });
    }
    return groups;
  });

  const filteredGroups = $derived.by<ModelGroup[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (m: ModelInfo): boolean => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.providerId.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    };
    return providerGroups
      .map((g) => ({
        id: g.id,
        label: g.label,
        models: g.models.filter(matches),
      }))
      .filter((g) => g.models.length > 0);
  });

  const hasResults = $derived.by<boolean>(() => filteredGroups.some((g) => g.models.length > 0));

  /**
   * Pick a model. The cookie carries only the bare model id — the chat
   * composer's thinking-mode trigger is the source of truth for which
   * variant (thinking/fast/auto) is active, and it auto-attaches the
   * first variant on first paint when the model exposes any.
   */
  function selectModel(model: ModelInfo): void {
    selectedChatModel.value = model.id;
    open = false;
    searchQuery = "";
  }

  /**
   * Background refresh. NEVER blanks the popover. Updates the holder
   * atomically; the `$derived`s re-run and the popover re-renders with
   * the fresh data on the next tick.
   */
  async function refreshModels(): Promise<void> {
    if (availableModelsHolder.syncing) return;
    availableModelsHolder.markSyncing(true);
    try {
      const result = await getAvailableModels({});
      if (result.success) {
        availableModelsHolder.replace(
          result.models,
          result.hiddenModelIds ?? [],
          result.enabledModelIds ?? []
        );
      } else {
        console.error("[model-selector] Failed to refresh models:", result.message);
      }
    } catch (err) {
      console.error("[model-selector] Failed to refresh models:", err);
    } finally {
      availableModelsHolder.markSyncing(false);
    }
  }

  function onOpenChange(next: boolean): void {
    open = next;
    if (next) {
      searchQuery = "";
      // Stale-while-revalidate: re-fetch in the background if the SSR
      // data is older than AVAILABLE_MODELS_STALE_MS. The popover
      // continues to show the cached list while the fetch is in flight
      // — `visibleModels` is a `$derived` and never goes blank.
      if (availableModelsHolder.isStale && !availableModelsHolder.syncing) {
        void refreshModels();
      }
    }
  }

  // Friendly "X seconds ago" string for the freshness chip.
  const freshnessLabel = $derived.by<string>(() => {
    if (availableModelsHolder.syncing) return "Syncing…";
    if (availableModelsHolder.lastSyncedAt === 0) return "Not synced";
    const elapsed = Date.now() - availableModelsHolder.lastSyncedAt;
    if (elapsed < 5_000) return "Just now";
    if (elapsed < 60_000) return `${Math.round(elapsed / 1000)}s ago`;
    if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m ago`;
    return `${Math.round(elapsed / 3_600_000)}h ago`;
  });
  // The label is computed at render time; the timeout below re-runs
  // the derived every 30s while the popover is open so the chip
  // stays accurate without polling.
  let _freshnessTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (open) {
      _freshnessTimer = setInterval(() => {
        // Read the derived to trigger the recompute.
        void freshnessLabel;
      }, 30_000);
      return () => {
        if (_freshnessTimer) clearInterval(_freshnessTimer);
        _freshnessTimer = null;
      };
    }
  });
  // Used by tests to assert the configured stale window.
  export const __staleMsForTests = AVAILABLE_MODELS_STALE_MS;
</script>

<Popover.Root bind:open onOpenChange={onOpenChange}>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class={cn(
          "group inline-flex items-center gap-1 cursor-pointer text-xs font-bold tracking-tight text-sidebar-foreground/80 hover:text-foreground data-[state=open]:text-foreground transition-colors",
          c,
        )}
      >
        <span class="max-w-[160px] truncate">
          {selectedModelEntry?.name ?? "Select a model"}
        </span>
        <ChevronDownIcon class="size-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    sideOffset={6}
    class="w-[calc(100vw-2rem)] sm:w-[360px] p-0 not-only:shadow-2xl border-sidebar-border/30 rounded-xl overflow-hidden"
  >
    <Command.Root shouldFilter={false}>
      <div class="flex items-center gap-2 border-b border-sidebar-border/20 px-2 py-1.5">
        <Command.Input
          placeholder="Search models"
          bind:value={searchQuery}
          class="border-0 focus:ring-0"
        />
        {#if availableModelsHolder.syncing}
          <Spinner class="size-3 text-muted-foreground" />
        {/if}
      </div>
      <Command.List class="max-h-[340px] scroll-py-1">
        {#if !hasResults}
          <Command.Empty class="py-8 text-center text-[11px] font-bold tracking-wider uppercase text-muted-foreground/60">
            {#if availableModelsHolder.models.length === 0}
              No models available. Connect a provider in Settings → Providers.
            {:else if visibleModels.length === 0}
              All models are hidden. Enable them in Settings → Models.
            {:else}
              No models found.
            {/if}
          </Command.Empty>
        {/if}
        {#each filteredGroups as group (group.id)}
          <Command.Group heading={group.label} class="">
            {#each group.models as chatModel (chatModel.id)}
              {@const isSelected = selectedChatModel.value === chatModel.id
                || selectedChatModel.value?.startsWith(`${chatModel.id}@`)}
              <Command.Item
                value={chatModel.id}
                onSelect={() => selectModel(chatModel)}
                class="group/item flex flex-row items-center justify-between gap-2 px-3 py-2.5 min-h-12 rounded-md cursor-pointer data-[active=true]:bg-primary/10"
                data-active={isSelected}
              >
                <div class="flex items-center gap-2 relative min-w-0 flex-1">
                  <span class="text-[11px] font-bold tracking-tight text-sidebar-foreground/80 group-hover/item:text-primary transition-colors truncate">
                    {chatModel.name.split(" - ").pop()}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    {#if chatModel.isCatalogKnown}
                      <Badge
                        variant="outline"
                        class="text-[8px] font-black px-1 py-0 rounded-sm border-primary/30 text-primary/70 bg-primary/5"
                      >
                        BUILT-IN
                      </Badge>
                    {:else}
                      <Badge
                        variant="outline"
                        class="text-[8px] font-black px-1 py-0 rounded-sm border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                      >
                        OPTED-IN
                      </Badge>
                    {/if}
                    {#if chatModel.source === 'pool'}
                      <Badge
                        variant="outline"
                        class="text-[8px] font-black px-1 py-0 rounded-sm border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                      >
                        POOL
                      </Badge>
                    {/if}
                    {#if isModelFree(chatModel)}
                      <Badge
                        variant="outline"
                        class="text-[8px] font-black px-1 py-0 rounded-sm border-primary/30 text-primary/80 bg-primary/5"
                      >
                        FREE
                      </Badge>
                    {/if}
                  </div>
                </div>
                {#if isSelected}
                  <CheckIcon class="size-3.5 text-primary shrink-0" />
                {/if}
              </Command.Item>
            {/each}
          </Command.Group>
        {/each}
      </Command.List>
      <div
        class="flex items-center justify-between gap-2 border-t border-sidebar-border/20 px-2 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/50"
      >
        <span>{freshnessLabel}</span>
        <button
          type="button"
          onclick={() => void refreshModels()}
          disabled={availableModelsHolder.syncing}
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] tracking-widest hover:text-foreground hover:bg-muted/10 disabled:opacity-50 transition-colors"
          aria-label="Refresh model list"
        >
          <RefreshIcon class="size-2.5" />
          Refresh
        </button>
      </div>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
