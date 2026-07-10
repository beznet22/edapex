<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import SaveIcon from "@lucide/svelte/icons/save";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import FileTextIcon from "@lucide/svelte/icons/file-text";

	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	interface ReportSnapshot {
		termlyReportTitle: string;
		annualReportTitle: string;
		principalName: string;
		supportEmail: string;
		resultEmailSubject: string;
	}

	const empty: ReportSnapshot = {
		termlyReportTitle: "",
		annualReportTitle: "",
		principalName: "",
		supportEmail: "",
		resultEmailSubject: ""
	};

	const fieldOrder: ReadonlyArray<keyof ReportSnapshot> = [
		"termlyReportTitle",
		"annualReportTitle",
		"principalName",
		"supportEmail",
		"resultEmailSubject"
	] as const;

	const fieldLabels: Record<keyof ReportSnapshot, string> = {
		termlyReportTitle: "Termly report title",
		annualReportTitle: "Annual report title",
		principalName: "Principal signature name",
		supportEmail: "Support email",
		resultEmailSubject: "Result email subject"
	};

	const fieldDescriptions: Record<keyof ReportSnapshot, string> = {
		termlyReportTitle: "Header on termly progress PDFs.",
		annualReportTitle: "Header on annual progress PDFs.",
		principalName: "Name shown under the principal signature.",
		supportEmail: "Reply-to address on result emails.",
		resultEmailSubject: "Subject line for parent-facing result notifications."
	};

	let draft = $state<ReportSnapshot>({ ...empty });
	let original = $state<ReportSnapshot>({ ...empty });
	let loading = $state<boolean>(true);
	let saving = $state<boolean>(false);

	const dirty = $derived(
		fieldOrder.some((key) => draft[key] !== original[key])
	);

	function snapshotFromResponse(payload: unknown): ReportSnapshot {
		if (typeof payload !== "object" || payload === null) return { ...empty };
		const settings = (payload as { settings?: unknown }).settings;
		if (typeof settings !== "object" || settings === null) return { ...empty };
		const row = settings as Record<string, unknown>;
		const next: ReportSnapshot = { ...empty };
		for (const key of fieldOrder) {
			const value = row[key];
			if (typeof value === "string") next[key] = value;
		}
		return next;
	}

	async function loadInitial(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/report-templates", {
				credentials: "include"
			});
			if (!response.ok) {
				throw new Error(`GET /api/settings/report-templates failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			const snapshot = snapshotFromResponse(payload);
			draft = snapshot;
			original = snapshot;
		} catch (err) {
			console.error("[ReportTemplatesSection] load failed", err);
			toast.error("Could not load report templates. Using defaults.");
			draft = { ...empty };
			original = { ...empty };
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadInitial();
	});

	function applyOriginal(next: ReportSnapshot): void {
		original = next;
		draft = { ...next };
	}

	function buildPatch(): Partial<ReportSnapshot> {
		const patch: Partial<ReportSnapshot> = {};
		for (const key of fieldOrder) {
			if (draft[key] !== original[key]) {
				patch[key] = draft[key];
			}
		}
		return patch;
	}

	async function handleSave(): Promise<void> {
		if (!dirty || saving) return;
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) return;

		saving = true;
		try {
			const response = await fetch("/api/settings/report-templates", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(patch)
			});
			if (!response.ok) {
				const message = await response.text().catch(() => "");
				throw new Error(`Save failed (${response.status}): ${message || "unknown error"}`);
			}
			const responsePayload: unknown = await response.json();
			const next = snapshotFromResponse(responsePayload);
			applyOriginal(next);
			toast.success("Report templates saved.");
		} catch (err) {
			console.error("[ReportTemplatesSection] save failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not save report templates: ${message}`);
		} finally {
			saving = false;
		}
	}

	function handleCancel(): void {
		if (!dirty || saving) return;
		draft = { ...original };
		toast.info("Report templates reverted.");
	}
</script>

<div class="space-y-5" data-testid="report-templates-section">
	<div class="bg-primary/5 border-primary/20 flex items-start gap-3 rounded-xl border p-3">
		<div class="bg-primary/10 border-primary/20 rounded-lg border p-2">
			<FileTextIcon class="text-primary h-4 w-4" />
		</div>
		<div class="space-y-0.5">
			<p class="text-sm font-semibold">Report header copy</p>
			<p class="text-muted-foreground text-xs leading-relaxed">
				Changes apply to the next PDF and email generated. Assessment publishers read these
				values instead of the historical hardcoded constants.
			</p>
		</div>
	</div>

	<div class="grid gap-4">
		{#each fieldOrder as key (key)}
			<div class="grid gap-1.5">
				<Label for={`report-${key}`} class="text-xs font-semibold tracking-wide uppercase">
					{fieldLabels[key]}
				</Label>
				<Input
					id={`report-${key}`}
					type={key === "supportEmail" ? "email" : "text"}
					bind:value={draft[key]}
					disabled={loading || saving}
					placeholder={empty[key]}
					autocomplete="off"
					data-field={key}
				/>
				<p class="text-muted-foreground text-[11px] leading-snug">
					{fieldDescriptions[key]}
				</p>
			</div>
		{/each}
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
