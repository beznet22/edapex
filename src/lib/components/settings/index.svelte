<script lang="ts">
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	import UserIcon from "@lucide/svelte/icons/user";
	import PaintbrushIcon from "@lucide/svelte/icons/paintbrush";
	import PlugIcon from "@lucide/svelte/icons/plug";
	import BoxIcon from "@lucide/svelte/icons/box";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";

	import { page } from "$app/state";
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";
	import { z } from "zod";
	import {
		getUserCredentials,
		saveUserCredential,
		deleteUserCredential,
		updateModelVisibility,
		getAvailableModels,
		getSettingsModels,
		donateUserCredential,
		revokeMyDonation,
		getMyDonations
	} from "$lib/api/agent.remote.js";
	import { AvailableModelsHolder } from "$lib/context/sync.svelte";
	import { BUILTIN_PROVIDERS } from "$lib/provider/catalog";
	import { CustomProviderEncryptedDataSchema } from "$lib/provider/spec";
	import type { ProviderInfo, ModelInfo, AugmentedModelInfo } from "$lib/provider/spec";
	import type { ProviderId } from "$lib/provider/types";

	import GeneralTab from "./GeneralTab.svelte";
	import AppearanceTab from "./AppearanceTab.svelte";
	import ProvidersTab from "./ProvidersTab.svelte";
	import ModelsTab from "./ModelsTab.svelte";
	import { PotluckAlwaysDonate } from "$lib/context/sync.svelte";
	import PlatformTab from "./PlatformTab.svelte";
	import DonateConfirmDialog from "./donate/DonateConfirmDialog.svelte";
	import { isTabVisible } from "./_helpers.svelte";

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
	type ProviderGroup = {
		id: string;
		info: ProviderInfo | undefined;
		models: AugmentedModelInfo[];
	};

	const tabs = [
		{ name: "General", icon: UserIcon },
		{ name: "Appearance", icon: PaintbrushIcon },
		{ name: "Providers", icon: PlugIcon },
		{ name: "Models", icon: BoxIcon },
		{
			name: "Platform",
			icon: Settings2Icon,
			allowedDesignations: ["admin", "it", "it_support"] as const
		}
	] as const;

	type TabName = (typeof tabs)[number]["name"];

	const userDesignation = $derived(page.data.user?.designation ?? null);

	const visibleTabs = $derived(
		tabs.filter((tab) => {
			const allowed = (tab as { allowedDesignations?: readonly string[] }).allowedDesignations;
			return isTabVisible(allowed, userDesignation);
		})
	);

	// ─── Dialog state ────────────────────────────────────────────────────────
	let open = $state(false);
	let activeTab = $state<TabName>("Providers");

	function onOpenChange(isOpen: boolean) {
		if (!isOpen && page.state.showModal) {
			history.back();
		}
	}

	$effect(() => {
		open = page.state.showModal === true;
	});

	function changeTab(name: TabName) {
		activeTab = name;
	}

	// ─── Provider state ──────────────────────────────────────────────────────
	const POPULAR_VISIBLE_COUNT = 5;

	let connectedProviders = $state<ProviderSummary[]>([]);
	let isLoadingProviders = $state(false);
	let removingProviderId = $state<string | null>(null);
	let showMoreProviders = $state(false);
	let connectingProvider = $state<ProviderInfo | null>(null);
	let isCustomFlow = $state(false);
	let apiKeyInput = $state("");
	let isSavingApiKey = $state(false);
	let apiKeyError = $state<string | null>(null);

	// ─── Donate state ────────────────────────────────────────────────────────
	// `canDonate` and `poolConfig` come from the layout server's pool metadata
	// (read once at SSR). The user checks "Also donate to school pool" in the
	// connect form; after `saveUserCredential` succeeds we either open the
	// ToS confirmation dialog (if a `tosVersion` is set) or call
	// `donateUserCredential` directly.
	const poolConfig = $derived(
		page.data.poolConfig ?? { enabled: false, donorRoles: [], tosVersion: null }
	);
	const canDonate = $derived(page.data.canDonate === true);
	// Pre-check the donate box when the user has the "always donate" cookie
	// set globally. The box is then disabled — opting in once is enough.
	// Source of truth: the `PotluckAlwaysDonate` context (set by the layout,
	// written by `AlwaysDonateToggle`). Falls back to empty when the layout
	// hasn't mounted (e.g. SSR-only render).
	const alwaysDonateHolder = $derived.by(() => {
		const ctx = PotluckAlwaysDonate.fromContext();
		return ctx?.value === "on";
	});
	let donateChecked = $state(false);
	let donateDialogOpen = $state(false);
	let pendingDonation = $state<{
		providerId: string;
		providerName: string;
		apiKey: string;
	} | null>(null);
	const alwaysDonateEnabled = $derived(alwaysDonateHolder);

	// ─── Donations list (parent-owned) ─────────────────────────────────────
	// The list is fetched on modal open + after a successful donation. The
	// `YourDonationsChips` component is purely presentational — it never
	// calls the `getMyDonations` command itself, so we never trigger
	// SvelteKit's automatic `invalidateAll` from a `$effect` (which caused
	// the infinite-loop bug).
	type MyDonation = {
		id: string;
		providerId: string;
		donatedAt: string;
		isActive: boolean;
		tosVersion: string | null;
	};
	let donations = $state<MyDonation[]>([]);
	let donationsLoading = $state(false);
	let donationsHasLoadedOnce = $state(false);
	let revokingDonationId = $state<string | null>(null);

	async function loadDonations() {
		donationsLoading = true;
		try {
			const res = await getMyDonations({});
			if (res.success) {
				donations = res.donations.filter((d) => d.isActive);
				donationsHasLoadedOnce = true;
			} else {
				toast.error(res.message ?? "Failed to load donations");
			}
		} catch (err) {
			console.error("[settings] loadDonations failed", err);
			toast.error("Failed to load donations");
		} finally {
			donationsLoading = false;
		}
	}

	async function handleRevokeDonation(donation: MyDonation) {
		if (revokingDonationId) return;
		revokingDonationId = donation.id;
		try {
			const res = await revokeMyDonation({ donationId: donation.id });
			if (res.success) {
				toast.success(
					`Revoked ${donation.providerId}`
				);
				// Optimistic update — drop the row from the visible list.
				donations = donations.filter((d) => d.id !== donation.id);
			} else {
				toast.error(res.message ?? "Revoke failed");
			}
		} catch (err) {
			console.error("[settings] revoke failed", err);
			toast.error("Revoke failed");
		} finally {
			revokingDonationId = null;
		}
	}

	const customFormSchema = CustomProviderEncryptedDataSchema.extend({
		providerId: z
			.string()
			.min(1)
			.regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphens, or underscores")
	});
	type CustomFormValues = z.infer<typeof customFormSchema>;

	let customProviderId = $state("");
	let customDisplayName = $state("");
	let customBaseUrl = $state("");
	let customApiKey = $state("");
	let customModels = $state<ModelRow[]>([]);
	let customHeaders = $state<HeaderRow[]>([]);
	let customErrors = $state<Record<string, string>>({});
	let isSubmittingCustom = $state(false);

	async function loadProviders(): Promise<void> {
		isLoadingProviders = true;
		try {
			const credsResult = await getUserCredentials({});
			if (credsResult.success) {
				connectedProviders = credsResult.providers;
			} else {
				connectedProviders = [];
				toast.error(credsResult.message ?? "Failed to load providers");
			}
		} catch (err) {
			console.error("Failed to load providers:", err);
			connectedProviders = [];
		} finally {
			isLoadingProviders = false;
		}
	}

	const connectedProviderIds = $derived(
		new Set(
			connectedProviders
				.filter((p) => p.source === "db")
				.map((p) => p.provider)
		)
	);
	const popularProviders = $derived(
		Object.values(BUILTIN_PROVIDERS).slice(0, POPULAR_VISIBLE_COUNT)
	);
	const remainingProviders = $derived(
		Object.values(BUILTIN_PROVIDERS).slice(POPULAR_VISIBLE_COUNT)
	);
	const visiblePopular = $derived(
		popularProviders.filter((p) => !connectedProviderIds.has(p.id))
	);
	const visibleRemaining = $derived(
		remainingProviders.filter((p) => !connectedProviderIds.has(p.id))
	);

	function startConnect(provider: ProviderInfo) {
		connectingProvider = provider;
		isCustomFlow = false;
		apiKeyInput = "";
		apiKeyError = null;
		// Pre-check when the user has opted in globally. The connect form
		// will render the checkbox disabled in that case.
		donateChecked = alwaysDonateHolder && canDonate;
	}

	function startCustomConnect() {
		connectingProvider = null;
		isCustomFlow = true;
		resetCustomForm();
	}

	function exitConnectForm() {
		const wasCustom = isCustomFlow;
		connectingProvider = null;
		isCustomFlow = false;
		apiKeyInput = "";
		apiKeyError = null;
		donateChecked = false;
		if (wasCustom) resetCustomForm();
	}

	function resetCustomForm() {
		customProviderId = "";
		customDisplayName = "";
		customBaseUrl = "";
		customApiKey = "";
		customModels = [];
		customHeaders = [];
		customErrors = {};
	}

	function clearCustomError(field: string) {
		delete customErrors[field];
	}

	async function submitApiKey() {
		if (!connectingProvider) return;
		const trimmed = apiKeyInput.trim();
		if (trimmed.length < 10) {
			apiKeyError = "API key must be at least 10 characters";
			return;
		}
		apiKeyError = null;
		isSavingApiKey = true;
		try {
			const result = await saveUserCredential({
				providerId: connectingProvider.id,
				credentialType: "credential",
				apiKey: trimmed
			});
			if (result.success) {
				toast.success(`${connectingProvider.name} connected`);
				const shouldDonate = donateChecked && canDonate;
				const providerId = connectingProvider.id;
				const providerName = connectingProvider.name;
				exitConnectForm();
				await loadProviders();
				await loadModels();
				// Post-save donation: if the box was checked AND a ToS version
				// is configured, open the confirmation dialog; otherwise
				// call the command directly. Failures are toasted as warnings
				// (the personal credential already succeeded).
				if (shouldDonate) {
					if (poolConfig.tosVersion) {
						pendingDonation = { providerId, providerName, apiKey: trimmed };
						donateDialogOpen = true;
					} else {
						await performDonation(providerId, trimmed);
					}
				}
			} else {
				apiKeyError = result.message ?? "Failed to save API key";
			}
		} catch (err) {
			console.error(err);
			apiKeyError = "Unexpected error";
		} finally {
			isSavingApiKey = false;
		}
	}

	async function performDonation(providerId: string, apiKey: string) {
		try {
			const res = await donateUserCredential({ providerId, apiKey });
			if (res.success) {
				toast.success(`Donated ${providerId} to the school pool`);
				// Re-fetch the donations list (called from an event-handler
				// chain, not from a $effect — safe from SvelteKit's
				// automatic invalidateAll loop).
				await loadDonations();
			} else {
				toast.warning(`Donation skipped: ${res.message ?? 'unknown reason'}`);
			}
		} catch (err) {
			console.error("[donate] failed", err);
			toast.warning("Donation skipped — your key is still connected.");
		}
	}

	async function onDonateConfirmed() {
		if (!pendingDonation) return { success: false };
		const { providerId, apiKey } = pendingDonation;
		await performDonation(providerId, apiKey);
		pendingDonation = null;
		return { success: true };
	}

	function onDonateDialogClose() {
		pendingDonation = null;
	}

	async function submitCustomProvider() {
		customErrors = {};
		const baseUrl =
			customBaseUrl.trim().length > 0 ? customBaseUrl.trim() : "https://example.com/v1";
		const cleanedModels = customModels
			.map((m) => ({ id: m.id.trim(), displayName: m.displayName.trim() }))
			.filter((m) => m.id.length > 0 && m.displayName.length > 0);
		const cleanedHeaders = customHeaders
			.map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
			.filter((h) => h.name.length > 0 && h.value.length > 0);

		const parsed = customFormSchema.safeParse({
			providerId: customProviderId.trim(),
			displayName: customDisplayName.trim() || customProviderId.trim(),
			baseUrl,
			apiKey: customApiKey.trim() || undefined,
			models: cleanedModels,
			headers: cleanedHeaders
		});
		if (!parsed.success) {
			const fieldErrors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = issue.path[0];
				if (typeof key === "string" && !(key in fieldErrors)) {
					fieldErrors[key] = issue.message;
				}
			}
			customErrors = fieldErrors;
			return;
		}

		isSubmittingCustom = true;
		try {
			const result = await saveUserCredential({
				providerId: parsed.data.providerId,
				credentialType: "custom",
				displayName: parsed.data.displayName,
				baseUrl: parsed.data.baseUrl,
				apiKey: parsed.data.apiKey,
				models: parsed.data.models,
				headers: parsed.data.headers
			});
			if (result.success) {
				toast.success(`${parsed.data.displayName} added`);
				exitConnectForm();
				await loadProviders();
				await loadModels();
			} else {
				toast.error(result.message ?? "Failed to save custom provider");
			}
		} catch (err) {
			console.error(err);
			toast.error("Unexpected error");
		} finally {
			isSubmittingCustom = false;
		}
	}

	async function disconnectProvider(cred: ProviderSummary) {
		if (cred.source === "platform") {
			toast.info(
				"Platform default cannot be disconnected — connect your own key to override."
			);
			return;
		}
		removingProviderId = cred.provider;
		try {
			const result = await deleteUserCredential({ providerId: cred.provider });
			if (result.success) {
				toast.success(`${cred.provider} disconnected`);
				await loadProviders();
				await loadModels();
			} else {
				toast.error(result.message ?? "Failed to disconnect");
			}
		} catch (err) {
			console.error(err);
			toast.error("Unexpected error");
		} finally {
			removingProviderId = null;
		}
	}

	// ─── Models state ────────────────────────────────────────────────────────
	const availableModelsHolder = AvailableModelsHolder.fromContext();
	const availableModels = $derived(availableModelsHolder.models);
	/**
	 * `settingsModels` is the broader set used by the Models tab — every
	 * discovered model + every catalog-known model for a credentialed
	 * provider, regardless of enabled/disabled state. The chat
	 * model-selector uses `availableModels` (the filtered subset).
	 */
	let settingsModels = $state<AugmentedModelInfo[]>([]);
	/**
	 * `enabledModelIds` — non-catalog models the user has explicitly
	 * enabled. Catalog models are auto-enabled (the denylist is
	 * `hiddenIds` instead).
	 */
	const enabledModelIds = $derived(availableModelsHolder.enabledIds);
	/**
	 * Returns true if the model is currently selected for the chat
	 * model-selector.
	 *   - catalog-known: enabled unless hidden
	 *   - non-catalog:   enabled only if explicitly in `enabledModelIds`
	 */
	function isModelEnabled(model: AugmentedModelInfo): boolean {
		if (model.isCatalogKnown) {
			return !availableModelsHolder.hiddenIds.has(model.id);
		}
		return enabledModelIds.has(model.id);
	}
	/**
	 * Set of model ids currently enabled for the model-selector. Used by
	 * ModelsTab to render toggle state.
	 */
	const visibleModelIds = $derived.by(() => {
		const ids = new Set<string>();
		for (const m of settingsModels) {
			if (isModelEnabled(m)) ids.add(m.id);
		}
		return [...ids];
	});

	let isLoadingModels = $state(false);
	let modelSearch = $state("");
	let togglingModelId = $state<string | null>(null);

	async function loadModels(): Promise<void> {
		isLoadingModels = true;
		try {
			const [modelsResult, settingsResult] = await Promise.all([
				getAvailableModels({}),
				getSettingsModels({})
			]);
			if (modelsResult.success) {
				availableModelsHolder.replace(
					modelsResult.models,
					modelsResult.hiddenModelIds ?? [],
					modelsResult.enabledModelIds ?? []
				);
			} else {
				toast.error(modelsResult.message ?? "Failed to load models");
			}
			if (settingsResult.success) {
				settingsModels = settingsResult.models;
			}
		} catch (err) {
			console.error("Failed to load models:", err);
		} finally {
			isLoadingModels = false;
		}
	}

	const modelsByProvider = $derived.by(() => {
		const grouped: Record<string, AugmentedModelInfo[]> = {};
		for (const model of settingsModels) {
			if ((model as ModelInfo & { source?: string }).source === "platform") continue;
			(grouped[model.providerId] ??= []).push(model);
		}
		return grouped;
	});
	const platformModels = $derived.by(() =>
		settingsModels.filter((m) => (m as ModelInfo & { source?: string }).source === "platform")
	);
	const visiblePlatformModels = $derived.by(() => {
		const search = modelSearch.trim().toLowerCase();
		if (search.length === 0) return platformModels;
		return platformModels.filter(
			(m) =>
				m.name.toLowerCase().includes(search) || m.providerId.toLowerCase().includes(search)
		);
	});
	const visibleProviderGroups = $derived.by<ProviderGroup[]>(() => {
		const search = modelSearch.trim().toLowerCase();
		return Object.entries(modelsByProvider)
			.map(([id, models]) => {
				const info = BUILTIN_PROVIDERS[id as ProviderId];
				const providerLabel = (info?.name ?? id).toLowerCase();
				const filteredModels =
					search.length === 0
						? models
						: models.filter(
								(m) =>
									m.name.toLowerCase().includes(search) ||
									providerLabel.includes(search)
							);
				return { id, info, models: filteredModels };
			})
			.filter((g) => g.models.length > 0);
	});
	/**
	 * Models that are NOT in the catalog (raw discoveries from upstream).
	 * Rendered in the Models tab as a "Discovered" group so the user can
	 * opt-in. Catalog-known models are auto-shown in their provider group.
	 */
	const discoveredOnlyModels = $derived.by(() =>
		settingsModels.filter((m) => m.isCatalogKnown === false)
	);
	const visibleDiscoveredModels = $derived.by(() => {
		const search = modelSearch.trim().toLowerCase();
		if (search.length === 0) return discoveredOnlyModels;
		return discoveredOnlyModels.filter(
			(m) =>
				m.name.toLowerCase().includes(search) ||
				m.providerId.toLowerCase().includes(search) ||
				(m.description ?? "").toLowerCase().includes(search)
		);
	});

	async function toggleModelVisibility(model: AugmentedModelInfo, nextVisible: boolean) {
		togglingModelId = model.id;
		const previousHidden = availableModelsHolder.hiddenIds;
		const previousEnabled = availableModelsHolder.enabledIds;
		const isCatalog = model.isCatalogKnown === true;

		// Catalog-known: denylist via hiddenIds.
		// Non-catalog: allowlist via enabledIds.
		const nextHidden = isCatalog
			? nextVisible
				? new Set([...previousHidden].filter((id) => id !== model.id))
				: new Set([...previousHidden, model.id])
			: previousHidden;
		const nextEnabled = isCatalog
			? previousEnabled
			: nextVisible
				? new Set([...previousEnabled, model.id])
				: new Set([...previousEnabled].filter((id) => id !== model.id));

		availableModelsHolder.replace(
			availableModelsHolder.models,
			[...nextHidden],
			[...nextEnabled]
		);
		try {
			const result = await updateModelVisibility({ modelId: model.id, visible: nextVisible });
			if (!result.success) {
				availableModelsHolder.replace(
					availableModelsHolder.models,
					[...previousHidden],
					[...previousEnabled]
				);
				toast.error(result.message ?? "Failed to update visibility");
			} else {
				// Server has the source of truth — reload to reconcile.
				await loadModels();
			}
		} catch (err) {
			console.error(err);
			availableModelsHolder.replace(
				availableModelsHolder.models,
				[...previousHidden],
				[...previousEnabled]
			);
			toast.error("Unexpected error");
		} finally {
			togglingModelId = null;
		}
	}

	// ─── Initial load ────────────────────────────────────────────────────────
	$effect(() => {
		if (open) {
			untrack(() => {
				if (activeTab === "Providers") void loadProviders();
				if (activeTab === "Models") void loadModels();
				void loadDonations();
			});
		}
	});
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="overflow-hidden p-0 fixed inset-0 w-full h-full max-w-none rounded-none translate-x-0 translate-y-0 md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-auto md:h-auto md:max-h-[85vh] md:max-w-[1000px] md:rounded-2xl border-sidebar-border bg-background"
		trapFocus={false}
	>
		<Dialog.Title class="sr-only">Settings</Dialog.Title>
		<Dialog.Description class="sr-only"
			>Configure your EdApex workspace preferences.</Dialog.Description
		>

		<Sidebar.Provider class="h-full items-start bg-transparent">
			<Sidebar.Root
				collapsible="none"
				class="hidden md:flex bg-sidebar w-64 border-r border-sidebar-border/10"
			>
				<Sidebar.Content class="p-2 pt-4">
					<Sidebar.Group>
						<Sidebar.GroupLabel
							class="text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-3 pb-2 font-black"
							>Workspace Settings</Sidebar.GroupLabel
						>
						<Sidebar.GroupContent>
							<Sidebar.Menu class="gap-1">
								{#each visibleTabs as tab (tab.name)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton
											isActive={activeTab === tab.name}
											onclick={() => changeTab(tab.name)}
											class="rounded-xl px-3 h-10 transition-all hover:bg-sidebar-accent/50 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
										>
											<tab.icon class="size-4" />
											<span class="font-bold text-[13px] tracking-tight">{tab.name}</span>
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>

				<Sidebar.Footer class="p-4 border-t border-sidebar-border/10">
					<div class="flex items-center gap-3 px-2 py-1">
						<div
							class="size-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"
						></div>
						<span
							class="text-[10px] font-black uppercase tracking-widest text-sidebar-foreground/40"
							>System Healthy</span
						>
					</div>
				</Sidebar.Footer>
			</Sidebar.Root>

			<main class="flex h-full md:h-[80vh] flex-1 flex-col overflow-hidden bg-background">
				<header
					class="flex shrink-0 flex-col border-b border-sidebar-border/10 bg-background/50 backdrop-blur-xl"
				>
					<div class="flex md:hidden overflow-x-auto scrollbar-hide gap-1 px-3 py-2">
						{#each visibleTabs as tab (tab.name)}
							<button
								onclick={() => changeTab(tab.name)}
								class="flex items-center gap-1.5 min-h-12 px-4 py-2 rounded-xl text-xs font-bold tracking-tight whitespace-nowrap shrink-0 transition-all {activeTab ===
								tab.name
									? 'bg-primary/10 text-primary'
									: 'text-muted-foreground hover:bg-muted/10'}"
							>
								<tab.icon class="size-4" />
								{tab.name}
							</button>
						{/each}
					</div>
					<div class="hidden md:flex h-16 items-center justify-between px-6">
						<Breadcrumb.Root>
							<Breadcrumb.List>
								<Breadcrumb.Item class="hidden md:block">
									<Breadcrumb.Link
										href="##"
										class="text-xs font-bold uppercase tracking-widest text-muted-foreground/40"
										>Settings</Breadcrumb.Link
									>
								</Breadcrumb.Item>
								<Breadcrumb.Separator class="hidden md:block opacity-20" />
								<Breadcrumb.Item>
									<Breadcrumb.Page
										class="text-xs font-black uppercase tracking-widest text-primary"
										>{activeTab}</Breadcrumb.Page
									>
								</Breadcrumb.Item>
							</Breadcrumb.List>
						</Breadcrumb.Root>
					</div>
				</header>

				<ScrollArea class="h-full" scrollbarYClasses="w-1 px-0.5">
					<div class="p-6 md:p-8 max-w-3xl mx-auto space-y-8">
						{#if activeTab === "General"}
							<GeneralTab designation={userDesignation} />
						{:else if activeTab === "Appearance"}
							<AppearanceTab />
						{:else if activeTab === "Providers"}
							<ProvidersTab
								{connectedProviders}
								{isLoadingProviders}
								{removingProviderId}
								{showMoreProviders}
								{connectingProvider}
								{isCustomFlow}
								bind:apiKeyInput
								{isSavingApiKey}
								{apiKeyError}
								bind:customProviderId
								bind:customDisplayName
								bind:customBaseUrl
								bind:customApiKey
								bind:customModels
								bind:customHeaders
								{customErrors}
								{isSubmittingCustom}
								{visiblePopular}
								{visibleRemaining}
								{canDonate}
								bind:donateChecked
								alwaysDonateEnabled={alwaysDonateEnabled}
								{donations}
								donationsLoading={donationsLoading}
								donationsHasLoadedOnce={donationsHasLoadedOnce}
								revokingDonationId={revokingDonationId}
								onRevokeDonation={handleRevokeDonation}
								onStartConnect={startConnect}
								onStartCustomConnect={startCustomConnect}
								onCancelConnect={exitConnectForm}
								onDisconnect={disconnectProvider}
								onSubmitApiKey={submitApiKey}
								onSubmitCustom={submitCustomProvider}
								onToggleShowMore={() => (showMoreProviders = !showMoreProviders)}
								onClearError={clearCustomError}
							/>
							{#if pendingDonation}
								<DonateConfirmDialog
									bind:open={donateDialogOpen}
									providerId={pendingDonation.providerId}
									providerName={pendingDonation.providerName}
									tosVersion={poolConfig.tosVersion}
									donorRoles={poolConfig.donorRoles}
									userRole={userDesignation}
									onConfirm={onDonateConfirmed}
									onClose={onDonateDialogClose}
								/>
							{/if}
						{:else if activeTab === "Models"}
							<ModelsTab
								bind:modelSearch
								{isLoadingModels}
								{visibleProviderGroups}
								{visiblePlatformModels}
								{visibleDiscoveredModels}
								{visibleModelIds}
								{togglingModelId}
								onToggleVisibility={toggleModelVisibility}
								onAddProvider={() => changeTab("Providers")}
							/>
						{:else if activeTab === "Platform"}
							<PlatformTab />
						{/if}
					</div>
				</ScrollArea>
			</main>
		</Sidebar.Provider>
	</Dialog.Content>
</Dialog.Root>
