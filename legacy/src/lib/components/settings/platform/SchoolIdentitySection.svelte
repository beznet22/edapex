<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import SaveIcon from "@lucide/svelte/icons/save";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import UploadCloudIcon from "@lucide/svelte/icons/upload-cloud";
	import ImageOffIcon from "@lucide/svelte/icons/image-off";

	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	interface IdentitySnapshot {
		schoolName: string;
		phone: string;
		email: string;
		address: string;
		logoUrl: string;
	}

	const empty: IdentitySnapshot = {
		schoolName: "",
		phone: "",
		email: "",
		address: "",
		logoUrl: ""
	};

	let draft = $state<IdentitySnapshot>({ ...empty });
	let original = $state<IdentitySnapshot>({ ...empty });
	let loading = $state<boolean>(true);
	let saving = $state<boolean>(false);
	let uploadingLogo = $state<boolean>(false);
	let logoFileInput = $state<HTMLInputElement | null>(null);

	const dirty = $derived(
		draft.schoolName !== original.schoolName ||
			draft.phone !== original.phone ||
			draft.email !== original.email ||
			draft.address !== original.address
	);

	function snapshotFromResponse(payload: unknown): IdentitySnapshot {
		if (typeof payload !== "object" || payload === null) return { ...empty };
		const settings = (payload as { settings?: unknown }).settings;
		if (typeof settings !== "object" || settings === null) return { ...empty };
		const row = settings as Record<string, unknown>;
		const pick = (key: string): string => {
			const value = row[key];
			return typeof value === "string" ? value : "";
		};
		return {
			schoolName: pick("schoolName"),
			phone: pick("phone"),
			email: pick("email"),
			address: pick("address"),
			logoUrl: pick("logo")
		};
	}

	async function loadInitial(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/general", {
				credentials: "include"
			});
			if (!response.ok) {
				throw new Error(`GET /api/settings/general failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			const snapshot = snapshotFromResponse(payload);
			draft = snapshot;
			original = snapshot;
		} catch (err) {
			console.error("[SchoolIdentitySection] load failed", err);
			toast.error("Could not load school identity. Using defaults.");
			draft = { ...empty };
			original = { ...empty };
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadInitial();
	});

	function applyOriginal(next: IdentitySnapshot): void {
		original = next;
		draft = { ...next };
	}

	async function handleSave(): Promise<void> {
		if (!dirty || saving) return;
		saving = true;
		const payload = {
			schoolName: draft.schoolName,
			phone: draft.phone,
			email: draft.email,
			address: draft.address
		};
		try {
			const response = await fetch("/api/settings/general", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			});
			if (!response.ok) {
				const message = await response.text().catch(() => "");
				throw new Error(`Save failed (${response.status}): ${message || "unknown error"}`);
			}
			const responsePayload: unknown = await response.json();
			const next = snapshotFromResponse(responsePayload);
			applyOriginal(next);
			toast.success("School identity saved.");
		} catch (err) {
			console.error("[SchoolIdentitySection] save failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not save school identity: ${message}`);
		} finally {
			saving = false;
		}
	}

	function handleCancel(): void {
		if (!dirty || saving) return;
		draft = { ...original };
		toast.info("School identity reverted.");
	}

	function handleLogoSelected(event: Event): void {
		const target = event.currentTarget as HTMLInputElement | null;
		const file = target?.files?.[0];
		if (!file) return;
		void uploadLogo(file);
		// Reset the input so picking the same file twice in a row still fires
		// the change event.
		if (target) target.value = "";
	}

	async function uploadLogo(file: File): Promise<void> {
		uploadingLogo = true;
		const formData = new FormData();
		formData.append("file", file);
		formData.append("filename", file.name);
		formData.append("kind", "logo");
		try {
			const response = await fetch("/api/uploads", {
				method: "POST",
				credentials: "include",
				body: formData
			});
			if (!response.ok) {
				const message = await response.text().catch(() => "");
				throw new Error(`Upload failed (${response.status}): ${message || "unknown error"}`);
			}
			const payload: unknown = await response.json();
			const logoUrl =
				typeof payload === "object" && payload !== null && "logoUrl" in payload
					? (payload as { logoUrl?: unknown }).logoUrl
					: null;
			if (typeof logoUrl !== "string" || logoUrl.length === 0) {
				throw new Error("Upload succeeded but no logoUrl was returned.");
			}
			applyOriginal({ ...original, logoUrl });
			toast.success("Logo uploaded.");
		} catch (err) {
			console.error("[SchoolIdentitySection] logo upload failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Logo upload failed: ${message}`);
		} finally {
			uploadingLogo = false;
		}
	}

	function triggerLogoPicker(): void {
		logoFileInput?.click();
	}
</script>

<div class="space-y-5" data-testid="school-identity-section">
	<div class="grid gap-5 md:grid-cols-[180px_1fr] md:items-start">
		<div class="space-y-2">
			<div
				class="bg-muted/30 border-border/60 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border"
				data-testid="school-identity-logo-preview"
			>
				{#if draft.logoUrl}
					<img
						src={draft.logoUrl}
						alt="School logo"
						class="h-full w-full object-contain"
					/>
				{:else}
					<ImageOffIcon class="text-muted-foreground/50 h-10 w-10" />
				{/if}
			</div>
			<input
				bind:this={logoFileInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={handleLogoSelected}
			/>
			<Button
				size="sm"
				variant="outline"
				class="w-full"
				disabled={uploadingLogo || loading}
				onclick={triggerLogoPicker}
			>
				<UploadCloudIcon class="mr-1.5 h-3.5 w-3.5" />
				{uploadingLogo ? "Uploading…" : "Upload logo"}
			</Button>
			<p class="text-muted-foreground text-[11px] leading-snug">
				Logo writes to <code class="font-mono">static/uploads/logos/{`{schoolId}`}.ext</code>
				and is shown on reports and PDFs.
			</p>
		</div>

		<div class="grid gap-4">
			<div class="grid gap-1.5">
				<Label for="school-name" class="text-xs font-semibold tracking-wide uppercase">
					School name
				</Label>
				<Input
					id="school-name"
					type="text"
					bind:value={draft.schoolName}
					disabled={loading || saving}
					placeholder="e.g. Little Lords Academy"
					autocomplete="off"
				/>
			</div>

			<div class="grid gap-1.5 md:grid-cols-2 md:gap-3">
				<div class="grid gap-1.5">
					<Label for="school-phone" class="text-xs font-semibold tracking-wide uppercase">
						Phone
					</Label>
					<Input
						id="school-phone"
						type="tel"
						bind:value={draft.phone}
						disabled={loading || saving}
						placeholder="+234 …"
						autocomplete="off"
					/>
				</div>
				<div class="grid gap-1.5">
					<Label for="school-email" class="text-xs font-semibold tracking-wide uppercase">
						Email
					</Label>
					<Input
						id="school-email"
						type="email"
						bind:value={draft.email}
						disabled={loading || saving}
						placeholder="admin@example.com"
						autocomplete="off"
					/>
				</div>
			</div>

			<div class="grid gap-1.5">
				<Label for="school-address" class="text-xs font-semibold tracking-wide uppercase">
					Address
				</Label>
				<Input
					id="school-address"
					type="text"
					bind:value={draft.address}
					disabled={loading || saving}
					placeholder="Street, City, State"
					autocomplete="off"
				/>
			</div>
		</div>
	</div>

	<Separator />

	<div class="flex items-center justify-end gap-2">
		<Button
			size="sm"
			variant="ghost"
			disabled={!dirty || saving || loading}
			onclick={handleCancel}
		>
			<RotateCcwIcon class="mr-1.5 h-3.5 w-3.5" />
			Cancel
		</Button>
		<Button size="sm" disabled={!dirty || saving || loading} onclick={handleSave}>
			<SaveIcon class="mr-1.5 h-3.5 w-3.5" />
			{saving ? "Saving…" : "Save"}
		</Button>
	</div>
</div>
