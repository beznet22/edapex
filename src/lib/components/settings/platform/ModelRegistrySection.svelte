<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import ShieldOffIcon from "@lucide/svelte/icons/shield-off";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
	import ServerOffIcon from "@lucide/svelte/icons/server-off";
	import ServerIcon from "@lucide/svelte/icons/server";

	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	interface CatalogEntry {
		providerId: string;
		modelId: string;
		name: string;
		tier?: string;
	}

	interface ProviderEntry {
		providerId: string;
		label: string;
	}

	interface OverrideEntry {
		providerId: string;
		modelId: string | null;
		disabledBy: number;
		reason: string | null;
		disabledAt: string;
	}

	interface RegistrySnapshot {
		providers: ProviderEntry[];
		catalog: CatalogEntry[];
		overrides: OverrideEntry[];
	}

	let snapshot = $state<RegistrySnapshot>({
		providers: [],
		catalog: [],
		overrides: []
	});

	let loading = $state<boolean>(true);
	let saving = $state<boolean>(false);
	let reasonDraft = $state<string>("");
	let reasonKey = $state<string>("");
	let pendingModelId = $state<string | null>(null);
	let pendingProviderId = $state<string | null>(null);

	function pickArray<T>(value: unknown): T[] {
		return Array.isArray(value) ? (value as T[]) : [];
	}

	function pickString(value: unknown): string {
		return typeof value === "string" ? value : "";
	}

	function pickStringOrNull(value: unknown): string | null {
		return typeof value === "string" && value.length > 0 ? value : null;
	}

	function pickNumber(value: unknown, fallback: number): number {
		return typeof value === "number" && Number.isFinite(value) ? value : fallback;
	}

	function entryKey(providerId: string, modelId: string | null): string {
		return `${providerId}::${modelId ?? "*"}`;
	}

	function isDisabled(providerId: string, modelId: string | null): boolean {
		return snapshot.overrides.some(
			(row) => row.providerId === providerId && row.modelId === modelId
		);
	}

	function reasonFor(providerId: string, modelId: string | null): string | null {
		const match = snapshot.overrides.find(
			(row) => row.providerId === providerId && row.modelId === modelId
		);
		return match?.reason ?? null;
	}

	function groupByProvider(catalog: CatalogEntry[]): Map<string, CatalogEntry[]> {
		const map = new Map<string, CatalogEntry[]>();
		for (const entry of catalog) {
			const list = map.get(entry.providerId);
			if (list) list.push(entry);
			else map.set(entry.providerId, [entry]);
		}
		return map;
	}

	async function loadSnapshot(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/model-registry", {
				method: "GET",
				headers: { Accept: "application/json" }
			});
			if (!response.ok) {
				toast.error(`Failed to load model registry (${response.status})`);
				return;
			}
			const raw = (await response.json()) as Record<string, unknown>;
			snapshot = {
				providers: pickArray<ProviderEntry>(raw["providers"]).map((row) => ({
					providerId: pickString(row["providerId"]),
					label: pickString(row["label"]) || pickString(row["providerId"])
				})),
				catalog: pickArray<CatalogEntry>(raw["catalog"]).map((row) => ({
					providerId: pickString(row["providerId"]),
					modelId: pickString(row["modelId"]),
					name: pickString(row["name"]) || pickString(row["modelId"]),
					tier: pickStringOrNull(row["tier"]) ?? undefined
				})),
				overrides: pickArray<OverrideEntry>(raw["overrides"]).map((row) => ({
					providerId: pickString(row["providerId"]),
					modelId:
						row["modelId"] === null
							? null
							: typeof row["modelId"] === "string"
								? row["modelId"]
								: null,
					disabledBy: pickNumber(row["disabledBy"], 0),
					reason: pickStringOrNull(row["reason"]),
					disabledAt: pickString(row["disabledAt"])
				}))
			};
		} catch (err) {
			toast.error(`Failed to load model registry: ${String(err)}`);
		} finally {
			loading = false;
		}
	}

	async function postToggle(
		action: "disable" | "enable",
		providerId: string,
		modelId: string | null,
		reason: string | null
	): Promise<OverrideEntry[] | null> {
		saving = true;
		try {
			const response = await fetch("/api/settings/model-registry", {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ action, providerId, modelId, reason })
			});
			if (!response.ok) {
				toast.error(`Failed to ${action} entry (${response.status})`);
				return null;
			}
			const raw = (await response.json()) as Record<string, unknown>;
			const overrides = pickArray<OverrideEntry>(raw["overrides"]).map((row) => ({
				providerId: pickString(row["providerId"]),
				modelId:
					row["modelId"] === null
						? null
						: typeof row["modelId"] === "string"
							? row["modelId"]
							: null,
				disabledBy: pickNumber(row["disabledBy"], 0),
				reason: pickStringOrNull(row["reason"]),
				disabledAt: pickString(row["disabledAt"])
			}));
			snapshot = { ...snapshot, overrides };
			return overrides;
		} catch (err) {
			toast.error(`Failed to ${action} entry: ${String(err)}`);
			return null;
		} finally {
			saving = false;
		}
	}

	async function handleToggleProvider(providerId: string): Promise<void> {
		pendingProviderId = providerId;
		const currentlyDisabled = isDisabled(providerId, null);
		const reason =
			reasonKey === entryKey(providerId, null) ? reasonDraft.trim() || null : null;
		const result = await postToggle(
			currentlyDisabled ? "enable" : "disable",
			providerId,
			null,
			reason
		);
		pendingProviderId = null;
		if (result !== null) {
			toast.success(
				currentlyDisabled
					? `Provider ${providerId} re-enabled`
					: `Provider ${providerId} disabled`
			);
			if (reasonKey === entryKey(providerId, null)) {
				reasonDraft = "";
				reasonKey = "";
			}
		}
	}

	async function handleToggleModel(providerId: string, modelId: string): Promise<void> {
		pendingModelId = modelId;
		const currentlyDisabled = isDisabled(providerId, modelId);
		const reason =
			reasonKey === entryKey(providerId, modelId) ? reasonDraft.trim() || null : null;
		const result = await postToggle(
			currentlyDisabled ? "enable" : "disable",
			providerId,
			modelId,
			reason
		);
		pendingModelId = null;
		if (result !== null) {
			toast.success(
				currentlyDisabled
					? `Model ${modelId} re-enabled`
					: `Model ${modelId} disabled`
			);
			if (reasonKey === entryKey(providerId, modelId)) {
				reasonDraft = "";
				reasonKey = "";
			}
		}
	}

	function startReasonEdit(providerId: string, modelId: string | null): void {
		const key = entryKey(providerId, modelId);
		if (reasonKey === key) {
			reasonKey = "";
			reasonDraft = "";
			return;
		}
		reasonKey = key;
		reasonDraft = reasonFor(providerId, modelId) ?? "";
	}

	const grouped = $derived(groupByProvider(snapshot.catalog));
	const providerOrder = $derived(() => {
		const known = snapshot.providers.map((p) => p.providerId);
		const seen = new Set<string>();
		const order: string[] = [];
		for (const id of known) {
			if (!seen.has(id)) {
				seen.add(id);
				order.push(id);
			}
		}
		for (const id of grouped.keys()) {
			if (!seen.has(id)) {
				seen.add(id);
				order.push(id);
			}
		}
		return order;
	});

	function labelFor(providerId: string): string {
		return snapshot.providers.find((p) => p.providerId === providerId)?.label ?? providerId;
	}

	onMount(() => {
		void loadSnapshot();
	});
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<h3 class="text-base font-semibold">Model Registry</h3>
		<p class="text-sm text-muted-foreground">
			Disable specific models or entire providers for your school. Disabled entries are hidden
			from the chat composer's model selector and excluded from <code>availableModels</code>.
		</p>
	</header>

	<Separator />

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading model registry…</p>
	{:else if snapshot.catalog.length === 0}
		<p class="text-sm text-muted-foreground">No models in the catalog.</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each providerOrder() as providerId (providerId)}
				{@const models = grouped.get(providerId) ?? []}
				{@const providerDisabled = isDisabled(providerId, null)}
				<section
					class="rounded-lg border p-3 {providerDisabled ? 'border-destructive/50 bg-destructive/5' : 'border-border'}"
				>
					<header class="flex items-center justify-between gap-3">
						<div class="flex flex-col">
							<h4 class="text-sm font-medium flex items-center gap-2">
								{#if providerDisabled}
									<ServerOffIcon class="size-4 text-destructive" />
								{:else}
									<ServerIcon class="size-4 text-muted-foreground" />
								{/if}
								{labelFor(providerId)}
							</h4>
							<p class="text-xs text-muted-foreground">
								{providerId} · {models.length} model{models.length === 1 ? "" : "s"}
							</p>
						</div>
						<div class="flex items-center gap-2">
							<Button
								size="sm"
								variant="ghost"
								disabled={saving}
								onclick={() => startReasonEdit(providerId, null)}
							>
								{reasonKey === entryKey(providerId, null) ? "Cancel" : "Add reason"}
							</Button>
							<Button
								size="sm"
								variant={providerDisabled ? "outline" : "destructive"}
								disabled={saving && pendingProviderId === providerId}
								onclick={() => void handleToggleProvider(providerId)}
							>
								{#if providerDisabled}
									<ShieldCheckIcon class="mr-1 size-3.5" />
									Enable provider
								{:else}
									<ShieldOffIcon class="mr-1 size-3.5" />
									Disable provider
								{/if}
							</Button>
						</div>
					</header>

					{#if providerDisabled}
						{@const reason = reasonFor(providerId, null)}
						{#if reason}
							<p class="mt-2 text-xs text-destructive">Reason: {reason}</p>
						{/if}
					{/if}

					{#if reasonKey === entryKey(providerId, null)}
						<div class="mt-3 flex flex-col gap-1">
							<Label for="reason-{entryKey(providerId, null)}">Reason</Label>
							<Input
								id="reason-{entryKey(providerId, null)}"
								bind:value={reasonDraft}
								placeholder="Why is this provider being disabled?"
								maxlength={500}
							/>
						</div>
					{/if}

					<ul class="mt-3 flex flex-col gap-1">
						{#each models as model (model.modelId)}
							{@const disabled = providerDisabled || isDisabled(providerId, model.modelId)}
							<li
								class="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm {disabled
									? 'border-destructive/40 bg-destructive/5'
									: 'border-border'}"
							>
								<div class="flex flex-col">
									<span class="font-medium">{model.name}</span>
									<span class="text-xs text-muted-foreground">
										{model.modelId}{model.tier ? ` · tier ${model.tier}` : ""}
									</span>
									{#if disabled && !providerDisabled}
										{@const reason = reasonFor(providerId, model.modelId)}
										{#if reason}
											<span class="mt-1 text-xs text-destructive">
												Reason: {reason}
											</span>
										{/if}
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<Button
										size="sm"
										variant="ghost"
										disabled={saving || providerDisabled}
										onclick={() => startReasonEdit(providerId, model.modelId)}
									>
										{reasonKey === entryKey(providerId, model.modelId) ? "Cancel" : "Reason"}
									</Button>
									<Button
										size="sm"
										variant={disabled ? "outline" : "secondary"}
										disabled={saving || providerDisabled}
										onclick={() => void handleToggleModel(providerId, model.modelId)}
									>
										{#if providerDisabled}
											Auto (provider off)
										{:else if disabled}
											<ShieldCheckIcon class="mr-1 size-3.5" /> Enable
										{:else}
											<ShieldOffIcon class="mr-1 size-3.5" /> Disable
										{/if}
									</Button>
								</div>
							</li>
						{/each}
					</ul>

					{#each models as model (model.modelId)}
						{#if reasonKey === entryKey(providerId, model.modelId)}
							<div class="mt-2 flex flex-col gap-1">
								<Label for="reason-{entryKey(providerId, model.modelId)}">
									Reason for {model.name}
								</Label>
								<Input
									id="reason-{entryKey(providerId, model.modelId)}"
									bind:value={reasonDraft}
									placeholder="Why is this model being disabled?"
									maxlength={500}
								/>
							</div>
						{/if}
					{/each}
				</section>
			{/each}
		</div>
	{/if}
</div>
