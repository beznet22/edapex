<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import GiftIcon from "@lucide/svelte/icons/gift";
	import KeyRoundIcon from "@lucide/svelte/icons/key-round";
	import { slideIn, slideOut } from "./_helpers.svelte";
	import { providerLogos } from "./_logos";
	import type { ProviderInfo } from "$lib/provider/spec";

	interface Props {
		provider: ProviderInfo;
		apiKeyInput: string;
		isSavingApiKey: boolean;
		apiKeyError: string | null;
		/** When the user can donate (pool enabled, role in donorRoles),
		 *  the "Also donate to school pool" checkbox is rendered. */
		canDonate: boolean;
		donateChecked: boolean;
		/** When the user has set the global "always donate" preference, the
		 *  per-form checkbox is rendered disabled (it's already opted-in). */
		alwaysDonateEnabled: boolean;
		/** Optional — only used when `donateChecked` is NOT two-way bound.
		 *  With `bind:donateChecked` the parent sees updates directly. */
		onDonateChange?: (next: boolean) => void;
		onSubmit: () => void;
		onCancel: () => void;
	}

	let {
		provider,
		apiKeyInput = $bindable(),
		isSavingApiKey,
		apiKeyError,
		canDonate,
		donateChecked = $bindable(),
		alwaysDonateEnabled,
		onDonateChange,
		onSubmit,
		onCancel,
	}: Props = $props();
</script>

<section class="space-y-5" in:slideIn out:slideOut>
	<button
		onclick={onCancel}
		class="flex items-center gap-2 min-h-12 -ml-2 px-2 rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors"
	>
		<ArrowLeftIcon class="size-4" />
		Back
	</button>

	<div class="space-y-1">
		<div class="flex items-center gap-3">
			<div
				class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center p-2 overflow-hidden shrink-0"
			>
				{#if providerLogos[provider.id]}
					<img
						src={providerLogos[provider.id]}
						alt={provider.name}
						class="size-full object-contain dark:invert"
						onerror={(e) => {
							(e.target as HTMLImageElement).style.display =
								"none";
						}}
					/>
				{:else}
					<KeyRoundIcon class="size-4 text-muted-foreground" />
				{/if}
			</div>
			<h3 class="text-lg font-black tracking-tight">
				Connect {provider.name}
			</h3>
		</div>
		<p class="text-sm text-muted-foreground leading-relaxed">
			{provider.description}
		</p>
		{#if provider.docUrl}
			<a
				href={provider.docUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="text-[11px] font-bold text-primary hover:underline inline-block"
				>Provider config docs</a
			>
		{/if}
		<p
			class="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-snug mt-2"
		>
			Saving this key will override any platform default for {provider.name}. Your
			key is encrypted and isolated to your account.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	<div class="space-y-2">
		<Label
			for="provider-api-key"
			class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>{provider.name} API key</Label
		>
		<Input
			id="provider-api-key"
			type="password"
			bind:value={apiKeyInput}
			placeholder="API key"
			disabled={isSavingApiKey}
			class="h-12 bg-muted/5 border-sidebar-border/50 rounded-xl px-4 font-mono text-sm focus:border-primary/50 transition-all"
		/>
		{#if apiKeyError}
			<p class="text-[11px] font-bold text-destructive ml-1">
				{apiKeyError}
			</p>
		{/if}
	</div>

	{#if canDonate}
		<label
			class="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 cursor-pointer"
		>
			<Checkbox
				checked={donateChecked}
				onCheckedChange={(v: boolean) => onDonateChange(!!v)}
				disabled={isSavingApiKey || alwaysDonateEnabled}
			/>
			<div class="flex flex-col gap-0.5 text-xs">
				<span class="flex items-center gap-1.5 font-bold">
					<GiftIcon class="size-3.5 text-amber-500" />
					Also donate to the school pool
				</span>
				<span class="text-muted-foreground">
					Your key is encrypted and shared. Other members of the
					school can use it when they don't have their own.
					{#if alwaysDonateEnabled}<span class="text-amber-600 dark:text-amber-400"
							>(set as your default in Settings → General)</span
						>{/if}
				</span>
			</div>
		</label>
	{/if}

	<div class="flex items-center gap-2">
		<Button
			onclick={onSubmit}
			disabled={isSavingApiKey || apiKeyInput.trim().length < 10}
			class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px]"
		>
			{#if isSavingApiKey}
				<Spinner class="size-3 mr-2" />
				Connecting…
			{:else}
				Continue
			{/if}
		</Button>
		<Button
			variant="ghost"
			onclick={onCancel}
			disabled={isSavingApiKey}
			class="min-h-12 rounded-xl px-6 font-black uppercase tracking-widest text-[11px] text-muted-foreground/60"
		>
			Cancel
		</Button>
	</div>
</section>
