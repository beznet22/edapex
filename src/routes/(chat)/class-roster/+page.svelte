<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Textarea } from "$lib/components/ui/textarea";
	import { toast } from "svelte-sonner";
	import { cn } from "$lib/utils";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import Loader from "@lucide/svelte/icons/loader";
	import Users from "@lucide/svelte/icons/users";
	import GraduationCap from "@lucide/svelte/icons/graduation-cap";
	import Send from "@lucide/svelte/icons/send";
	import type { PageData } from "./$types";
	import type { RosterStudent } from "./+page.server";

	let { data }: { data: PageData } = $props();

	let serverStudents = $derived(data.students as RosterStudent[]);
	let classInfo = $derived(data.classInfo);
	let classScopeKey = $derived(classInfo ? `${classInfo.classId}-${classInfo.sectionId}` : null);

	let templateText = $state("");
	let importing = $state(false);
	let toggling = $state<Set<number>>(new Set());
	let popId = $state<number | null>(null);

	let optimisticIds = $state<Set<number>>(new Set());
	let optimisticMap = $state<Map<number, RosterStudent>>(new Map());
	let localOverrides = $state<Map<number, Partial<RosterStudent>>>(new Map());
	let nextOptId = $state(-1);

	$effect(() => {
		classScopeKey;
		optimisticIds = new Set();
		optimisticMap = new Map();
		localOverrides = new Map();
		nextOptId = -1;
	});

	function applyOverrides(s: RosterStudent): RosterStudent {
		const o = localOverrides.get(s.id);
		return o ? { ...s, ...o } : s;
	}

	let students = $derived.by((): RosterStudent[] => {
		const merged: RosterStudent[] = [];
		for (const s of optimisticMap.values()) {
			merged.push(applyOverrides(s));
		}
		for (const s of serverStudents) {
			if (!optimisticIds.has(s.id)) {
				merged.push(applyOverrides(s));
			}
		}
		return merged;
	});

	let activeStudents = $derived(students.filter((s) => s.active));

	function extractName(template: string): string {
		const m = template.match(/[Nn]ame\s*:?\s*(.+)/);
		if (m) return m[1].trim();
		const lines = template.split("\n").map((l) => l.trim()).filter(Boolean);
		return lines[0] || "New Student";
	}

	async function toggleStudent(student: RosterStudent) {
		if (toggling.has(student.id)) return;
		toggling.add(student.id);

		const newActive = !student.active;
		localOverrides = new Map(localOverrides).set(student.id, { active: newActive });

		const formData = new FormData();
		formData.set("studentId", String(student.id));
		formData.set("active", String(newActive));

		try {
			const res = await fetch("/api/class-roster/toggle-status", { method: "POST", body: formData });
			const result = await res.json();
			if (result?.success) {
				popId = student.id;
				setTimeout(() => (popId = null), 300);
				toast.success(`${result.fullName} ${result.active ? "enabled" : "disabled"}`);
			} else {
				localOverrides = new Map(localOverrides);
				localOverrides.delete(student.id);
				toast.error(result?.error ?? "Failed to update student status");
			}
		} catch {
			localOverrides = new Map(localOverrides);
			localOverrides.delete(student.id);
			toast.error("Network error");
		} finally {
			toggling.delete(student.id);
		}
	}

	async function handleBulkImport() {
		if (!templateText.trim()) {
			toast.error("Paste student registration template text first");
			return;
		}
		if (!classInfo) {
			toast.error("No class selected");
			return;
		}

		const rawTemplate = templateText.trim();
		importing = true;

		const optId = nextOptId--;
		const optStudent: RosterStudent = {
			id: optId,
			name: extractName(rawTemplate),
			admissionNo: null,
			active: true,
		};
		optimisticIds.add(optId);
		optimisticMap = new Map(optimisticMap).set(optId, optStudent);

		try {
			const res = await fetch("/api/demo/admit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					template: rawTemplate,
					classId: classInfo.classId,
					sectionId: classInfo.sectionId,
				}),
			});
			const result = await res.json();

			if (result.status === "SUCCESS") {
				const real: RosterStudent = {
					id: result.studentId,
					name: optStudent.name,
					admissionNo: result.admissionNumber,
					active: true,
				};
				optimisticIds.delete(optId);
				const next = new Map(optimisticMap);
				next.delete(optId);
				next.set(result.studentId, real);
				optimisticMap = next;
				templateText = "";
				toast.success(result.message ?? "Student registered successfully");
			} else {
				optimisticIds.delete(optId);
				const next = new Map(optimisticMap);
				next.delete(optId);
				optimisticMap = next;
				const msg = result.message ?? "Registration failed";
				if (msg.includes("WORKSPACE_MISMATCH")) {
					toast.error("Student's class does not match your selected class");
				} else {
					toast.error(msg);
				}
			}
		} catch {
			optimisticIds.delete(optId);
			const next = new Map(optimisticMap);
			next.delete(optId);
			optimisticMap = next;
			toast.error("Network error during registration");
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>Class Roster — EdApex</title>
</svelte:head>

<div class="flex-1 flex min-h-0 w-full h-full overflow-hidden">

	{#if !classInfo}
		<div class="flex-1 flex items-center justify-center px-4">
			<div class="flex flex-col items-center text-center">
				<div class="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-5">
					<GraduationCap class="size-7 text-muted-foreground/60" />
				</div>
				<p class="text-xs font-black uppercase tracking-widest text-muted-foreground">
					No class selected
				</p>
				<p class="mt-2 text-sm text-muted-foreground/60 max-w-xs">
					Select a class from the sidebar to view its student roster.
				</p>
			</div>
		</div>

	{:else}

		<div class="flex-1 flex flex-col min-h-0">

			<!-- Header pinned top -->
			<header class="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left px-4 pt-8 sm:pt-12 pb-6">
				<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
					<h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
						Class Roster
					</h1>
					<span class="inline-flex items-center self-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
						<span class="size-1.5 rounded-full bg-primary"></span>
						{classInfo.className} [{classInfo.sectionName}]
					</span>
				</div>
				<div class="flex items-center justify-center sm:justify-end gap-1.5 text-xs text-muted-foreground">
					<Users class="size-3.5" />
					<span class="tabular-nums">{students.length}</span>
					<span>student{students.length !== 1 ? "s" : ""}</span>
					<span class="text-muted-foreground/40 mx-1">·</span>
					<span class="tabular-nums text-primary/80">{activeStudents.length}</span>
					<span class="text-primary/60">active</span>
				</div>
			</header>

			<!-- Scrollable content area -->
			<div class="flex-1 min-h-0 overflow-y-auto">
				<div class="w-full max-w-5xl mx-auto px-4 pb-12 space-y-8">

					{#if students.length === 0}
						<div class="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
							<Users class="size-8 text-muted-foreground/30 mb-3" />
							<p class="text-xs font-black uppercase tracking-widest text-muted-foreground">
								No students in this class
							</p>
						</div>
					{:else}
						<div class="flex flex-wrap justify-center gap-2.5 sm:gap-3">
							{#each students as student (student.id)}
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												class={cn(
													"transition-spring-chip inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
													student.active
														? "bg-primary/10 border-primary/25 text-primary hover:bg-primary/15 hover:border-primary/40 hover:shadow-[0_0_12px_oklch(0.65_0.15_40/0.12)] active:scale-[0.97]"
														: "bg-muted/20 border-border/50 text-muted-foreground/70 hover:bg-muted/30 hover:border-muted-foreground/30 hover:text-muted-foreground active:scale-[0.97]",
													toggling.has(student.id) && "pointer-events-none opacity-50",
													popId === student.id && "pop-once",
												)}
												onclick={() => toggleStudent(student)}
											>
												<span
													class={cn(
														"size-2 rounded-full shrink-0 transition-all duration-200",
														student.active
															? "bg-primary shadow-[0_0_6px_oklch(0.65_0.15_40/0.4)]"
															: "bg-muted-foreground/40",
													)}
												></span>
												<span class="truncate max-w-[160px] sm:max-w-[220px]">{student.name}</span>
												<span class="tabular-nums text-[0.8125rem] opacity-50">· {student.admissionNo ?? "—"}</span>
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content side="top" class="text-xs">
										{student.name} · {student.admissionNo ?? "—"}
									</Tooltip.Content>
								</Tooltip.Root>
							{/each}
						</div>
					{/if}

					<!-- Bulk Registration -->
					<Card class="border-border/60 shadow-sm">
						<CardHeader class="pb-4">
							<CardTitle class="flex items-center gap-2 text-sm font-semibold text-foreground/90">
								<span class="size-1.5 rounded-full bg-primary"></span>
								Bulk Registration
							</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<Textarea
								bind:value={templateText}
								placeholder="Paste student registration template here..."
								class="min-h-[130px] text-sm leading-relaxed placeholder:text-muted-foreground/40 resize-y"
							/>
							<div class="flex justify-center sm:justify-end">
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<Button
												{...props}
												onclick={handleBulkImport}
												disabled={importing}
												size="icon"
												class={cn(
													"size-10 rounded-full transition-all duration-200",
													importing && "opacity-80",
												)}
											>
												{#if importing}
													<Loader class="size-4 animate-spin" />
												{:else}
													<Send class="size-4" />
												{/if}
											</Button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content side="top" class="text-xs">
										Register Students
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
						</CardContent>
					</Card>

				</div>
			</div>

		</div>

	{/if}

</div>
