<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { slideIn, slideOut } from "./_helpers.svelte";
	import ProviderCard from "./ProviderCard.svelte";
	import ConnectApiKeyForm from "./ConnectApiKeyForm.svelte";
	import CustomProviderForm from "./CustomProviderForm.svelte";
	import YourDonationsChips from "./donate/YourDonationsChips.svelte";
	import AlwaysDonateToggle from "./donate/AlwaysDonateToggle.svelte";
	import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
	import type { ProviderInfo } from "$lib/provider/spec";
	import type { ProviderId } from "$lib/provider/types";

	type ProviderSummary = {
		provider: string;
		name: string;
		enabled: boolean;
		source: "db" | "platform";
		priority: number;
		baseUrl: string;
		credentialType: "credential" | "custom";
	};
	type ModelRow = { id: string; displayName: string };
	type HeaderRow = { name: string; value: string };

	interface Props {
		connectedProviders: ProviderSummary[];
		isLoadingProviders: boolean;
		removingProviderId: string | null;
		showMoreProviders: boolean;
		connectingProvider: ProviderInfo | null;
		isCustomFlow: boolean;

		apiKeyInput: string;
		isSavingApiKey: boolean;
		apiKeyError: string | null;

		customProviderId: string;
		customDisplayName: string;
		customBaseUrl: string;
		customApiKey: string;
		customModels: ModelRow[];
		customHeaders: HeaderRow[];
		customErrors: Record<string, string>;
		isSubmittingCustom: boolean;

		visiblePopular: ProviderInfo[];
		visibleRemaining: ProviderInfo[];

		// ─── Donate opt-in ──────────────────────────────────────────────────
		/** Pool is enabled and the user's role is in donorRoles (or the
		 *  donorRoles list is empty / permissive). */
		canDonate: boolean;
		/** Two-way bound to the parent — checked by the user (or pre-checked
		 *  when `alwaysDonateEnabled` is true). */
		donateChecked: boolean;
		/** When the user has the global "always donate" preference set, the
		 *  donate checkbox in the form is rendered pre-checked and disabled. */
		alwaysDonateEnabled: boolean;
		/** User's active donations (from the parent). */
		donations: import('./donate/YourDonationsChips.svelte').MyDonation[];
		/** While the parent is fetching donations. */
		donationsLoading: boolean;
		/** Has the parent's first fetch resolved? */
		donationsHasLoadedOnce: boolean;
		/** Donation id currently being revoked (parent tracks this). */
		revokingDonationId: string | null;
		/** Called by the chip when the user confirms revoke. */
		onRevokeDonation: (donation: import('./donate/YourDonationsChips.svelte').MyDonation) => void;

		onStartConnect: (provider: ProviderInfo) => void;
		onStartCustomConnect: () => void;
		onCancelConnect: () => void;
		onDisconnect: (cred: ProviderSummary) => void;
		onSubmitApiKey: () => void;
		onSubmitCustom: () => void;
		onToggleShowMore: () => void;
		onClearError: (field: string) => void;
	}

	let {
		connectedProviders,
		isLoadingProviders,
		removingProviderId,
		showMoreProviders,
		connectingProvider,
		isCustomFlow,
		apiKeyInput = $bindable(),
		isSavingApiKey,
		apiKeyError,
		customProviderId = $bindable(),
		customDisplayName = $bindable(),
		customBaseUrl = $bindable(),
		customApiKey = $bindable(),
		customModels = $bindable(),
		customHeaders = $bindable(),
		customErrors,
		isSubmittingCustom,
		visiblePopular,
		visibleRemaining,
		canDonate,
		donateChecked = $bindable(),
		alwaysDonateEnabled,
		donations,
		donationsLoading,
		donationsHasLoadedOnce,
		revokingDonationId,
		onRevokeDonation,
		onStartConnect,
		onStartCustomConnect,
		onCancelConnect,
		onDisconnect,
		onSubmitApiKey,
		onSubmitCustom,
		onToggleShowMore,
		onClearError
	}: Props = $props();

	let userConnectedProviders = $derived(
		connectedProviders.filter((c) => c.source !== "platform")
	);

	function badgeForCredential(cred: ProviderSummary): {
		label: string;
		classes: string;
	} {
		if (cred.credentialType === "custom") {
			return { label: "Custom", classes: "bg-primary/20 text-primary" };
		}
		return { label: "API key", classes: "bg-primary/20 text-primary" };
	}
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-12">
	<div class="space-y-2">
		<h2 class="text-2xl font-black tracking-tight text-foreground">Providers</h2>
		<p class="text-sm text-muted-foreground">
			Connect your AI provider credentials. Your keys are encrypted and isolated to your
			workspace.
		</p>
	</div>

	<Separator class="bg-sidebar-border/10" />

	{#if !isCustomFlow && !connectingProvider}
		{@const providerNameMap = Object.fromEntries(
			Object.entries(BUILTIN_PROVIDERS).map(([id, info]) => [id, info.name])
		)}
		<div class="space-y-3">
			<AlwaysDonateToggle {canDonate} />
			<YourDonationsChips
				providerNames={providerNameMap}
				{donations}
				loading={donationsLoading}
				hasLoadedOnce={donationsHasLoadedOnce}
				revokingId={revokingDonationId}
				onRevoke={onRevokeDonation}
			/>
		</div>

		<section class="space-y-3" in:slideIn out:slideOut>
			<div class="flex items-center justify-between">
				<h3
					class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
				>
					Connected providers
				</h3>
				{#if !isLoadingProviders}
					<span class="text-[10px] font-bold text-muted-foreground/40"
						>{userConnectedProviders.length} active</span
					>
				{/if}
			</div>

			{#if isLoadingProviders}
				<div class="space-y-2">
					{#each [0, 1] as skeletonIdx (skeletonIdx)}
						<div
							class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30"
						>
							<Skeleton class="size-10 rounded-xl" />
							<div class="flex-1 space-y-2">
								<Skeleton class="h-3 w-1/3" />
								<Skeleton class="h-2 w-1/2" />
							</div>
							<Skeleton class="h-8 w-20" />
						</div>
					{/each}
				</div>
			{:else if userConnectedProviders.length === 0}
				<div
					class="p-6 rounded-2xl border border-dashed border-sidebar-border/40 text-center"
				>
					<p class="text-sm font-bold text-muted-foreground">No providers connected yet</p>
					<p class="text-[11px] text-muted-foreground/60 mt-1">
						Pick one from the list below to get started.
					</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each userConnectedProviders as cred (cred.provider)}
						{@const badge = badgeForCredential(cred)}
						{@const info = BUILTIN_PROVIDERS[cred.provider as ProviderId]}
						{@const isPlatform = cred.source === 'platform'}
						<ProviderCard
							providerId={cred.provider}
							providerName={info?.name ?? cred.provider}
							logoAlt={info?.name ?? cred.provider}
							badge={badge}
							meta={cred.name || "—"}
							metaClass="text-[10px] font-mono text-muted-foreground/60 truncate"
							onConnect={() => onDisconnect(cred)}
							connectLabel="Disconnect"
							connectVariant="ghost"
							connectDisabled={removingProviderId === cred.provider}
						>
							{#snippet status()}
								<p
									class="text-[10px] font-black uppercase tracking-widest leading-snug {isPlatform
										? 'text-blue-700 dark:text-blue-300'
										: 'text-emerald-700 dark:text-emerald-300'}"
								>
									{isPlatform
										? 'Platform default (no key)'
										: 'Your key — overrides platform'}
								</p>
							{/snippet}
							{#snippet connectContent()}
								{#if removingProviderId === cred.provider}
									<Spinner class="size-3" />
								{/if}
								Disconnect
							{/snippet}
						</ProviderCard>
					{/each}
				</div>
			{/if}
		</section>

		<section class="space-y-3" in:slideIn out:slideOut>
			<h3
				class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
			>
				Popular providers
			</h3>

			<div class="space-y-2">
				{#each visiblePopular as provider (provider.id)}
					<ProviderCard
						providerId={provider.id}
						providerName={provider.name}
						description={provider.description}
						onConnect={() => onStartConnect(provider)}
					/>
				{/each}

				{#if showMoreProviders}
					{#each visibleRemaining as provider (provider.id)}
						<ProviderCard
							providerId={provider.id}
							providerName={provider.name}
							description={provider.description}
							onConnect={() => onStartConnect(provider)}
						/>
					{/each}
				{/if}

				<div
					class="flex items-center gap-3 p-4 rounded-2xl bg-muted/5 border border-sidebar-border/30 hover:bg-muted/10 transition-all"
				>
					<div
						class="size-10 rounded-xl bg-background border border-sidebar-border/50 flex items-center justify-center shrink-0"
					>
						<SparklesIcon class="size-4 text-primary" />
					</div>
					<div class="flex-1 min-w-0 space-y-0.5">
						<div class="flex items-center gap-2">
							<span class="text-sm font-black tracking-tight">Custom provider</span>
							<Badge
								class="bg-primary/20 text-primary border-none text-[9px] font-black px-1.5 py-0 rounded-md"
								>Custom</Badge
							>
						</div>
						<p
							class="text-[10px] text-muted-foreground/70 leading-snug line-clamp-1"
						>
							Configure an OpenAI-compatible provider.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={onStartCustomConnect}
						class="min-h-12 rounded-xl text-[11px] font-black uppercase tracking-widest border-sidebar-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
					>
						<PlusIcon class="size-3" />
						Connect
					</Button>
				</div>

				{#if visibleRemaining.length > 0}
					<button
						onclick={onToggleShowMore}
						class="text-[11px] font-black uppercase tracking-widest text-primary hover:underline self-start ml-2"
					>
						{showMoreProviders ? "Show less" : "Show more providers"}
					</button>
				{/if}
			</div>
		</section>
	{:else if connectingProvider}
		<ConnectApiKeyForm
			provider={connectingProvider}
			bind:apiKeyInput
			{isSavingApiKey}
			{apiKeyError}
			{canDonate}
			bind:donateChecked
			{alwaysDonateEnabled}
			onSubmit={onSubmitApiKey}
			onCancel={onCancelConnect}
		/>
	{:else}
		<CustomProviderForm
			bind:customProviderId
			bind:customDisplayName
			bind:customBaseUrl
			bind:customApiKey
			bind:customModels
			bind:customHeaders
			{customErrors}
			{isSubmittingCustom}
			onSubmit={onSubmitCustom}
			onCancel={onCancelConnect}
			{onClearError}
		/>
	{/if}
</div>
