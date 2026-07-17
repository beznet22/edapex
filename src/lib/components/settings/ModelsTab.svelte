<script lang="ts">
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import type { ProviderInfo, ModelInfo, AugmentedModelInfo } from "$lib/provider/spec";

	type ProviderGroup = {
		id: string;
		info: ProviderInfo | undefined;
		models: AugmentedModelInfo[];
	};

	interface Props {
		modelSearch: string;
		isLoadingModels: boolean;
		visibleProviderGroups: ProviderGroup[];
		visiblePlatformModels: AugmentedModelInfo[];
		visibleDiscoveredModels: AugmentedModelInfo[];
		visibleModelIds: string[];
		togglingModelId: string | null;
		onToggleVisibility: (model: AugmentedModelInfo, visible: boolean) => void;
		onAddProvider: () => void;
	}

	let {
		modelSearch = $bindable(),
		isLoadingModels,
		visibleProviderGroups,
		visiblePlatformModels,
		visibleDiscoveredModels,
		visibleModelIds,
		togglingModelId,
		onToggleVisibility,
		onAddProvider
	}: Props = $props();

	function isModelFree(model: ModelInfo): boolean {
		return model.cost !== undefined && model.cost.input === 0 && model.cost.output === 0;
	}
	function isModelVisible(modelId: string): boolean {
		return visibleModelIds.includes(modelId);
	}

	function modelShortName(model: ModelInfo): string {
		return model.name.split(" - ").pop() ?? model.name;
	}

	const enabledCount = $derived(visibleModelIds.length);
	const totalCount = $derived(
		visiblePlatformModels.length +
			visibleProviderGroups.reduce((sum, g) => sum + g.models.length, 0)
	);
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
	<div class="space-y-2">
		<div class="flex items-center justify-between gap-3">
			<div class="space-y-1">
				<h2 class="text-2xl font-black tracking-tight text-foreground">Models</h2>
				<p class="text-sm text-muted-foreground">
					Toggle the models you want to see in the chat composer. Only validated, discovered
					models appear here.
				</p>
			</div>
			{#if !isLoadingModels && totalCount > 0}
				<div
					class="shrink-0 flex flex-col items-end gap-0.5 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20"
				>
					<span class="text-[9px] font-black uppercase tracking-widest text-primary/70">
						Enabled
					</span>
					<span class="text-lg font-black text-primary leading-none">
						{enabledCount}<span class="text-muted-foreground/50 text-sm">/{totalCount}</span>
					</span>
				</div>
			{/if}
		</div>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<SearchIcon
				class="size-4 text-muted-foreground/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
			/>
			<Input
				bind:value={modelSearch}
				placeholder="Search models..."
				class="h-12 pl-10 pr-4 rounded-xl bg-muted/5 border-sidebar-border/50 text-sm font-bold"
			/>
		</div>
		<Button
			variant="outline"
			size="icon"
			onclick={onAddProvider}
			aria-label="Add or manage providers"
			class="min-h-12 min-w-12 rounded-xl border-sidebar-border/50"
		>
			<PlusIcon class="size-4" />
		</Button>
	</div>

	{#if isLoadingModels}
		<div class="space-y-6">
			{#each [0, 1] as skeletonIdx (skeletonIdx)}
				<div class="space-y-3">
					<Skeleton class="h-3 w-24 ml-1" />
					<div class="flex flex-wrap gap-2">
						{#each [0, 1, 2, 3] as _ (skeletonIdx + '_' + _)}
							<Skeleton class="h-8 w-28 rounded-full" />
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else if visibleProviderGroups.length === 0 && visiblePlatformModels.length === 0 && visibleDiscoveredModels.length === 0}
		<div
			class="p-6 rounded-2xl border border-dashed border-sidebar-border/40 text-center"
		>
			<p class="text-sm font-bold text-muted-foreground">No models available</p>
			<p class="text-[11px] text-muted-foreground/60 mt-1">
				Connect a provider to see its models.
			</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#if visiblePlatformModels.length > 0}
				<div class="space-y-3">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-blue-300/80 ml-1 flex items-center gap-2"
					>
						<SparklesIcon class="size-3" />
						Platform Defaults
						<span class="text-muted-foreground/30 font-bold normal-case tracking-tight"
							>{visiblePlatformModels.length} models</span
						>
					</h3>
			<div class="flex flex-wrap gap-2">
				{#each visiblePlatformModels as model (model.id)}
					{@const enabled = isModelVisible(model.id)}
					{@const busy = togglingModelId === model.id}
					<button
						type="button"
						disabled={busy}
						onclick={() => onToggleVisibility(model, !enabled)}
						aria-pressed={enabled}
						aria-label={`${enabled ? 'Hide' : 'Show'} ${modelShortName(model)}`}
								class="group inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold tracking-tight transition-all duration-200 ease-out disabled:opacity-50 {enabled
									? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 hover:scale-[1.02]'
									: 'bg-muted/5 text-muted-foreground/50 border border-dashed border-sidebar-border/40 hover:bg-muted/10 hover:text-muted-foreground/80 hover:border-sidebar-border/70'}"
							>
								{#if enabled}
									<CheckIcon class="size-3 shrink-0" />
								{/if}
								<span class="truncate max-w-[180px]">{modelShortName(model)}</span>
								{#if model.source === 'pool'}
									<Badge
										class="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[8px] font-black px-1 py-0 rounded-sm"
									>
										POOL
									</Badge>
								{/if}
								{#if isModelFree(model)}
									<Badge
										class="bg-primary/15 text-primary border-none text-[8px] font-black px-1 py-0 rounded-sm"
									>
										FREE
									</Badge>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
			{#each visibleProviderGroups as group (group.id)}
				<div class="space-y-3">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 flex items-center gap-2"
					>
						{group.info?.name ?? group.id}
						<span class="text-muted-foreground/30 font-bold normal-case tracking-tight"
							>{group.models.length} models</span
						>
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each group.models as model (model.id)}
							{@const enabled = isModelVisible(model.id)}
							{@const busy = togglingModelId === model.id}
							<button
								type="button"
								disabled={busy}
								onclick={() => onToggleVisibility(model, !enabled)}
								aria-pressed={enabled}
								aria-label={`${enabled ? 'Hide' : 'Show'} ${modelShortName(model)}`}
								title={model.description || modelShortName(model)}
								class="group inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold tracking-tight transition-all duration-200 ease-out disabled:opacity-50 {enabled
									? 'bg-primary text-primary-foreground border border-primary/40 hover:bg-primary/90 hover:scale-[1.02] shadow-sm shadow-primary/20'
									: 'bg-muted/5 text-muted-foreground/50 border border-dashed border-sidebar-border/40 hover:bg-muted/10 hover:text-muted-foreground/80 hover:border-sidebar-border/70'}"
							>
								{#if enabled}
									<CheckIcon class="size-3 shrink-0" />
								{/if}
								<span class="truncate max-w-[180px]">{modelShortName(model)}</span>
								{#if model.source === 'pool'}
									<Badge
										class="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[8px] font-black px-1 py-0 rounded-sm"
									>
										POOL
									</Badge>
								{/if}
								{#if isModelFree(model)}
									<Badge
										class="bg-primary-foreground/20 text-primary-foreground border-none text-[8px] font-black px-1 py-0 rounded-sm"
									>
										FREE
									</Badge>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/each}
			{#if visibleDiscoveredModels.length > 0}
				<div class="space-y-3">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-amber-300/80 ml-1 flex items-center gap-2"
					>
						<SparklesIcon class="size-3" />
						Discovered (not in catalogue)
						<span class="text-muted-foreground/30 font-bold normal-case tracking-tight"
							>{visibleDiscoveredModels.length} models</span
						>
					</h3>
					<div class="flex flex-wrap gap-2">
						{#each visibleDiscoveredModels as model (model.id)}
							{@const enabled = isModelVisible(model.id)}
							{@const busy = togglingModelId === model.id}
							<button
								type="button"
								disabled={busy}
								onclick={() => onToggleVisibility(model, !enabled)}
								aria-pressed={enabled}
								aria-label={`${enabled ? 'Disable' : 'Enable'} ${modelShortName(model)}`}
								title={model.description || modelShortName(model)}
								class="group inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold tracking-tight transition-all duration-200 ease-out disabled:opacity-50 {enabled
									? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 hover:scale-[1.02]'
									: 'bg-muted/5 text-muted-foreground/50 border border-dashed border-sidebar-border/40 hover:bg-muted/10 hover:text-muted-foreground/80 hover:border-sidebar-border/70'}"
							>
								{#if enabled}
									<CheckIcon class="size-3 shrink-0" />
								{/if}
								<span class="truncate max-w-[180px]">{modelShortName(model)}</span>
								{#if model.source === 'pool'}
									<Badge
										class="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[8px] font-black px-1 py-0 rounded-sm"
									>
										POOL
									</Badge>
								{/if}
								{#if isModelFree(model)}
									<Badge
										class="bg-primary/15 text-primary border-none text-[8px] font-black px-1 py-0 rounded-sm"
									>
										FREE
									</Badge>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
