<script lang="ts">
  import {
  	SelectedModel,
  	ResolvedModelHolder,
  	AvailableModelsHolder
  } from "$lib/context/sync.svelte";
  import { cn } from "$lib/utils/shadcn.js";
  import { Button } from "./ui/button";
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
  import type { ClassValue } from "svelte/elements";

  type ModelGroup = { id: string; label: string; models: ModelInfo[] };

  let {
    class: c,
  }: {
    class?: ClassValue;
  } = $props();

  const selectedChatModel = SelectedModel.fromContext();
  const resolvedModelHolder = ResolvedModelHolder.fromContext();
  const availableModelsHolder = AvailableModelsHolder.fromContext();

  // Models are SSR-loaded via the layout into the context. No initial
  // fetch needed — first paint of the popover shows the full list.
  let models = $state<AugmentedModelInfo[]>(availableModelsHolder.models);
  let isLoading = $state(false);

  let open = $state(false);
  let searchQuery = $state("");

  const providerLabel = (providerId: string): string => {
    const builtin = BUILTIN_PROVIDERS[providerId as ProviderId];
    if (builtin) return builtin.name;
    return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  const isModelFree = (m: ModelInfo): boolean =>
    m.cost !== undefined && m.cost.input === 0 && m.cost.output === 0;

  const selectedModelEntry = $derived.by<ModelInfo | null>(() => {
    const value = selectedChatModel.value;
    if (!value) {
      return resolvedModelHolder.value;
    }
    const fromList = models.find((m) => m.id === value || value.startsWith(`${m.id}@`)) ?? null;
    if (fromList) return fromList;
    // Fall back to the SSR-resolved model if it matches the current cookie
    const resolved = resolvedModelHolder.value;
    if (resolved && (resolved.id === value || value.startsWith(`${resolved.id}@`))) {
      return resolved;
    }
    return resolved;
  });

  // All models grouped by providerId (includes both user-connected and
  // platform-default models from the same provider, when both exist).
  const providerGroups = $derived.by<ModelGroup[]>(() => {
    const seen = new Set<string>();
    const groups: ModelGroup[] = [];
    for (const m of models) {
      if (seen.has(m.providerId)) continue;
      seen.add(m.providerId);
      const providerModels = models.filter((x) => x.providerId === m.providerId);
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
   * first variant on first paint when the model exposes any. Keeping
   * model selection and variant selection split means picking a model
   * never silently changes the user's chosen thinking effort.
   */
  function selectModel(model: ModelInfo): void {
    // V2 cookie format: `provider/model@variant`. Catalog ids are already
    // slash-formatted; we only write the bare model id here so the
    // composer's variant trigger starts in its empty state.
    selectedChatModel.value = model.id;
    open = false;
    searchQuery = "";
  }

  async function refreshModels(): Promise<void> {
    isLoading = true;
    try {
      const result = await getAvailableModels({});
      if (result.success) {
        availableModelsHolder.replace(result.models, []);
        // Local mirror — $effect re-syncs but we update eagerly for snappier
        // render after the first manual refresh.
        models = result.models;
      } else {
        console.error("[model-selector] Failed to load models:", result.message);
      }
    } catch (err) {
      console.error("[model-selector] Failed to load models:", err);
    } finally {
      isLoading = false;
    }
  }

  function onOpenChange(next: boolean): void {
    open = next;
    if (next) {
      searchQuery = "";
      void refreshModels();
    }
  }
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
    class="w-[calc(100vw-2rem)] sm:w-[360px] p-0 hermes-glass shadow-2xl border-sidebar-border/30 rounded-xl overflow-hidden"
  >
    <Command.Root shouldFilter={false}>
      <div class="flex items-center gap-2 border-b border-sidebar-border/20 px-2 py-1.5">
        <Command.Input
          placeholder="Search models"
          bind:value={searchQuery}
          class="border-0 focus:ring-0"
        />
      </div>
      <Command.List class="max-h-[340px] scroll-py-1">
        {#if isLoading}
          <div class="flex items-center justify-center py-10">
            <Spinner class="size-4 text-muted-foreground" />
          </div>
        {:else}
          {#if !hasResults}
            <Command.Empty class="py-8 text-center text-[11px] font-bold tracking-wider uppercase text-muted-foreground/60">
              No models found.
            </Command.Empty>
          {/if}
          {#each filteredGroups as group (group.id)}
            <Command.Group
              heading={group.label}
              class="[&_[data-slot=command-group-heading]]:text-muted-foreground [&_[data-slot=command-group-heading]]:px-3 [&_[data-slot=command-group-heading]]:py-1.5 [&_[data-slot=command-group-heading]]:text-[9px] [&_[data-slot=command-group-heading]]:font-black [&_[data-slot=command-group-heading]]:uppercase [&_[data-slot=command-group-heading]]:tracking-widest [&_[data-slot=command-group-heading]]:opacity-50"
            >
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
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
