<script lang="ts">
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import type { ProviderInfo, ModelInfo } from "$lib/provider/spec";

	type ProviderGroup = {
		id: string;
		info: ProviderInfo | undefined;
		models: ModelInfo[];
	};

	interface Props {
		modelSearch: string;
		isLoadingModels: boolean;
		visibleProviderGroups: ProviderGroup[];
		visiblePlatformModels: ModelInfo[];
		visibleModelIds: string[];
		togglingModelId: string | null;
		onToggleVisibility: (modelId: string, visible: boolean) => void;
		onAddProvider: () => void;
	}

	let {
		modelSearch = $bindable(),
		isLoadingModels,
		visibleProviderGroups,
		visiblePlatformModels,
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
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
	<div class="space-y-2">
		<h2 class="text-2xl font-black tracking-tight text-foreground">Models</h2>
		<p class="text-sm text-muted-foreground">
			Choose which models appear in your chat composer. Hidden models are filtered from the
			model picker.
		</p>
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
				<div class="space-y-2">
					<Skeleton class="h-3 w-24 ml-1" />
					<div
						class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30"
					>
						<Skeleton class="size-10 rounded-xl" />
						<div class="flex-1 space-y-2">
							<Skeleton class="h-3 w-1/2" />
							<Skeleton class="h-2 w-1/3" />
						</div>
						<Skeleton class="h-5 w-10 rounded-full" />
					</div>
				</div>
			{/each}
		</div>
	{:else if visibleProviderGroups.length === 0 && visiblePlatformModels.length === 0}
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
				<div class="space-y-2">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-blue-300/80 ml-1 flex items-center gap-2"
					>
						Platform Defaults
						<span class="text-muted-foreground/30 font-bold normal-case tracking-tight"
							>{visiblePlatformModels.length} models</span
						>
					</h3>
					<div class="space-y-1.5">
						{#each visiblePlatformModels as model (model.id)}
							<div
								class="flex items-center gap-3 p-3 px-4 rounded-xl bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-all"
							>
								<div class="flex-1 min-w-0 space-y-0.5">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="text-sm font-black tracking-tight truncate"
											>{model.name}</span
										>
										<Badge
											class="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] font-black px-1.5 py-0 rounded-md"
											>Platform</Badge
										>
									</div>
									<p class="text-[10px] text-muted-foreground/60 truncate">
										{model.description}
									</p>
								</div>
								<Switch
									checked={isModelVisible(model.id)}
									disabled={togglingModelId === model.id}
									onCheckedChange={(val: boolean) => onToggleVisibility(model.id, val)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#each visibleProviderGroups as group (group.id)}
				<div class="space-y-2">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 flex items-center gap-2"
					>
						{group.info?.name ?? group.id}
						<span class="text-muted-foreground/30 font-bold normal-case tracking-tight"
							>{group.models.length} models</span
						>
					</h3>
					<div class="space-y-1.5">
						{#each group.models as model (model.id)}
							<div
								class="flex items-center gap-3 p-3 px-4 rounded-xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
							>
								<div class="flex-1 min-w-0 space-y-0.5">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="text-sm font-black tracking-tight truncate"
											>{model.name}</span
										>
										{#if isModelFree(model)}
											<Badge
												class="bg-primary/10 text-primary border-none text-[9px] font-black px-1.5 py-0 rounded-md"
												>Free</Badge
											>
										{/if}
									</div>
									<p class="text-[10px] text-muted-foreground/60 truncate">
										{model.description}
									</p>
								</div>
								<Switch
									checked={isModelVisible(model.id)}
									disabled={togglingModelId === model.id}
									onCheckedChange={(val: boolean) => onToggleVisibility(model.id, val)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
