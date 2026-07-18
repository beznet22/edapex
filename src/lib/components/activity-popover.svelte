<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { backgroundTasks } from "$lib/state/background-tasks.svelte";
	import type { Task, UploadFileState } from "$lib/types/background-tasks";
	import ActivityIcon from "@lucide/svelte/icons/activity";
	import ScanSearchIcon from "@lucide/svelte/icons/scan-search";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import XIcon from "@lucide/svelte/icons/x";
	import XCircleIcon from "@lucide/svelte/icons/x-circle";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import CheckCircle2Icon from "@lucide/svelte/icons/check-circle-2";
	import Loader2Icon from "@lucide/svelte/icons/loader-2";
	import UploadIcon from "@lucide/svelte/icons/upload";
	import FileImageIcon from "@lucide/svelte/icons/file-image";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import { fly } from "svelte/transition";
	import { flip } from "svelte/animate";
	import { backOut } from "svelte/easing";
	import { formatBytes } from "$lib/compression.utils";

	let tasks = $state(backgroundTasks.tasks);
	let activeCount = $state(
		tasks.filter((t) => t.status === "running" || t.status === "queued").length,
	);
	let completedCount = $state(
		tasks.filter((t) => t.status === "completed").length,
	);
	let failedCount = $state(
		tasks.filter((t) => t.status === "failed" || t.status === "cancelled").length,
	);
	let completedExtractions = $state(
		tasks.reduce((sum, t) => {
			if (t.result) return sum + t.result.succeeded;
			if (t.spec.kind === "process-files" && t.files) return sum + t.files.filter(f => f.status === "completed").length;
			return sum;
		}, 0),
	);
	let visibleTasks: Task[] = $state([]);

	function syncFromStore(): void {
		const t = backgroundTasks.tasks;
		tasks = t;
		activeCount = t.filter((x) => x.status === "running" || x.status === "queued").length;
		completedCount = t.filter((x) => x.status === "completed").length;
		failedCount = t.filter((x) => x.status === "failed" || x.status === "cancelled").length;
		completedExtractions = t.reduce((sum, x) => {
			if (x.result) return sum + x.result.succeeded;
			if (x.spec.kind === "process-files" && x.files) return sum + x.files.filter(f => f.status === "completed").length;
			return sum;
		}, 0);
		const running = t.filter((x) => x.status === "running" || x.status === "queued");
		const done = t.filter((x) => x.status !== "running" && x.status !== "queued");
		const windowSize = Math.max(4, running.length + 2);
		const recentDone = done.slice(0, Math.max(0, windowSize - running.length));
		visibleTasks = [...running, ...recentDone];
	}

	syncFromStore();

	$effect(() => {
		const t = backgroundTasks.tasks;
		if (t !== tasks) {
			syncFromStore();
		}
	});

	const hasActivity = $derived(activeCount > 0);
	const isPulsing = $derived(hasActivity);
	const hasCompletedAny = $derived(completedCount + failedCount > 0);

	let isOpen = $state(false);
	let wasActive = $state(false);

	const footerSummary = $derived.by(() => {
		const parts: string[] = [];
		if (activeCount > 0) parts.push(`${activeCount} active`);
		if (completedCount > 0) parts.push(`${completedCount} done`);
		if (failedCount > 0) parts.push(`${failedCount} failed`);
		return parts.length > 0 ? parts.join(" · ") : "No activity";
	});

	$effect(() => {
		if (activeCount > 0 && !wasActive) {
			isOpen = true;
			wasActive = true;
		}
		if (activeCount === 0 && wasActive) {
			wasActive = false;
		}
	});

	// ── helpers ───────────────────────────────────────────────────────────────

	function titleFor(task: Task): string {
		switch (task.spec.kind) {
			case "process-files": {
				const n = task.spec.files.length;
				const phase = task.phase;
				if (phase === "ocr") return `Extracting — ${n} file${n === 1 ? "" : "s"}`;
				return `Upload — ${n} file${n === 1 ? "" : "s"}`;
			}
			case "ocr-batch": {
				const n = task.spec.keys.length;
				return `OCR Batch — ${n} file${n === 1 ? "" : "s"}`;
			}
			case "ocr-single": {
				const name = task.spec.key.split("/").pop() ?? task.spec.key;
				return `OCR — ${name}`;
			}
			case "ocr-direct": {
				const name = task.spec.key.split("/").pop() ?? task.spec.key;
				return `OCR — ${name}`;
			}
		}
	}

	function statusLabel(task: Task): string {
		if (task.status === "completed") return "Completed";
		if (task.status === "failed") return "Failed";
		if (task.status === "cancelled") return "Cancelled";
		if (task.status === "queued") return "Queued";
		return "Running";
	}

	function barClass(task: Task): string {
		if (task.status === "failed") return "bg-gradient-to-r from-rose-500 to-rose-400 shadow-sm shadow-rose-500/20";
		if (task.status === "cancelled") return "bg-gradient-to-r from-muted-foreground/60 to-muted-foreground/40";
		if (task.status === "completed") return "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-sm shadow-emerald-500/20";
		return "bg-gradient-to-r from-primary to-primary/60 shadow-sm shadow-primary/10";
	}

	function statusTextClass(task: Task): string {
		if (task.status === "failed") return "text-rose-500";
		if (task.status === "cancelled") return "text-muted-foreground";
		if (task.status === "completed") return "text-emerald-500";
		return "text-muted-foreground";
	}

	function barWidth(task: Task): number {
		if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") return 100;
		return Math.round(task.progress * 100);
	}

	function formatRelativeAge(ts: number | undefined): string {
		if (!ts) return "";
		const diffMs = Date.now() - ts;
		const diffSec = Math.floor(diffMs / 1000);
		if (diffSec < 60) return "just now";
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		return `${diffDay}d ago`;
	}

	function fileStatusIcon(s: UploadFileState) {
		if (s.status === "compressing") return Loader2Icon;
		if (s.status === "uploading") return UploadIcon;
		if (s.status === "ocr") return Loader2Icon;
		if (s.status === "completed") return CheckCircle2Icon;
		return XCircleIcon;
	}

	function fileStatusClass(s: UploadFileState): string {
		if (s.status === "compressing") return "text-amber-400 compress-shimmer bg-amber-400/10";
		if (s.status === "uploading") return "text-primary bg-primary/10";
		if (s.status === "ocr") return "text-amber-400 bg-amber-400/10";
		if (s.status === "completed") return "text-emerald-400 bg-emerald-400/10";
		return "text-destructive bg-destructive/10";
	}

	function fileIcon(name: string) {
		const ext = name.split(".").pop()?.toLowerCase();
		if (ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return FileImageIcon;
		if (ext === "pdf") return FileTextIcon;
		return FileQuestionIcon;
	}

	function reductionPct(orig: number | undefined, comp: number | undefined): number | null {
		if (!orig || !comp || comp >= orig) return null;
		return Math.round((1 - comp / orig) * 100);
	}

	function showCancelButton(task: Task): boolean {
		return task.status === "running" || task.status === "queued";
	}

	function btnClass(extra = ""): string {
		return `h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-150
			text-muted-foreground hover:text-foreground
			hover:bg-foreground/8 active:scale-90 ${extra}`;
	}
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				aria-label="Background activity"
				class="relative size-9 shrink-0 rounded-lg transition-all duration-200
					text-muted-foreground hover:text-foreground hover:bg-muted/40
					active:scale-95 flex items-center justify-center"
			>
				{#if hasActivity}
					<span class="absolute inset-0 rounded-lg activity-ring pointer-events-none" aria-hidden="true"></span>
				{/if}
				<ActivityIcon class="size-4 {isPulsing ? 'text-primary animate-pulse' : ''}" />
				{#if completedExtractions > 0}
					<span
						class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full
							bg-emerald-500 text-[9px] font-black text-white
							flex items-center justify-center shadow-sm shadow-emerald-500/40"
						aria-label="{completedExtractions} extracted"
					>
						{completedExtractions}
					</span>
				{/if}
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content
		align="end"
		side="bottom"
		sideOffset={8}
		class="w-80 p-0 bg-popover/98 backdrop-blur-md border border-border/40 rounded-2xl shadow-2xl overflow-hidden transition-spring"
	>
		<header class="flex items-center justify-between px-4 py-3 border-b border-border/20">
			<div class="flex items-center gap-2">
				<div class="size-6 rounded-lg bg-primary/10 grid place-items-center">
					<ScanSearchIcon class="size-3 text-primary" />
				</div>
				<h3 class="text-[11px] font-black tracking-widest uppercase text-foreground/80">
					Activity
				</h3>
			</div>
			{#if hasCompletedAny}
				<button
					type="button"
					class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground
						hover:text-foreground transition-all duration-150 active:scale-95"
					onclick={() => backgroundTasks.clearCompleted()}
				>
					Clear
				</button>
			{/if}
		</header>

		<div class="max-h-96 overflow-y-auto scrollbar-hide">
			{#if tasks.length === 0}
				<div
					class="flex flex-col items-center justify-center py-12 px-6 text-center
						ring-1 ring-inset ring-border/10 mx-3 my-6 rounded-2xl"
				>
					<div class="size-10 rounded-2xl bg-muted/50 grid place-items-center mb-3">
						<InboxIcon class="size-5 text-muted-foreground/40" />
					</div>
					<p class="text-[11px] font-bold tracking-wider uppercase text-muted-foreground/60">
						No activity
					</p>
					<p class="text-[10px] text-muted-foreground/40 mt-1.5 max-w-[200px] leading-relaxed">
						Tasks run in a web worker and won't block the UI.
					</p>
				</div>
			{:else}
				<ul class="flex flex-col divide-y divide-border/15">
					{#each visibleTasks as task (task.id)}
						<li
							class="px-4 py-3 group transition-all duration-200
								hover:bg-primary/[0.02] active:scale-[0.99]"
							data-status={task.status}
							in:fly={{ y: -6, duration: 200, easing: backOut }}
							out:fly={{ y: -4, duration: 150, easing: backOut }}
						>
							<div class="flex items-start justify-between gap-2 mb-1.5">
								<div class="flex items-center gap-1.5 min-w-0">
									<ScanSearchIcon
										class="size-3 shrink-0 {task.status === 'failed'
											? 'text-rose-500'
											: task.status === 'cancelled'
												? 'text-muted-foreground'
												: task.status === 'completed'
													? 'text-emerald-500'
													: 'text-primary'}"
									/>
									<span class="text-[12px] font-semibold text-foreground truncate">
										{titleFor(task)}
									</span>
								</div>
								<div class="flex items-center gap-0.5 shrink-0">
									{#if showCancelButton(task)}
										<button
											type="button"
											class={btnClass("hover:text-rose-500")}
											onclick={() => backgroundTasks.cancelTask(task.id)}
											aria-label="Cancel task"
											title="Cancel"
										>
											<XCircleIcon class="size-3.5" />
										</button>
									{/if}
									{#if task.status === "failed" && task.result}
										<button
											type="button"
											class={btnClass()}
											onclick={() => backgroundTasks.retryTask(task.id)}
											aria-label="Retry failed"
											title="Retry failed"
										>
											<RotateCcwIcon class="size-3" />
										</button>
									{/if}
									<button
										type="button"
										class={btnClass()}
										onclick={() => backgroundTasks.dismissTask(task.id)}
										aria-label="Dismiss"
										title="Dismiss"
									>
										<XIcon class="size-3" />
									</button>
								</div>
							</div>

							<div class="flex items-center gap-2 mb-1.5">
								<div class="flex-1 h-1 rounded-full bg-foreground/5 overflow-hidden">
									<div
										class="h-full transition-all duration-500 ease-out rounded-full {barClass(task)}"
										style="width: {barWidth(task)}%"
									></div>
								</div>
								<span
									class="text-[9px] font-black uppercase tracking-wider tabular-nums {statusTextClass(task)}"
								>
									{statusLabel(task)}
									{#if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") && formatRelativeAge(task.completedAt)}
										<span class="font-normal opacity-60 ml-0.5">
											{formatRelativeAge(task.completedAt)}
										</span>
									{/if}
								</span>
							</div>

							<p class="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-2">
								{task.message}
							</p>

							{#if task.status === "failed" && task.result}
								<p class="text-[9px] font-bold text-rose-400/80 mt-1.5 uppercase tracking-wider">
									{task.result.succeeded} of {task.result.results.length} completed
								</p>
							{/if}
							{#if task.status === "cancelled" && task.result}
								<p class="text-[9px] font-bold text-muted-foreground/70 mt-1.5 uppercase tracking-wider">
									{task.result.succeeded} of {task.result.results.length} completed
								</p>
							{/if}

							{#if task.spec.kind === "process-files" && task.files && task.files.length > 0}
								<div class="mt-2.5 pt-2.5 border-t border-border/20">
									<ul class="space-y-1">
										{#each task.files as fileState (fileState.key || fileState.name)}
											{@const Icon = fileIcon(fileState.name)}
											{@const StatusIcon = fileStatusIcon(fileState)}
											{@const reduction = reductionPct(fileState.originalSize, fileState.compressedSize)}
											<li
												class="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-200
													hover:bg-primary/[0.03] active:scale-[0.98]
													{fileState.status === 'error' ? 'shake-once' : ''}
													{fileState.status === 'completed' ? 'pop-once' : ''}"
												animate:flip={{ duration: 200, easing: backOut }}
												in:fly={{ y: 4, duration: 180, easing: backOut }}
											>
												<div
													class="size-7 rounded-xl grid place-items-center shrink-0
														transition-all duration-300 ring-1 ring-inset ring-border/20
														{fileStatusClass(fileState)}"
												>
													{#if fileState.status === "compressing" || fileState.status === "ocr"}
														<StatusIcon class="size-3.5 animate-spin" />
													{:else if fileState.status === "uploading"}
														<StatusIcon class="size-3.5 animate-pulse" />
													{:else}
														<StatusIcon class="size-3.5" />
													{/if}
												</div>
												<div class="flex-1 min-w-0">
													<p class="text-[11px] font-medium text-foreground/90 truncate leading-snug">
														{fileState.name}
													</p>
													<p class="text-[9px] text-muted-foreground/60 tabular-nums leading-snug mt-px">
														{#if fileState.status === "compressing"}
															<span class="text-amber-400 font-medium">Compressing…</span>
														{:else if fileState.status === "uploading"}
															<span class="text-primary font-medium">Uploading…</span>
														{:else if fileState.status === "ocr"}
															<span class="text-amber-400 font-medium">Extracting text…</span>
														{:else if fileState.status === "error" && fileState.error}
															<span class="text-destructive">{fileState.error}</span>
														{:else if reduction !== null && fileState.compressedSize}
															<span class="text-emerald-400">{formatBytes(fileState.compressedSize)}</span>
															<span class="text-muted-foreground/40"> · -{reduction}%</span>
														{:else if fileState.compressedSize}
															{formatBytes(fileState.compressedSize)}
														{/if}
													</p>
												</div>
												<div class="w-10 h-1 rounded-full bg-foreground/5 overflow-hidden shrink-0">
													<div
														class="h-full rounded-full transition-all duration-500 ease-out
															{fileState.status === 'completed'
																? 'bg-gradient-to-r from-emerald-400 to-emerald-300'
																: fileState.status === 'error'
																	? 'bg-gradient-to-r from-destructive to-destructive/70'
																	: fileState.status === 'ocr'
																		? 'bg-gradient-to-r from-amber-400 to-amber-300'
																		: fileState.status === 'uploading'
																			? 'bg-gradient-to-r from-primary to-primary/60'
																			: 'bg-gradient-to-r from-amber-400/70 to-amber-300/50'}"
														style="width: {fileState.status === 'completed' || fileState.status === 'error' ? 100 : fileState.status === 'compressing' ? 30 : 70}%"
													></div>
												</div>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<footer class="px-4 py-2.5 border-t border-border/20 bg-foreground/[0.015]">
			<div class="flex items-center justify-between">
				<p class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">
					{footerSummary}
				</p>
				<p class="text-[8px] font-medium text-muted-foreground/25">
					Worker
				</p>
			</div>
		</footer>
	</Popover.Content>
</Popover.Root>