<script lang="ts">
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";

	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";

	interface AcademicYearRow {
		id: number;
		year: string;
		title: string;
		startingDate: string;
		endingDate: string;
		activeStatus: number;
	}

	interface ExamTypeRow {
		id: number;
		academicId: number;
		title: string;
		isAverage: number;
		percentage: number | null;
		averageMark: number;
		activeStatus: number;
	}

	interface CalendarSnapshot {
		years: AcademicYearRow[];
		activeYear: AcademicYearRow | null;
		examTypes: ExamTypeRow[];
	}

	interface YearFormDraft {
		year: string;
		title: string;
		startingDate: string;
		endingDate: string;
	}

	interface ExamFormDraft {
		title: string;
		isAverage: 0 | 1;
		percentage: number;
		averageMark: number;
	}

	let snapshot = $state<CalendarSnapshot>({
		years: [],
		activeYear: null,
		examTypes: []
	});

	let loading = $state<boolean>(true);
	let creatingYear = $state<boolean>(false);
	let creatingExam = $state<boolean>(false);
	let togglingYearId = $state<number | null>(null);
	let togglingExamId = $state<number | null>(null);

	let yearDraft = $state<YearFormDraft>(emptyYearDraft());
	let examDraft = $state<ExamFormDraft>(emptyExamDraft());
	let isAverageChecked = $state<boolean>(false);
	$effect(() => {
		examDraft.isAverage = isAverageChecked ? 1 : 0;
	});

	function emptyYearDraft(): YearFormDraft {
		return { year: "", title: "", startingDate: "", endingDate: "" };
	}

	function emptyExamDraft(): ExamFormDraft {
		return { title: "", isAverage: 0, percentage: 0, averageMark: 0 };
	}

	function pickString(record: Record<string, unknown>, key: string): string {
		const value = record[key];
		return typeof value === "string" ? value : "";
	}

	function pickNumber(record: Record<string, unknown>, key: string): number | null {
		const value = record[key];
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}

	function parseYears(value: unknown): AcademicYearRow[] {
		if (!Array.isArray(value)) return [];
		const out: AcademicYearRow[] = [];
		for (const row of value) {
			if (typeof row !== "object" || row === null) continue;
			const r = row as Record<string, unknown>;
			const id = pickNumber(r, "id");
			if (id === null) continue;
			out.push({
				id,
				year: pickString(r, "year"),
				title: pickString(r, "title"),
				startingDate: pickString(r, "startingDate"),
				endingDate: pickString(r, "endingDate"),
				activeStatus: pickNumber(r, "activeStatus") ?? 0
			});
		}
		return out;
	}

	function parseExamTypes(value: unknown): ExamTypeRow[] {
		if (!Array.isArray(value)) return [];
		const out: ExamTypeRow[] = [];
		for (const row of value) {
			if (typeof row !== "object" || row === null) continue;
			const r = row as Record<string, unknown>;
			const id = pickNumber(r, "id");
			const academicId = pickNumber(r, "academicId");
			if (id === null || academicId === null) continue;
			out.push({
				id,
				academicId,
				title: pickString(r, "title"),
				isAverage: pickNumber(r, "isAverage") ?? 0,
				percentage: pickNumber(r, "percentage"),
				averageMark: pickNumber(r, "averageMark") ?? 0,
				activeStatus: pickNumber(r, "activeStatus") ?? 0
			});
		}
		return out;
	}

	function snapshotFromResponse(payload: unknown): CalendarSnapshot {
		if (typeof payload !== "object" || payload === null) {
			return { years: [], activeYear: null, examTypes: [] };
		}
		const record = payload as Record<string, unknown>;
		const years = parseYears(record.years);
		const activeRaw = record.activeYear;
		let activeYear: AcademicYearRow | null = null;
		if (typeof activeRaw === "object" && activeRaw !== null) {
			const a = activeRaw as Record<string, unknown>;
			const id = pickNumber(a, "id");
			if (id !== null) {
				activeYear = {
					id,
					year: pickString(a, "year"),
					title: pickString(a, "title"),
					startingDate: pickString(a, "startingDate"),
					endingDate: pickString(a, "endingDate"),
					activeStatus: pickNumber(a, "activeStatus") ?? 1
				};
			}
		}
		return { years, activeYear, examTypes: parseExamTypes(record.examTypes) };
	}

	async function loadInitial(): Promise<void> {
		loading = true;
		try {
			const response = await fetch("/api/settings/academic-calendar", {
				credentials: "include"
			});
			if (!response.ok) {
				throw new Error(`GET /api/settings/academic-calendar failed: ${response.status}`);
			}
			const payload: unknown = await response.json();
			snapshot = snapshotFromResponse(payload);
		} catch (err) {
			console.error("[AcademicCalendarSection] load failed", err);
			toast.error("Could not load academic calendar. Try refreshing.");
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadInitial();
	});

	async function postAction(action: unknown): Promise<unknown> {
		const response = await fetch("/api/settings/academic-calendar", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(action)
		});
		if (!response.ok) {
			const message = await response.text().catch(() => "");
			throw new Error(
				`Calendar mutation failed (${response.status}): ${message || "unknown error"}`
			);
		}
		return response.json();
	}

	function refreshAfter(payload: unknown, fallbackExamAcademicId: number | null): void {
		const next = snapshotFromResponse(payload);
		// Preserve any activeYear/academicId from prior snapshot when the
		// server response omits them (the calendar endpoint only refreshes
		// the entity it mutated).
		if (next.years.length === 0 && snapshot.years.length > 0) {
			next.years = snapshot.years;
		}
		if (next.activeYear === null && snapshot.activeYear !== null) {
			next.activeYear = snapshot.activeYear;
		}
		if (next.examTypes.length === 0 && snapshot.examTypes.length > 0) {
			next.examTypes = snapshot.examTypes;
		} else if (fallbackExamAcademicId !== null) {
			// Re-fetch the active year's exams if the response doesn't carry
			// the latest list (toggle-exam returns the post-toggle list,
			// so this only matters for create-year, where we don't want to
			// stomp on existing exams).
		}
		snapshot = next;
	}

	async function handleCreateYear(event: Event): Promise<void> {
		event.preventDefault();
		if (creatingYear) return;
		const draft = { ...yearDraft };
		if (
			draft.year.length === 0 ||
			draft.title.length === 0 ||
			draft.startingDate.length === 0 ||
			draft.endingDate.length === 0
		) {
			toast.error("Fill all four fields to create an academic year.");
			return;
		}
		if (draft.startingDate > draft.endingDate) {
			toast.error("Start date must be on or before end date.");
			return;
		}
		creatingYear = true;
		try {
			const payload = await postAction({
				kind: "create-year",
				payload: draft
			});
			refreshAfter(payload, null);
			yearDraft = emptyYearDraft();
			toast.success(`Academic year "${draft.title}" created.`);
		} catch (err) {
			console.error("[AcademicCalendarSection] create year failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not create academic year: ${message}`);
		} finally {
			creatingYear = false;
		}
	}

	async function handleSetActiveYear(yearId: number): Promise<void> {
		if (togglingYearId !== null) return;
		togglingYearId = yearId;
		try {
			const payload = await postAction({
				kind: "set-active-year",
				payload: { yearId }
			});
			refreshAfter(payload, null);
			toast.success("Active academic year updated.");
		} catch (err) {
			console.error("[AcademicCalendarSection] set active year failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not set active year: ${message}`);
		} finally {
			togglingYearId = null;
		}
	}

	async function handleCreateExam(event: Event): Promise<void> {
		event.preventDefault();
		if (creatingExam) return;
		if (!snapshot.activeYear) {
			toast.error("Set an active academic year before creating exam types.");
			return;
		}
		const draft: ExamFormDraft = {
			title: examDraft.title.trim(),
			isAverage: examDraft.isAverage,
			percentage: Number.isFinite(examDraft.percentage) ? examDraft.percentage : 0,
			averageMark: Number.isFinite(examDraft.averageMark) ? examDraft.averageMark : 0
		};
		if (draft.title.length === 0) {
			toast.error("Exam title is required.");
			return;
		}
		creatingExam = true;
		try {
			const payload = await postAction({
				kind: "create-exam",
				payload: {
					academicId: snapshot.activeYear.id,
					title: draft.title,
					isAverage: draft.isAverage,
					percentage: draft.percentage,
					averageMark: draft.averageMark
				}
			});
			refreshAfter(payload, snapshot.activeYear.id);
			examDraft = emptyExamDraft();
			toast.success(`Exam type "${draft.title}" created.`);
		} catch (err) {
			console.error("[AcademicCalendarSection] create exam failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not create exam type: ${message}`);
		} finally {
			creatingExam = false;
		}
	}

	async function handleToggleExam(examId: number): Promise<void> {
		if (togglingExamId !== null || !snapshot.activeYear) return;
		togglingExamId = examId;
		try {
			const payload = await postAction({
				kind: "toggle-exam",
				payload: { examId, academicId: snapshot.activeYear.id }
			});
			refreshAfter(payload, snapshot.activeYear.id);
		} catch (err) {
			console.error("[AcademicCalendarSection] toggle exam failed", err);
			const message = err instanceof Error ? err.message : "Unknown error";
			toast.error(`Could not toggle exam: ${message}`);
		} finally {
			togglingExamId = null;
		}
	}

	function formatYearLabel(year: AcademicYearRow): string {
		return `${year.year} · ${new Date(year.startingDate).getFullYear()}-${new Date(year.endingDate).getFullYear()}`;
	}
</script>

<div class="space-y-6" data-testid="academic-calendar-section">
	<section class="space-y-3">
		<div class="flex items-center gap-2">
			<CalendarClockIcon class="text-muted-foreground h-4 w-4" />
			<h3 class="text-sm font-semibold tracking-wide uppercase">Academic Years</h3>
		</div>

		{#if loading}
			<p class="text-muted-foreground text-xs">Loading academic years…</p>
		{:else if snapshot.years.length === 0}
			<p class="text-muted-foreground text-xs">
				No academic years yet. Create one below.
			</p>
		{:else}
			<ul class="space-y-1.5">
				{#each snapshot.years as year (year.id)}
					<li
						class="bg-muted/20 border-border/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
						data-testid="academic-year-row"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold">{year.title}</p>
							<p class="text-muted-foreground text-[11px]">
								{formatYearLabel(year)} · {year.startingDate} → {year.endingDate}
							</p>
						</div>
						{#if year.activeStatus === 1}
							<span
								class="text-success flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase"
							>
								<CheckCircle2Icon class="h-3.5 w-3.5" />
								Active
							</span>
						{:else}
							<Button
								size="sm"
								variant="outline"
								disabled={togglingYearId !== null}
								onclick={() => handleSetActiveYear(year.id)}
							>
								{togglingYearId === year.id ? "Activating…" : "Set active"}
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<form onsubmit={handleCreateYear} class="grid gap-2 md:grid-cols-4 md:gap-3">
			<div class="grid gap-1.5">
				<Label for="year-code" class="text-xs font-semibold tracking-wide uppercase">
					Year code
				</Label>
				<Input
					id="year-code"
					type="text"
					bind:value={yearDraft.year}
					disabled={loading || creatingYear}
					placeholder="2025-2026"
					autocomplete="off"
				/>
			</div>
			<div class="grid gap-1.5 md:col-span-1">
				<Label for="year-title" class="text-xs font-semibold tracking-wide uppercase">
					Title
				</Label>
				<Input
					id="year-title"
					type="text"
					bind:value={yearDraft.title}
					disabled={loading || creatingYear}
					placeholder="2025/2026 Session"
					autocomplete="off"
				/>
			</div>
			<div class="grid gap-1.5">
				<Label for="year-start" class="text-xs font-semibold tracking-wide uppercase">
					Start
				</Label>
				<Input
					id="year-start"
					type="date"
					bind:value={yearDraft.startingDate}
					disabled={loading || creatingYear}
				/>
			</div>
			<div class="grid gap-1.5">
				<Label for="year-end" class="text-xs font-semibold tracking-wide uppercase">
					End
				</Label>
				<Input
					id="year-end"
					type="date"
					bind:value={yearDraft.endingDate}
					disabled={loading || creatingYear}
				/>
			</div>
			<div class="md:col-span-4">
				<Button
					size="sm"
					type="submit"
					disabled={loading || creatingYear}
				>
					<PlusIcon class="mr-1.5 h-3.5 w-3.5" />
					{creatingYear ? "Creating…" : "Create academic year"}
				</Button>
			</div>
		</form>
	</section>

	<Separator />

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<CalendarClockIcon class="text-muted-foreground h-4 w-4" />
				<h3 class="text-sm font-semibold tracking-wide uppercase">Exam Types</h3>
			</div>
			{#if snapshot.activeYear}
				<span class="text-muted-foreground text-[11px]">
					For {snapshot.activeYear.title}
				</span>
			{/if}
		</div>

		{#if !snapshot.activeYear}
			<p class="text-muted-foreground text-xs">
				Set an active academic year above to manage its exam types.
			</p>
		{:else if snapshot.examTypes.length === 0}
			<p class="text-muted-foreground text-xs">
				No exam types yet for this year.
			</p>
		{:else}
			<ul class="space-y-1.5">
				{#each snapshot.examTypes as exam (exam.id)}
					<li
						class="bg-muted/20 border-border/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
						data-testid="exam-type-row"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold">{exam.title}</p>
							<p class="text-muted-foreground text-[11px]">
								Avg: {exam.averageMark} · Weight: {exam.percentage ?? "—"}% ·
								{exam.isAverage === 1 ? "Used in cumulative" : "Standalone term"}
							</p>
						</div>
						<Button
							size="sm"
							variant={exam.activeStatus === 1 ? "outline" : "ghost"}
							disabled={togglingExamId !== null}
							onclick={() => handleToggleExam(exam.id)}
						>
							{#if togglingExamId === exam.id}
								Updating…
							{:else if exam.activeStatus === 1}
								<CheckCircle2Icon class="mr-1.5 h-3.5 w-3.5" />
								Disable
							{:else}
								<CircleIcon class="mr-1.5 h-3.5 w-3.5" />
								Enable
							{/if}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if snapshot.activeYear}
			<form onsubmit={handleCreateExam} class="grid gap-2 md:grid-cols-4 md:gap-3">
				<div class="grid gap-1.5 md:col-span-2">
					<Label for="exam-title" class="text-xs font-semibold tracking-wide uppercase">
						Title
					</Label>
					<Input
						id="exam-title"
						type="text"
						bind:value={examDraft.title}
						disabled={loading || creatingExam}
						placeholder="Mid-Term Test"
						autocomplete="off"
					/>
				</div>
				<div class="grid gap-1.5">
					<Label for="exam-weight" class="text-xs font-semibold tracking-wide uppercase">
						Weight %
					</Label>
					<Input
						id="exam-weight"
						type="number"
						min="0"
						max="100"
						step="0.01"
						bind:value={examDraft.percentage}
						disabled={loading || creatingExam}
					/>
				</div>
				<div class="grid gap-1.5">
					<Label for="exam-avg" class="text-xs font-semibold tracking-wide uppercase">
						Avg mark
					</Label>
					<Input
						id="exam-avg"
						type="number"
						min="0"
						max="100"
						step="0.01"
						bind:value={examDraft.averageMark}
						disabled={loading || creatingExam}
					/>
				</div>
				<div class="flex items-center gap-2 md:col-span-4">
					<label class="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
						<input
							type="checkbox"
							bind:checked={isAverageChecked}
							disabled={loading || creatingExam}
							class="border-border/60 h-3.5 w-3.5 rounded"
						/>
						Used in cumulative
					</label>
					<Button
						size="sm"
						type="submit"
						disabled={loading || creatingExam}
					>
						<PlusIcon class="mr-1.5 h-3.5 w-3.5" />
						{creatingExam ? "Creating…" : "Create exam type"}
					</Button>
				</div>
			</form>
		{/if}
	</section>
</div>
