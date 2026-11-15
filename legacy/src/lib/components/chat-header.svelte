<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import type { AuthUser } from "$lib/types/auth-types";
	import { UserContext } from "$lib/context/user-context.svelte";
	import { SelectedModel, ResolvedModelHolder } from "$lib/context/sync.svelte";
	import { getModelById } from "$lib/provider/catalog";
	import type { ModelId } from "$lib/provider/types";
	import ContextUsageIndicator from "$lib/components/ContextUsageIndicator.svelte";
	import ModelSelector from "$lib/components/model-selector.svelte";
	import ActivityPopover from "$lib/components/activity-popover.svelte";

	let {
		user,
	}: {
		user?: AuthUser;
	} = $props();

	const sidebar = useSidebar();
	const userContext = UserContext.fromContext();
	const selectedChatModel = SelectedModel.fromContext();
	const resolvedModelHolder = ResolvedModelHolder.fromContext();

	// Current model: try the SSR-resolved model first, then fall back to the
	// catalog lookup. Mirrors ChatComposer.svelte so the header stays
	// self-sufficient without coupling to the composer's local state.
	const currentModel = $derived.by(() => {
		const raw = selectedChatModel.value;
		if (!raw) return resolvedModelHolder.value;
		const modelId = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
		const resolved = resolvedModelHolder.value;
		if (resolved && (resolved.id === modelId || raw.startsWith(`${resolved.id}@`))) {
			return resolved;
		}
		return getModelById(modelId as ModelId) ?? null;
	});

	const maxContext = $derived(currentModel?.limit.context ?? 128_000);
</script>

<header
  class="sticky top-0 z-30 w-full shrink-0 border-b border-border/10 bg-background/80 backdrop-blur-xl px-4 py-3 flex items-center justify-between min-w-0 h-14"
>
  <div class="flex flex-1 items-center gap-2 min-w-0">
    <Sidebar.Trigger
      variant="ghost"
      class="h-10 w-10 min-h-10 min-w-10 shrink-0 text-muted-foreground hover:text-foreground"
    />
    <ModelSelector
      class="h-10 rounded-full border-none bg-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground shrink-0 transition-all data-[state=open]:bg-muted/40"
    />
  </div>

  <div class="flex items-center gap-1 shrink-0">
    <ActivityPopover />
    {#if currentModel}
      <ContextUsageIndicator
        modelId={currentModel.id}
        maxTokens={maxContext}
      />
    {/if}
  </div>
</header>
