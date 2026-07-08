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
	import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
	import type { ProviderInfo, ModelInfo } from "$lib/provider/spec";
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
	type PlatformDefault = { providerId: string; hasEnvKey: boolean };
	type ModelRow = { id: string; displayName: string };
	type HeaderRow = { name: string; value: string };

	interface Props {
		connectedProviders: ProviderSummary[];
		isLoadingProviders: boolean;
		removingProviderId: string | null;
		showMoreProviders: boolean;
		connectingProvider: ProviderInfo | null;
		isCustomFlow: boolean;
		platformDefaults: PlatformDefault[];

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
		platformDefaults,
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
		onStartConnect,
		onStartCustomConnect,
		onCancelConnect,
		onDisconnect,
		onSubmitApiKey,
		onSubmitCustom,
		onToggleShowMore,
		onClearError
	}: Props = $props();

	function badgeForCredential(cred: ProviderSummary): {
		label: string;
		classes: string;
	} {
		if (cred.credentialType === "custom") {
			return { label: "Custom", classes: "bg-primary/20 text-primary" };
		}
		if (cred.source === "platform") {
			return {
				label: "Platform",
				classes: "bg-blue-500/20 text-blue-300 border-blue-500/30"
			};
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
		<section class="space-y-3" in:slideIn out:slideOut>
			<div class="flex items-center justify-between">
				<h3
					class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
				>
					Connected providers
				</h3>
				{#if !isLoadingProviders}
					<span class="text-[10px] font-bold text-muted-foreground/40"
						>{connectedProviders.length} active</span
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
			{:else if connectedProviders.length === 0}
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
					{#each connectedProviders as cred (cred.provider)}
						{@const badge = badgeForCredential(cred)}
						{@const info = BUILTIN_PROVIDERS[cred.provider as ProviderId]}
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
							connectDisabled={removingProviderId === cred.provider ||
								cred.source === "platform"}
						>
							{#snippet connectContent()}
								{#if removingProviderId === cred.provider}
									<Spinner class="size-3" />
								{/if}
							{/snippet}
						</ProviderCard>
					{/each}
				</div>
			{/if}
		</section>

		{#if connectedProviders.length === 0 && platformDefaults.length > 0}
			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<h3
						class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1"
					>
						Platform Defaults
					</h3>
					<span class="text-[10px] font-bold text-muted-foreground/40"
						>{platformDefaults.length} available</span
					>
				</div>
				<div class="space-y-2">
					{#each platformDefaults as pd (pd.providerId)}
						{@const info = BUILTIN_PROVIDERS[pd.providerId as ProviderId]}
						<ProviderCard
							providerId={pd.providerId}
							providerName={info?.name ?? pd.providerId}
							logoAlt={info?.name ?? pd.providerId}
							containerClass="bg-blue-500/5 border border-blue-500/20"
							badge={{ label: "Platform", classes: "bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] font-black px-1.5 py-0 rounded-md" }}
							meta="Provided by the platform — auto-disconnects when you connect your own key"
							metaClass="text-[10px] text-muted-foreground/60"
						/>
					{/each}
				</div>
			</section>
		{/if}

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
