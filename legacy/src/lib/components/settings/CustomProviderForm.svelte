<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { slideIn, slideOut } from "./_helpers.svelte";

	type ModelRow = { id: string; displayName: string };
	type HeaderRow = { name: string; value: string };

	interface Props {
		customProviderId: string;
		customDisplayName: string;
		customBaseUrl: string;
		customApiKey: string;
		customModels: ModelRow[];
		customHeaders: HeaderRow[];
		customErrors: Record<string, string>;
		isSubmittingCustom: boolean;
		onSubmit: () => void;
		onCancel: () => void;
		onClearError: (field: string) => void;
	}

	let {
		customProviderId = $bindable(),
		customDisplayName = $bindable(),
		customBaseUrl = $bindable(),
		customApiKey = $bindable(),
		customModels = $bindable(),
		customHeaders = $bindable(),
		customErrors,
		isSubmittingCustom,
		onSubmit,
		onCancel,
		onClearError
	}: Props = $props();

	function addModel() {
		customModels = [...customModels, { id: "", displayName: "" }];
	}
	function removeModel(idx: number) {
		customModels = customModels.filter((_, i) => i !== idx);
	}
	function addHeader() {
		customHeaders = [...customHeaders, { name: "", value: "" }];
	}
	function removeHeader(idx: number) {
		customHeaders = customHeaders.filter((_, i) => i !== idx);
	}
</script>

<section class="space-y-5" in:slideIn out:slideOut>
	<button
		onclick={onCancel}
		class="flex items-center gap-2 min-h-12 -ml-2 px-2 rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors"
	>
		<ArrowLeftIcon class="size-4" />
		Back
	</button>

	<div class="space-y-2">
		<div class="flex items-center gap-3">
			<div
				class="size-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0"
			>
				<SparklesIcon class="size-4 text-primary" />
			</div>
			<h3 class="text-lg font-black tracking-tight">Custom provider</h3>
		</div>
		<p class="text-sm text-muted-foreground leading-relaxed">
			Configure an OpenAI-compatible provider. See the
			<a
				href="https://docs.edapex.io/providers/custom"
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary hover:underline">provider config docs</a
			>.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="space-y-2">
		<Label
			for="custom-provider-id"
			class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>Provider ID</Label
		>
		<Input
			id="custom-provider-id"
			bind:value={customProviderId}
			placeholder="myprovider"
			disabled={isSubmittingCustom}
			oninput={() => onClearError("providerId")}
			class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all {customErrors.providerId
				? 'border-destructive/60'
				: ''}"
		/>
		{#if customErrors.providerId}
			<p class="text-[11px] font-bold text-destructive ml-1">{customErrors.providerId}</p>
		{:else}
			<p class="text-[10px] text-muted-foreground/60 ml-1">
				Lowercase letters, numbers, hyphens, or underscores
			</p>
		{/if}
	</div>

	<div class="space-y-2">
		<Label
			for="custom-display-name"
			class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>Display name</Label
		>
		<Input
			id="custom-display-name"
			bind:value={customDisplayName}
			placeholder="My AI Provider"
			disabled={isSubmittingCustom}
			oninput={() => onClearError("displayName")}
			class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-bold text-sm focus:border-primary/50 transition-all {customErrors.displayName
				? 'border-destructive/60'
				: ''}"
		/>
		{#if customErrors.displayName}
			<p class="text-[11px] font-bold text-destructive ml-1">{customErrors.displayName}</p>
		{/if}
	</div>

	<div class="space-y-2">
		<Label
			for="custom-base-url"
			class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>Base URL</Label
		>
		<Input
			id="custom-base-url"
			bind:value={customBaseUrl}
			placeholder="https://api.myprovider.com/v1"
			disabled={isSubmittingCustom}
			oninput={() => onClearError("baseUrl")}
			class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all {customErrors.baseUrl
				? 'border-destructive/60'
				: ''}"
		/>
		{#if customErrors.baseUrl}
			<p class="text-[11px] font-bold text-destructive ml-1">{customErrors.baseUrl}</p>
		{/if}
	</div>

	<div class="space-y-2">
		<Label
			for="custom-api-key"
			class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>API key</Label
		>
		<Input
			id="custom-api-key"
			type="password"
			bind:value={customApiKey}
			placeholder="API key"
			disabled={isSubmittingCustom}
			oninput={() => onClearError("apiKey")}
			class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all"
		/>
		<p class="text-[10px] text-muted-foreground/60 ml-1">
			Optional. Leave empty if you manage auth via headers.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="space-y-3">
		<div class="flex items-center gap-2 px-1">
			<Settings2Icon class="size-3 text-muted-foreground/40" />
			<span class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40"
				>Models</span
			>
		</div>
		{#each customModels as model, idx (idx)}
			<div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
				<Input
					bind:value={model.id}
					placeholder="model-id"
					disabled={isSubmittingCustom}
					class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
				/>
				<Input
					bind:value={model.displayName}
					placeholder="Display Name"
					disabled={isSubmittingCustom}
					class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-bold rounded-lg"
				/>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					onclick={() => removeModel(idx)}
					disabled={isSubmittingCustom}
					class="min-h-10 min-w-10 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
					aria-label="Remove model"
				>
					<Trash2Icon class="size-3.5" />
				</Button>
			</div>
		{/each}
		<button
			type="button"
			onclick={addModel}
			disabled={isSubmittingCustom}
			class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-1"
		>
			+ Add model
		</button>
	</div>

	<div class="space-y-3">
		<div class="flex items-center gap-2 px-1">
			<Settings2Icon class="size-3 text-muted-foreground/40" />
			<span class="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40"
				>Headers (Optional)</span
			>
		</div>
		{#each customHeaders as header, idx (idx)}
			<div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
				<Input
					bind:value={header.name}
					placeholder="Header-Name"
					disabled={isSubmittingCustom}
					class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
				/>
				<Input
					bind:value={header.value}
					placeholder="value"
					disabled={isSubmittingCustom}
					class="h-10 bg-background/50 border-sidebar-border/50 text-[11px] font-mono rounded-lg"
				/>
				<Button
					variant="ghost"
					size="icon"
					type="button"
					onclick={() => removeHeader(idx)}
					disabled={isSubmittingCustom}
					class="min-h-10 min-w-10 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
					aria-label="Remove header"
				>
					<Trash2Icon class="size-3.5" />
				</Button>
			</div>
		{/each}
		<button
			type="button"
			onclick={addHeader}
			disabled={isSubmittingCustom}
			class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-1"
		>
			+ Add header
		</button>
	</div>

	<div class="flex items-center gap-2">
		<Button
			onclick={onSubmit}
			disabled={isSubmittingCustom}
			class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px]"
		>
			{#if isSubmittingCustom}
				<Spinner class="size-3 mr-2" />
				Submitting…
			{:else}
				Submit
			{/if}
		</Button>
		<Button
			variant="ghost"
			onclick={onCancel}
			disabled={isSubmittingCustom}
			class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px] text-muted-foreground/60"
		>
			Cancel
		</Button>
	</div>
</section>
