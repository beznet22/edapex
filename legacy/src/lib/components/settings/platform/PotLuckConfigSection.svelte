<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import SaveIcon from "@lucide/svelte/icons/save";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import GiftIcon from "@lucide/svelte/icons/gift";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import UploadIcon from "@lucide/svelte/icons/upload";

	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import {
		exportPotluckDonations,
		importPotluckDonations
	} from "$lib/api/agent.remote";

	interface PotluckConfig {
		schoolId: number;
		enabled: boolean;
		donorRoles: string[];
		consumerRoles: string[];
		allowedProviders: string[];
		perUserDailyTokenCap: number;
		perUserDailyRequestCap: number;
		perProviderDailyTokenCap: number | null;
		auditRetentionDays: number;
		tosVersion: string | null;
		updatedBy: number;
		updatedAt: string;
	}

	const KNOWN_ROLES = ["admin", "it", "teacher", "student", "parent"] as const;

	let draft = $state<PotluckConfig>(emptyDraft());
	let original = $state<PotluckConfig>(emptyDraft());
	let loading = $state<boolean>(true);
	let saving = $state<boolean>(false);

	let roleDraft = $state<string>("");
	let providerDraft = $state<string>("");
	let tosDraft = $state<string>("");

	// CSV export/import UI state
	let exportOpen = $state<boolean>(false);
	let exportMode = $state<"metadata-only" | "encrypted">("metadata-only");
	let exportPassphrase = $state<string>("");
	let exportPassphraseConfirm = $state<string>("");
	let exportWorking = $state<boolean>(false);

	let importOpen = $state<boolean>(false);
	let importFileName = $state<string>("");
	let importCsvText = $state<string>("");
	let importPassphrase = $state<string>("");
	let importStrategy = $state<"skip" | "replace">("skip");
	let importWorking = $state<boolean>(false);
	let importPreviewRows = $state<
		Array<{ id: string; providerId: string; keyField: string; isActive: string }>
	>([]);

	function passphraseStrength(value: string): {
		score: 0 | 1 | 2 | 3 | 4;
		label: string;
	} {
		const v = value;
		let score = 0;
		if (v.length >= 12) score++;
		if (v.length >= 20) score++;
		if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
		if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
		const labels = ['too short', 'weak', 'fair', 'good', 'strong'] as const;
		return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
	}

	const exportStrength = $derived(passphraseStrength(exportPassphrase));
	const exportPassphraseValid = $derived(
		exportPassphrase.length >= 12 &&
			exportPassphrase === exportPassphraseConfirm
	);

	async function handleExport(): Promise<void> {
		if (exportMode === "encrypted" && !exportPassphraseValid) {
			toast.error("Passphrase must be at least 12 characters and match confirmation.");
			return;
		}
		exportWorking = true;
		try {
			const result = await exportPotluckDonations({
				mode: exportMode,
				passphrase: exportMode === "encrypted" ? exportPassphrase : undefined
			});
			if (!result.success || !result.csv) {
				toast.error(result.message ?? "Export failed.");
				return;
			}
			const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			const ts = new Date().toISOString().replace(/[:.]/g, "-");
			a.download = `potluck-donations-${ts}.csv`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			toast.success(`Exported ${result.count} donation(s).`);
			exportOpen = false;
			exportPassphrase = "";
			exportPassphraseConfirm = "";
		} catch (err) {
			console.error("[PotLuckConfigSection] export failed", err);
			toast.error("Export failed.");
		} finally {
			exportWorking = false;
		}
	}

	function parseCsvPreview(csv: string): Array<{ id: string; providerId: string; keyField: string; isActive: string }> {
		const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
		if (lines.length < 2) return [];
		const header = lines[0].split(",");
		const idIdx = header.indexOf("id");
		const providerIdx = header.indexOf("providerId");
		const keyIdx = header.indexOf("key");
		const isActiveIdx = header.indexOf("isActive");
		if (idIdx === -1 || providerIdx === -1 || keyIdx === -1 || isActiveIdx === -1) return [];
		const rows: Array<{ id: string; providerId: string; keyField: string; isActive: string }> = [];
		for (let i = 1; i < Math.min(lines.length, 11); i++) {
			const fields = lines[i].split(",");
			rows.push({
				id: fields[idIdx] ?? "",
				providerId: fields[providerIdx] ?? "",
				keyField: (fields[keyIdx] ?? "").length > 0 ? "•••encrypted•••" : "(empty)",
				isActive: fields[isActiveIdx] ?? ""
			});
		}
		return rows;
	}

	async function handleImportFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 5 * 1024 * 1024) {
			toast.error("File exceeds 5 MB cap.");
			input.value = "";
			return;
		}
		importFileName = file.name;
		const text = await file.text();
		importCsvText = text;
		importPreviewRows = parseCsvPreview(text);
	}

	async function handleImport(): Promise<void> {
		if (!importCsvText) {
			toast.error("Pick a CSV file first.");
			return;
		}
		importWorking = true;
		try {
			const result = await importPotluckDonations({
				csv: importCsvText,
				passphrase: importPassphrase.length > 0 ? importPassphrase : undefined,
				conflictStrategy: importStrategy
			});
			if (!result.success || !result.result) {
				toast.error(result.message ?? "Import failed.");
				return;
			}
			const r = result.result;
			const summary = `Imported ${r.imported}, replaced ${r.replaced}, skipped ${r.skipped}, ${r.failures.length} failure(s).`;
			toast.success(summary);
			importOpen = false;
			importCsvText = "";
			importFileName = "";
			importPassphrase = "";
			importPreviewRows = [];
		} catch (err) {
			console.error("[PotLuckConfigSection] import failed", err);
			toast.error("Import failed.");
		} finally {
			importWorking = false;
		}
	}

	const dirty = $derived.by(() => JSON.stringify(draft) !== JSON.stringify(original));

	function emptyDraft(): PotluckConfig {
		return {
			schoolId: 1,
			enabled: false,
			donorRoles: [],
			consumerRoles: [],
			allowedProviders: [],
			perUserDailyTokenCap: 0,
			perUserDailyRequestCap: 0,
			perProviderDailyTokenCap: null,
			auditRetentionDays: 90,
			tosVersion: null,
			updatedBy: 0,
			updatedAt: ""
		};
	}

	function pickBool(value: unknown): boolean {
		return value === true || value === 1 || value === "1";
	}

	function pickNumber(value: unknown): number {
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	}

	function pickNumberOrNull(value: unknown): number | null {
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}

	function pickStringArray(value: unknown): string[] {
		return Array.isArray(value)
			? value.filter((s): s is string => typeof s === "string")
			: [];
	}

	function pickStringOrNull(value: unknown): string | null {
		return typeof value === "string" && value.length > 0 ? value : null;
	}

	function snapshotFromResponse(payload: unknown): PotluckConfig {
		if (typeof payload !== "object" || payload === null) return emptyDraft();
		const config = (payload as { config?: unknown }).config;
		if (typeof config !== "object" || config === null) return emptyDraft();
		const row = config as Record<string, unknown>;
		return {
			schoolId: pickNumber(row["schoolId"]) || 1,
			enabled: pickBool(row["enabled"]),
			donorRoles: pickStringArray(row["donorRoles"]),
			consumerRoles: pickStringArray(row["consumerRoles"]),
			allowedProviders: pickStringArray(row["allowedProviders"]),
			perUserDailyTokenCap: pickNumber(row["perUserDailyTokenCap"]),
			perUserDailyRequestCap: pickNumber(row["perUserDailyRequestCap"]),
			perProviderDailyTokenCap: pickNumberOrNull(row["perProviderDailyTokenCap"]),
			auditRetentionDays: pickNumber(row["auditRetentionDays"]) || 90,
			tosVersion: pickStringOrNull(row["tosVersion"]),
			updatedBy: pickNumber(row["updatedBy"]),
			updatedAt: typeof row["updatedAt"] === "string" ? row["updatedAt"] : ""
		};
	}

	async function loadInitial(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/potluck", { credentials: "include" });
			if (!response.ok) {
				throw new Error(`GET /api/settings/potluck failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			const snap = snapshotFromResponse(payload);
			draft = snap;
			original = snap;
			tosDraft = snap.tosVersion ?? "";
		} catch (err) {
			console.error("[PotLuckConfigSection] load failed", err);
			toast.error("Could not load pot-luck configuration.");
		} finally {
			loading = false;
		}
	}

	function buildPatch(): Record<string, unknown> {
		const patch: Record<string, unknown> = {};
		if (draft.enabled !== original.enabled) patch["enabled"] = draft.enabled;
		if (JSON.stringify(draft.donorRoles) !== JSON.stringify(original.donorRoles))
			patch["donorRoles"] = draft.donorRoles;
		if (JSON.stringify(draft.consumerRoles) !== JSON.stringify(original.consumerRoles))
			patch["consumerRoles"] = draft.consumerRoles;
		if (JSON.stringify(draft.allowedProviders) !== JSON.stringify(original.allowedProviders))
			patch["allowedProviders"] = draft.allowedProviders;
		if (draft.perUserDailyTokenCap !== original.perUserDailyTokenCap)
			patch["perUserDailyTokenCap"] = draft.perUserDailyTokenCap;
		if (draft.perUserDailyRequestCap !== original.perUserDailyRequestCap)
			patch["perUserDailyRequestCap"] = draft.perUserDailyRequestCap;
		if (draft.perProviderDailyTokenCap !== original.perProviderDailyTokenCap)
			patch["perProviderDailyTokenCap"] = draft.perProviderDailyTokenCap;
		if (draft.auditRetentionDays !== original.auditRetentionDays)
			patch["auditRetentionDays"] = draft.auditRetentionDays;
		const newTos = tosDraft.trim().length === 0 ? null : tosDraft.trim();
		if (newTos !== original.tosVersion) patch["tosVersion"] = newTos;
		return patch;
	}

	async function handleSave(): Promise<void> {
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) {
			toast.info("No changes to save.");
			return;
		}
		saving = true;
		try {
			const response = await fetch("/api/settings/potluck", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch)
			});
			if (!response.ok) {
				throw new Error(`POST /api/settings/potluck failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			const snap = snapshotFromResponse(payload);
			draft = snap;
			original = snap;
			tosDraft = snap.tosVersion ?? "";
			toast.success("Pot-Luck configuration saved.");
		} catch (err) {
			console.error("[PotLuckConfigSection] save failed", err);
			toast.error("Could not save pot-luck configuration.");
		} finally {
			saving = false;
		}
	}

	function handleCancel(): void {
		draft = JSON.parse(JSON.stringify(original));
		tosDraft = original.tosVersion ?? "";
		toast.info("Reverted unsaved changes.");
	}

	function addRole(kind: "donor" | "consumer"): void {
		const value = roleDraft.trim();
		if (!value) return;
		const target = kind === "donor" ? draft.donorRoles : draft.consumerRoles;
		if (target.includes(value)) {
			roleDraft = "";
			return;
		}
		const next = [...target, value];
		if (kind === "donor") draft.donorRoles = next;
		else draft.consumerRoles = next;
		roleDraft = "";
	}

	function removeRole(kind: "donor" | "consumer", value: string): void {
		const target = kind === "donor" ? draft.donorRoles : draft.consumerRoles;
		const next = target.filter((r) => r !== value);
		if (kind === "donor") draft.donorRoles = next;
		else draft.consumerRoles = next;
	}

	function addProvider(): void {
		const value = providerDraft.trim();
		if (!value) return;
		if (draft.allowedProviders.includes(value)) {
			providerDraft = "";
			return;
		}
		draft.allowedProviders = [...draft.allowedProviders, value];
		providerDraft = "";
	}

	function removeProvider(value: string): void {
		draft.allowedProviders = draft.allowedProviders.filter((p) => p !== value);
	}

	onMount(() => {
		void loadInitial();
	});
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<h3 class="text-base font-semibold flex items-center gap-2">
			<GiftIcon class="size-4" />
			Pot-Luck Configuration
		</h3>
		<p class="text-sm text-muted-foreground">
			Configure the shared API-key pool. Donor roles can contribute their provider keys to the
			pool; consumer roles can pull from the pool when they don't have their own key.
		</p>
	</header>

	<Separator />

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading configuration…</p>
	{:else}
		<div class="flex flex-col gap-6">
			<!-- Enabled master switch -->
			<section class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
				<div class="flex flex-col">
					<Label for="enabled-toggle" class="text-sm font-medium">Pool enabled</Label>
					<p class="text-xs text-muted-foreground">
						When off, the 4-tier router skips tier 2 (pool) entirely.
					</p>
				</div>
				<button
					id="enabled-toggle"
					type="button"
					role="switch"
					aria-checked={draft.enabled}
					class="inline-flex h-6 w-11 items-center rounded-full transition {draft.enabled
						? 'bg-primary'
						: 'bg-muted'}"
					onclick={() => (draft.enabled = !draft.enabled)}
				>
					<span
						class="inline-block h-5 w-5 transform rounded-full bg-background shadow transition {draft.enabled
							? 'translate-x-5'
							: 'translate-x-0.5'}"
					/>
				</button>
			</section>

			<!-- Donor roles -->
			<section class="flex flex-col gap-2">
				<Label>Donor roles</Label>
				<p class="text-xs text-muted-foreground">
					Roles allowed to contribute provider keys to the pool.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					{#each draft.donorRoles as role (role)}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
						>
							{role}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground"
								aria-label="Remove {role}"
								onclick={() => removeRole("donor", role)}
							>
								<XIcon class="size-3" />
							</button>
						</span>
					{/each}
					<div class="flex items-center gap-1">
						<Input
							bind:value={roleDraft}
							placeholder="role (e.g. teacher)"
							class="h-7 w-40 text-xs"
							onkeydown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addRole("donor");
								}
							}}
						/>
						<Button
							size="sm"
							variant="outline"
							class="h-7"
							onclick={() => addRole("donor")}
						>
							<PlusIcon class="size-3" /> Add
						</Button>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
					<span>Suggestions:</span>
					{#each KNOWN_ROLES as role (role)}
						{#if !draft.donorRoles.includes(role)}
							<button
								type="button"
								class="rounded border border-border px-1.5 py-0.5 hover:bg-muted"
								onclick={() => {
									draft.donorRoles = [...draft.donorRoles, role];
								}}
							>
								+{role}
							</button>
						{/if}
					{/each}
				</div>
			</section>

			<!-- Consumer roles -->
			<section class="flex flex-col gap-2">
				<Label>Consumer roles</Label>
				<p class="text-xs text-muted-foreground">
					Roles allowed to draw from the pool when they have no personal key.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					{#each draft.consumerRoles as role (role)}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
						>
							{role}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground"
								aria-label="Remove {role}"
								onclick={() => removeRole("consumer", role)}
							>
								<XIcon class="size-3" />
							</button>
						</span>
					{/each}
					<div class="flex items-center gap-1">
						<Input
							bind:value={roleDraft}
							placeholder="role (e.g. student)"
							class="h-7 w-40 text-xs"
							onkeydown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addRole("consumer");
								}
							}}
						/>
						<Button
							size="sm"
							variant="outline"
							class="h-7"
							onclick={() => addRole("consumer")}
						>
							<PlusIcon class="size-3" /> Add
						</Button>
					</div>
				</div>
			</section>

			<!-- Allowed providers -->
			<section class="flex flex-col gap-2">
				<Label>Allowed providers</Label>
				<p class="text-xs text-muted-foreground">
					Providers eligible for pool donations. Empty = all enabled providers.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					{#each draft.allowedProviders as provider (provider)}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
						>
							{provider}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground"
								aria-label="Remove {provider}"
								onclick={() => removeProvider(provider)}
							>
								<XIcon class="size-3" />
							</button>
						</span>
					{/each}
					<div class="flex items-center gap-1">
						<Input
							bind:value={providerDraft}
							placeholder="provider id (e.g. groq)"
							class="h-7 w-40 text-xs"
							onkeydown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addProvider();
								}
							}}
						/>
						<Button size="sm" variant="outline" class="h-7" onclick={addProvider}>
							<PlusIcon class="size-3" /> Add
						</Button>
					</div>
				</div>
			</section>

			<!-- Caps -->
			<section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div class="flex flex-col gap-1">
					<Label for="user-token-cap">Per-user daily token cap</Label>
					<Input
						id="user-token-cap"
						type="number"
						min="0"
						bind:value={draft.perUserDailyTokenCap}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="user-request-cap">Per-user daily request cap</Label>
					<Input
						id="user-request-cap"
						type="number"
						min="0"
						bind:value={draft.perUserDailyRequestCap}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="provider-token-cap">
						Per-provider daily token cap <span class="text-muted-foreground">(optional)</span>
					</Label>
					<Input
						id="provider-token-cap"
						type="number"
						min="0"
						value={draft.perProviderDailyTokenCap ?? ''}
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLInputElement).value;
							draft.perProviderDailyTokenCap = raw === '' ? null : Number(raw);
						}}
					/>
				</div>
			</section>

			<section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<Label for="audit-retention">Audit retention (days)</Label>
					<Input
						id="audit-retention"
						type="number"
						min="1"
						max="3650"
						bind:value={draft.auditRetentionDays}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<Label for="tos-version">TOS version</Label>
					<Input id="tos-version" bind:value={tosDraft} placeholder="e.g. v1.0" />
				</div>
			</section>

			<Separator />

			<!-- CSV export / import -->
			<section class="flex flex-col gap-2">
				<h4 class="text-sm font-medium">CSV export / import</h4>
				<p class="text-xs text-muted-foreground">
					Export every donation (active + inactive, no donor PII) as CSV. Import accepts the
					same shape; encrypted exports use AES-256-GCM with PBKDF2(passphrase, schoolName).
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="outline" size="sm" onclick={() => (exportOpen = true)}>
						<DownloadIcon class="mr-1 size-3.5" /> Export donations
					</Button>
					<Button variant="outline" size="sm" onclick={() => (importOpen = true)}>
						<UploadIcon class="mr-1 size-3.5" /> Import donations
					</Button>
				</div>
			</section>

			<Separator />

			<div class="flex items-center justify-end gap-2">
				<Button
					variant="ghost"
					disabled={!dirty || saving}
					onclick={handleCancel}
				>
					<RotateCcwIcon class="mr-1 size-3.5" /> Cancel
				</Button>
				<Button disabled={!dirty || saving} onclick={handleSave}>
					<SaveIcon class="mr-1 size-3.5" />
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>

			{#if original.updatedAt}
				<p class="text-xs text-muted-foreground text-right">
					Last updated: {original.updatedAt}
				</p>
			{/if}

			<!-- Export modal -->
			<Dialog.Root bind:open={exportOpen}>
				<Dialog.Content class="max-w-md">
					<Dialog.Header>
						<Dialog.Title>Export pot-luck donations</Dialog.Title>
						<Dialog.Description>
							Downloads every donation as CSV. Encrypted mode wraps the `key` column with
							AES-256-GCM using a passphrase + this school's name.
						</Dialog.Description>
					</Dialog.Header>
					<div class="flex flex-col gap-3">
						<div class="flex flex-col gap-1">
							<Label>Mode</Label>
							<div class="flex items-center gap-2">
								<Button
									size="sm"
									variant={exportMode === 'metadata-only' ? 'default' : 'outline'}
									onclick={() => (exportMode = 'metadata-only')}
								>
									Metadata only
								</Button>
								<Button
									size="sm"
									variant={exportMode === 'encrypted' ? 'default' : 'outline'}
									onclick={() => (exportMode = 'encrypted')}
								>
									Encrypted
								</Button>
							</div>
						</div>
						{#if exportMode === 'encrypted'}
							<div class="flex flex-col gap-1">
								<Label for="export-passphrase">Passphrase (min 12 chars)</Label>
								<Input
									id="export-passphrase"
									type="password"
									bind:value={exportPassphrase}
									autocomplete="new-password"
								/>
								<div class="h-1 w-full overflow-hidden rounded bg-muted">
									<div
										class="h-full transition-all {exportStrength.score >= 3
											? 'bg-green-500'
											: exportStrength.score >= 2
												? 'bg-yellow-500'
												: 'bg-red-500'}"
										style="width: {(exportStrength.score / 4) * 100}%"
									></div>
								</div>
								<p class="text-xs text-muted-foreground">
									Strength: {exportStrength.label}
								</p>
							</div>
							<div class="flex flex-col gap-1">
								<Label for="export-passphrase-confirm">Confirm passphrase</Label>
								<Input
									id="export-passphrase-confirm"
									type="password"
									bind:value={exportPassphraseConfirm}
									autocomplete="new-password"
								/>
								{#if exportPassphraseConfirm.length > 0 && exportPassphraseConfirm !== exportPassphrase}
									<p class="text-xs text-destructive">Passphrases do not match.</p>
								{/if}
							</div>
						{/if}
					</div>
					<Dialog.Footer>
						<Button variant="ghost" onclick={() => (exportOpen = false)} disabled={exportWorking}>
							Cancel
						</Button>
						<Button
							onclick={handleExport}
							disabled={exportWorking || (exportMode === 'encrypted' && !exportPassphraseValid)}
						>
							<DownloadIcon class="mr-1 size-3.5" />
							{exportWorking ? 'Exporting…' : 'Export'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>

			<!-- Import modal -->
			<Dialog.Root bind:open={importOpen}>
				<Dialog.Content class="max-w-2xl">
					<Dialog.Header>
						<Dialog.Title>Import pot-luck donations</Dialog.Title>
						<Dialog.Description>
							Upload a previously-exported CSV. Encrypted exports require the same passphrase +
							school name used during export.
						</Dialog.Description>
					</Dialog.Header>
					<div class="flex flex-col gap-3">
						<div class="flex flex-col gap-1">
							<Label for="import-file">CSV file (max 5 MB)</Label>
							<Input
								id="import-file"
								type="file"
								accept=".csv,text/csv"
								onchange={handleImportFile}
							/>
							{#if importFileName}
								<p class="text-xs text-muted-foreground">Loaded: {importFileName}</p>
							{/if}
						</div>
						<div class="flex flex-col gap-1">
							<Label for="import-passphrase">Passphrase (only for encrypted files)</Label>
							<Input
								id="import-passphrase"
								type="password"
								bind:value={importPassphrase}
								autocomplete="off"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<Label>Conflict strategy</Label>
							<div class="flex items-center gap-2">
								<Button
									size="sm"
									variant={importStrategy === 'skip' ? 'default' : 'outline'}
									onclick={() => (importStrategy = 'skip')}
								>
									Skip existing
								</Button>
								<Button
									size="sm"
									variant={importStrategy === 'replace' ? 'default' : 'outline'}
									onclick={() => (importStrategy = 'replace')}
								>
									Replace existing
								</Button>
							</div>
						</div>
						{#if importPreviewRows.length > 0}
							<div class="flex flex-col gap-1">
								<p class="text-xs text-muted-foreground">
									Preview (first {importPreviewRows.length} row{importPreviewRows.length === 1 ? '' : 's'}):
								</p>
								<div class="max-h-40 overflow-auto rounded border text-xs">
									<table class="w-full">
										<thead class="bg-muted text-left">
											<tr>
												<th class="px-2 py-1">id</th>
												<th class="px-2 py-1">provider</th>
												<th class="px-2 py-1">key</th>
												<th class="px-2 py-1">active</th>
											</tr>
										</thead>
										<tbody>
											{#each importPreviewRows as row (row.id)}
												<tr class="border-t">
													<td class="px-2 py-1 font-mono">{row.id.substring(0, 8)}…</td>
													<td class="px-2 py-1">{row.providerId}</td>
													<td class="px-2 py-1 text-muted-foreground">{row.keyField}</td>
													<td class="px-2 py-1">{row.isActive}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</div>
					<Dialog.Footer>
						<Button variant="ghost" onclick={() => (importOpen = false)} disabled={importWorking}>
							Cancel
						</Button>
						<Button
							onclick={handleImport}
							disabled={importWorking || !importCsvText}
						>
							<UploadIcon class="mr-1 size-3.5" />
							{importWorking ? 'Importing…' : 'Import'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	{/if}
</div>
