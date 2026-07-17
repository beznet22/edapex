<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Textarea } from "$lib/components/ui/textarea";
	import ChatHeader from "$lib/components/chat-header.svelte";
	import UploadCard, {
		type UploadJob,
	} from "$lib/components/UploadCard.svelte";
	import Confetti from "$lib/components/Confetti.svelte";
	import Search from "@lucide/svelte/icons/search";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import X from "@lucide/svelte/icons/x";
	import Funnel from "@lucide/svelte/icons/funnel";
	import LayoutGrid from "@lucide/svelte/icons/layout-grid";
	import LayoutList from "@lucide/svelte/icons/layout-list";
	import Upload from "@lucide/svelte/icons/upload";
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import FileImage from "@lucide/svelte/icons/file-image";
	import FileText from "@lucide/svelte/icons/file-text";
	import FileQuestion from "@lucide/svelte/icons/file-question";
	import Table2 from "@lucide/svelte/icons/table-2";
	import Presentation from "@lucide/svelte/icons/presentation";
	import BookText from "@lucide/svelte/icons/book-text";
	import Ellipsis from "@lucide/svelte/icons/ellipsis";
	import Check from "@lucide/svelte/icons/check";
	import Square from "@lucide/svelte/icons/square";
	import Download from "@lucide/svelte/icons/download";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Eye from "@lucide/svelte/icons/eye";
	import Calendar from "@lucide/svelte/icons/calendar";
	import ScanSearch from "@lucide/svelte/icons/scan-search";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import CloudUploadIcon from "@lucide/svelte/icons/cloud-upload";
	import { generateId } from "ai";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { useImageCompression } from "$lib/context/image.context.svelte";
	import { mobileUiState } from "$lib/state/mobile-ui.svelte";
	import { IsMobile } from "$lib/hooks/is-mobile.svelte";
	import {
		backgroundTasks,
		serializeTenant,
	} from "$lib/state/background-tasks.svelte";
	import type { SerializedTenant } from "$lib/types/background-tasks";
	import { cn } from "$lib/utils/shadcn";
	import { compressIfImage, filenameForMime } from "$lib/compression.utils";
	import { toast } from "svelte-sonner";
	import type { PageData } from "./$types";
	import type {
		Artifact,
		ArtifactCategory,
		ArtifactSource,
	} from "$lib/types/workspace-types";

	let { data }: { data: PageData } = $props();

	const inspector = useInspector();
	const isMobile = new IsMobile();
	const isThreadScoped = $derived(
		typeof data.threadId === "string" && data.threadId.length > 0,
	);
	const imageContext = useImageCompression();

	const BATCH_THRESHOLD = 30;
	const CONFETTI_THRESHOLD = 2;

	let activeTermId = $state(data.activeTermId);
	let searchQuery = $state("");
	let categoryFilter = $state<"all" | "images" | "files">("all");
	let sourceFilter = $state<Set<ArtifactSource>>(new Set());
	let categoryMulti = $state<Set<ArtifactCategory>>(new Set());
	let viewMode = $state<"grid" | "list">("grid");
	let sortBy = $state<"name" | "modified" | "size">("modified");
	let sortDir = $state<"asc" | "desc">("desc");
	let selectedIds = $state<Set<string>>(new Set());

	let noteDialogOpen = $state(false);
	let noteName = $state("");
	let noteBody = $state("");
	let noteSaving = $state(false);
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let deleteDialogOpen = $state(false);
	let isExtracting = $state(false);
	let isStartingChat = $state(false);

	let uploadJobs = $state<UploadJob[]>([]);
	let isDragOver = $state(false);
	let confettiTrigger = $state(0);
	let lastCompletionCount = 0;

	$effect(() => {
		if (activeTermId !== data.activeTermId) {
			goto("?term=" + activeTermId, {
				replaceState: true,
				keepFocus: true,
				noScroll: true,
			});
		}
	});

	$effect(() => {
		if (typeof document === "undefined") return;
		let counter = 0;
		const onEnter = (e: DragEvent) => {
			if (!e.dataTransfer?.types?.includes("Files")) return;
			counter++;
			isDragOver = true;
		};
		const onLeave = (e: DragEvent) => {
			counter = Math.max(0, counter - 1);
			if (counter === 0) isDragOver = false;
		};
		const onDrop = (e: DragEvent) => {
			counter = 0;
			isDragOver = false;
			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				queueUpload(Array.from(files));
			}
		};
		document.addEventListener("dragenter", onEnter);
		document.addEventListener("dragleave", onLeave);
		document.addEventListener("drop", onDrop);
		document.addEventListener("dragover", (e) => e.preventDefault());
		return () => {
			document.removeEventListener("dragenter", onEnter);
			document.removeEventListener("dragleave", onLeave);
			document.removeEventListener("drop", onDrop);
		};
	});

	function selectTerm(id: number) {
		activeTermId = id;
	}

	function toggleSource(s: ArtifactSource) {
		const next = new Set(sourceFilter);
		if (next.has(s)) next.delete(s);
		else next.add(s);
		sourceFilter = next;
	}

	function toggleCategory(c: ArtifactCategory) {
		const next = new Set(categoryMulti);
		if (next.has(c)) next.delete(c);
		else next.add(c);
		categoryMulti = next;
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (selectedIds.size === filteredFiles.length) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(filteredFiles.map((f) => f.id));
		}
	}

	function toggleSort(column: "name" | "modified" | "size") {
		if (sortBy === column) {
			sortDir = sortDir === "asc" ? "desc" : "asc";
		} else {
			sortBy = column;
			sortDir = "asc";
		}
	}

	const filteredFiles = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const matched = data.files.filter((f) => {
			if (q && !f.title.toLowerCase().includes(q)) return false;
			if (categoryFilter === "images" && f.kind !== "image") return false;
			if (categoryFilter === "files" && f.kind === "image") return false;
			if (
				sourceFilter.size > 0 &&
				(!f.source || !sourceFilter.has(f.source))
			)
				return false;
			if (
				categoryMulti.size > 0 &&
				(!f.category || !categoryMulti.has(f.category))
			)
				return false;
			if (
				data.activeTermId &&
				data.activeTermId > 0 &&
				f.examTypeId &&
				f.examTypeId !== data.activeTermId
			)
				return false;
			return true;
		});

		const dir = sortDir === "asc" ? 1 : -1;
		const sorted = [...matched].sort((a, b) => {
			if (sortBy === "name") {
				return a.title.localeCompare(b.title) * dir;
			}
			if (sortBy === "size") {
				return ((a.size ?? 0) - (b.size ?? 0)) * dir;
			}
			const am = a.modifiedAt ?? 0;
			const bm = b.modifiedAt ?? 0;
			return (am - bm) * dir;
		});

		return sorted;
	});

	function formatSize(bytes?: number): string {
		if (!bytes) return "";
		const k = 1024;
		if (bytes < k) return bytes + " B";
		if (bytes < k * k) return (bytes / k).toFixed(2) + " KB";
		return (bytes / (k * k)).toFixed(1) + " MB";
	}

	function formatDate(ts?: number): string {
		if (!ts) return "—";
		const d = new Date(ts);
		const now = new Date();
		const diffDays = Math.floor(
			(now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
		);
		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";

		const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		if (d > sevenDaysAgo) return dayName;

		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	}

	function categoryLabel(c: ArtifactCategory | undefined): string {
		switch (c) {
			case "image":
				return "IMAGE";
			case "document":
				return "MD";
			case "spreadsheet":
				return "XLSX";
			case "presentation":
				return "PPTX";
			case "pdf":
				return "PDF";
			default:
				return "FILE";
		}
	}

	function categoryIcon(c: ArtifactCategory | undefined) {
		switch (c) {
			case "image":
				return FileImage;
			case "document":
				return BookText;
			case "spreadsheet":
				return Table2;
			case "presentation":
				return Presentation;
			case "pdf":
				return FileText;
			default:
				return FileQuestion;
		}
	}

	function openFile(file: Artifact) {
		inspector.openFilestoreArtifact(file);
		if (isMobile.current) {
			mobileUiState.viewerKey = file.id;
		}
	}

	function downloadFile(file: Artifact) {
		if (!file.url) return;
		const a = document.createElement("a");
		a.href = file.url;
		a.download = file.title;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function downloadSelected() {
		const files = filteredFiles.filter((f) => selectedIds.has(f.id));
		files.forEach((f, i) => {
			setTimeout(() => downloadFile(f), i * 50);
		});
	}

	function mimeForKind(kind: Artifact["kind"]): string {
		switch (kind) {
			case "pdf":
				return "application/pdf";
			case "image":
				return "image/jpeg";
			case "document":
				return "text/markdown";
			default:
				return "application/octet-stream";
		}
	}

	function termPrefix(): string {
		return `exams/examType-${activeTermId}/uploads/`;
	}

	function slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const files = Array.from(input.files);
		if (input) input.value = "";
		await queueUpload(files);
	}

	async function queueUpload(originals: File[]): Promise<void> {
		if (originals.length === 0) return;

		const jobs: UploadJob[] = originals.map((f) => ({
			id: crypto.randomUUID(),
			file: f,
			status: "compressing",
			statusEpoch: 0,
		}));
		uploadJobs = [...uploadJobs, ...jobs];
		const startIndex = uploadJobs.length - originals.length;

		const prepared = await Promise.all(
			originals.map(async (f, i) => {
				const compressed = await compressIfImage(f, (file, opts) =>
					imageContext.compress(file, opts),
				);
				uploadJobs[startIndex + i] = {
					...uploadJobs[startIndex + i],
					status: "uploading",
					compressedSize: compressed.size,
					statusEpoch: (uploadJobs[startIndex + i].statusEpoch ?? 0) + 1,
				};
				uploadJobs = [...uploadJobs];
				return { job: uploadJobs[startIndex + i], compressed };
			}),
		);

		const prefix = termPrefix();
		const uploadedKeys: string[] = [];
		// Tracks the workspace key → job index so the inline-OCR phase
		// can flip the right pill's status without scanning.
		const keyToJobIndex = new Map<string, number>();
		for (let i = 0; i < prepared.length; i++) {
			const { compressed, job } = prepared[i];
			try {
				const filename = filenameForMime(
					job.file.name,
					compressed.type,
				);
				const path = prefix + filename;
				const res = await fetch(
					`/api/file/${path}?examTypeId=${activeTermId}`,
					{
						method: "PUT",
						body: compressed,
					},
				);
				if (!res.ok) {
					let errMsg = `HTTP ${res.status}`;
					try {
						const body = await res.json();
						if (body?.error) errMsg = body.error;
					} catch {
						/* non-JSON error */
					}
					console.error("[filestore] upload failed", {
						path,
						status: res.status,
						error: errMsg,
					});
					throw new Error(errMsg);
				}
				uploadedKeys.push(path);
				keyToJobIndex.set(path, startIndex + i);
				uploadJobs[startIndex + i] = {
					...uploadJobs[startIndex + i]!,
					status: "done",
					statusEpoch: (uploadJobs[startIndex + i]!.statusEpoch ?? 0) + 1,
				};
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err);
				uploadJobs[startIndex + i] = {
					...uploadJobs[startIndex + i]!,
					status: "error",
					error: message,
					statusEpoch: (uploadJobs[startIndex + i]!.statusEpoch ?? 0) + 1,
				};
			}
			uploadJobs = [...uploadJobs];
		}

		const imageKeys = uploadedKeys.filter((k) =>
			/\.(jpe?g|png|webp|gif)$/i.test(k),
		);
		if (imageKeys.length > 0) {
			const tenant = serializeTenant({
				schoolId: data.tenant.schoolId,
				userId: data.tenant.userId,
				designationId: data.tenant.designationId,
				staffId: data.tenant.staffId,
				classId: data.tenant.classId,
				sectionId: data.tenant.sectionId,
				examTypeId: data.tenant.examTypeId,
				academicId: data.tenant.academicId,
				className: data.tenant.className,
				sectionName: data.tenant.sectionName,
				academicYearTitle: data.tenant.academicYearTitle,
			});

			// Threshold-based routing:
			//   1 image  → inline direct Mistral call (no background task, no popover)
			//   2-3      → inline direct Mistral calls, sequential (no background task, no popover)
			//   4+       → single Mistral batch job (background task, popover auto-opens)
			const imageCount = imageKeys.length;
			if (imageCount >= BATCH_THRESHOLD) {
				backgroundTasks.runTask({
					kind: "ocr-batch",
					keys: imageKeys,
					tenant,
				});
				toast.info(
					`Uploaded ${uploadedKeys.length}. Queued ${imageCount} for batch OCR.`,
				);
			} else {
				// 1, 2-3 → inline direct OCR per file. Each pill transitions
				// through "uploading → ocr → done" sequentially. No popover
				// entry, no background task. The user sees progress on the
				// upload card.
				await runInlineOcr(imageKeys, keyToJobIndex, tenant);
				toast.info(
					`Uploaded ${uploadedKeys.length} ${imageCount === 1 ? "file" : "files"}. Extracting text.`,
				);
			}
		} else if (uploadedKeys.length > 0) {
			toast.success(
				`Uploaded ${uploadedKeys.length} ${uploadedKeys.length === 1 ? "file" : "files"}`,
			);
		}

		const completedNow = uploadedKeys.length;
		const hasErrors = completedNow < originals.length;
		const isBatchOcr = imageKeys.length >= BATCH_THRESHOLD;
		if (
			completedNow > 0 &&
			completedNow > lastCompletionCount &&
			completedNow >= CONFETTI_THRESHOLD &&
			!hasErrors &&
			!isBatchOcr
		) {
			confettiTrigger += 1;
		}
		lastCompletionCount = completedNow;

		await invalidateAll();
	}

	/**
	 * Inline OCR for the 1-image and 2-3 image cases. Hits the
	 * `?action=ocr-direct` endpoint sequentially, updating each pill's
	 * `status` to `"ocr"` → `"done"` (or `"error"`) as the calls complete.
	 *
	 * No background task, no popover entry — the user sees progress in the
	 * upload card. Each file's upload already completed by the time this
	 * runs; we just call Mistral's direct OCR API per file.
	 */
	async function runInlineOcr(
		imageKeys: string[],
		keyToJobIndex: Map<string, number>,
		tenant: SerializedTenant,
	): Promise<void> {
		for (const key of imageKeys) {
			const jobIndex = keyToJobIndex.get(key);
			if (jobIndex === undefined) continue;

			// Flip pill to "ocr"
			const ocrJob = uploadJobs[jobIndex];
			if (!ocrJob) continue;
			uploadJobs[jobIndex] = {
				...ocrJob,
				status: "ocr" as const,
				statusEpoch: (ocrJob.statusEpoch ?? 0) + 1,
			};

			try {
				const res = await fetch("/api/file/?action=ocr-direct", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ key, tenant }),
				});
				if (!res.ok) {
					let errMsg = `OCR failed: HTTP ${res.status}`;
					try {
						const body = await res.json();
						if (body?.error) errMsg = body.error;
					} catch {
						/* non-JSON */
					}
					throw new Error(errMsg);
				}
				const doneJob = uploadJobs[jobIndex];
				if (doneJob) {
					uploadJobs[jobIndex] = {
						...doneJob,
						status: "done" as const,
						statusEpoch: (doneJob.statusEpoch ?? 0) + 1,
					};
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err);
				const errJob = uploadJobs[jobIndex];
				if (errJob) {
					uploadJobs[jobIndex] = {
						...errJob,
						status: "error" as const,
						error: message,
						statusEpoch: (errJob.statusEpoch ?? 0) + 1,
					};
				}
			}
		}
	}

	function dismissUploadJob(id: string): void {
		uploadJobs = uploadJobs.filter((j) => j.id !== id);
	}

	function collapseUploadCard(): void {
		uploadJobs = [];
	}

	async function saveNote() {
		if (!noteName.trim() || !noteBody.trim()) {
			toast.error("Name and body are required");
			return;
		}
		noteSaving = true;
		try {
			const path = termPrefix() + slugify(noteName) + ".md";
			const res = await fetch(
				`/api/file/${path}?examTypeId=${activeTermId}`,
				{
					method: "PUT",
					headers: { "Content-Type": "text/markdown" },
					body: noteBody,
				},
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			toast.success("Note saved");
			noteDialogOpen = false;
			noteName = "";
			noteBody = "";
			await invalidateAll();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to save note: ${message}`);
		} finally {
			noteSaving = false;
		}
	}

	async function startChatWithSelected() {
		if (selectedIds.size === 0) return;
		isStartingChat = true;
		try {
			const chatId = generateId();
			const selectedFiles = filteredFiles.filter((f) =>
				selectedIds.has(f.id),
			);
			const keys = selectedFiles
				.map((f) => f.id)
				.map(encodeURIComponent)
				.join(",");
			clearSelection();
			await goto(`/chat/${chatId}?refs=${keys}`);
		} finally {
			isStartingChat = false;
		}
	}

	async function extractSelected() {
		if (selectedIds.size === 0) return;
		const keys = filteredFiles
			.filter((f) => selectedIds.has(f.id))
			.map((f) => f.id);
		isExtracting = true;
		try {
			const tenant = serializeTenant({
				schoolId: data.tenant.schoolId,
				userId: data.tenant.userId,
				designationId: data.tenant.designationId,
				staffId: data.tenant.staffId,
				classId: data.tenant.classId,
				sectionId: data.tenant.sectionId,
				examTypeId: activeTermId,
				academicId: data.tenant.academicId,
				className: data.tenant.className,
				sectionName: data.tenant.sectionName,
				academicYearTitle: data.tenant.academicYearTitle,
			});
			// Same threshold routing as the auto-OCR path: 1-3 selected
			// files use inline direct Mistral; 4+ uses the Mistral batch
			// API (background task, popover auto-opens).
			if (keys.length >= BATCH_THRESHOLD) {
				backgroundTasks.runTask({ kind: "ocr-batch", keys, tenant });
				toast.info(
					`Queued ${keys.length} file${keys.length === 1 ? "" : "s"} for batch OCR`,
				);
			} else {
				await runInlineOcr(keys, new Map(), tenant);
				toast.info(
					`Extracting text from ${keys.length} file${keys.length === 1 ? "" : "s"}`,
				);
			}
			clearSelection();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to queue extraction: ${message}`);
		} finally {
			isExtracting = false;
		}
	}

	async function confirmDelete() {
		const ids = [...selectedIds];
		deleteDialogOpen = false;
		try {
			await Promise.all(
				ids.map((id) => fetch(`/api/file/${id}`, { method: "DELETE" })),
			);
			clearSelection();
			await invalidateAll();
			toast.success(
				`Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}`,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to delete: ${message}`);
		}
	}

	function backToThread() {
		if (data.threadId) {
			goto(`/chat/${data.threadId}`);
		} else {
			goto("/");
		}
	}

	const activeFilterCount = $derived(sourceFilter.size + categoryMulti.size);
	const bulkActionsVisible = $derived(selectedIds.size > 0);
</script>

<svelte:head>
	<title>{isThreadScoped ? "Thread artifacts" : "Library"} · Edapex</title>
</svelte:head>

<Confetti trigger={confettiTrigger} />

{#if isDragOver}
	<div
		class="fixed inset-0 z-50 pointer-events-none flex items-center justify-center
			   bg-background/60 backdrop-blur-2xl"
	>
		<div
			class="hermes-glass rounded-3xl p-10 sm:p-12 flex flex-col items-center gap-6
					shadow-2xl gold-glow max-w-md mx-4"
		>
			<div
				class="size-20 rounded-2xl bg-primary/10 border border-primary/20
						flex items-center justify-center drag-wobble"
			>
				<CloudUploadIcon class="size-10 text-primary" />
			</div>
			<div class="text-center space-y-1.5">
				<p
					class="text-2xl sm:text-3xl font-black tracking-tighter text-foreground"
				>
					Drop files to upload
				</p>
				<p
					class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
				>
					They'll be added to the active term
				</p>
			</div>
		</div>
	</div>
{/if}

<div class="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
	<ChatHeader />

	<div class="flex-1 min-h-0 overflow-auto bg-background">
		<div
			class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-6 sm:space-y-8"
		>
			<header
				class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="flex items-center gap-3 min-w-0">
					{#if isThreadScoped}
						<button
							type="button"
							onclick={backToThread}
							class="hidden sm:inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
							aria-label="Back to thread"
							title="Back to thread"
						>
							<ChevronLeft class="size-5" />
						</button>
						<button
							type="button"
							onclick={backToThread}
							class="sm:hidden size-10 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
							aria-label="Close"
							title="Close"
						>
							<X class="size-5" />
						</button>
					{/if}
					<h1
						class="text-3xl sm:text-4xl font-black tracking-tighter text-foreground uppercase"
					>
						Library
					</h1>
					{#if isThreadScoped}
						<span
							class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 hidden sm:inline"
						>
							Thread artifacts
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
					<div class="relative group flex-1 sm:flex-none">
						<Search
							class="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 group-focus-within:text-foreground transition-colors pointer-events-none"
						/>
						<Input
							type="search"
							placeholder="Search library"
							class="pl-11 h-10 w-full sm:w-80 bg-muted/40 border border-border/40 rounded-full text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:bg-background transition-all"
							bind:value={searchQuery}
						/>
					</div>

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class="h-10 px-4 rounded-full font-bold text-sm gap-1.5 bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition-opacity inline-flex items-center"
								>
									New
									<ChevronDown class="h-4 w-4 opacity-80" />
								</button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content
							align="end"
							sideOffset={8}
							class="w-56 rounded-2xl p-1 bg-popover border border-border/60 shadow-2xl"
						>
							<DropdownMenu.Item
								onclick={() => fileInputRef?.click()}
								class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
							>
								<Upload
									class="h-4 w-4 mr-3 text-muted-foreground"
								/>
								Upload files
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onclick={() => (noteDialogOpen = true)}
								class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
							>
								<FileText
									class="h-4 w-4 mr-3 text-muted-foreground"
								/>
								New note
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<input
						bind:this={fileInputRef}
						type="file"
						multiple
						class="hidden"
						onchange={handleFileUpload}
					/>
				</div>
			</header>

			<UploadCard
				jobs={uploadJobs}
				onDismissJob={dismissUploadJob}
				onCollapse={collapseUploadCard}
			/>

			{#if bulkActionsVisible}
				<div
					class="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm flex-wrap"
					role="toolbar"
					aria-label="Bulk actions"
				>
					<button
						type="button"
						onclick={clearSelection}
						class="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
					>
						<X class="size-3.5" />
						<span class="hidden sm:inline">Clear</span>
					</button>
					<span
						class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 ml-1"
					>
						{selectedIds.size} selected
					</span>
					<span class="h-5 w-px bg-border/60 mx-1" aria-hidden="true"
					></span>

					<Button
						variant="secondary"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						disabled={isExtracting}
						onclick={extractSelected}
					>
						<ScanSearch class="size-3.5" />
						Extract
					</Button>
					<Button
						variant="default"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						disabled={isStartingChat}
						onclick={startChatWithSelected}
					>
						<MessageSquare class="size-3.5" />
						Start chat
					</Button>
					<span class="flex-1" aria-hidden="true"></span>
					<Button
						variant="destructive"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						onclick={() => (deleteDialogOpen = true)}
					>
						<Trash2 class="size-3.5" />
						Delete
					</Button>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<nav
						class="flex items-center gap-1 sm:gap-2"
						aria-label="File categories"
					>
						{#each [{ id: "all", label: "All" }, { id: "images", label: "Images" }, { id: "files", label: "Files" }] as tab (tab.id)}
							<button
								type="button"
								onclick={() =>
									(categoryFilter =
										tab.id as typeof categoryFilter)}
								class={cn(
									"h-9 px-4 rounded-full text-sm font-bold transition-colors",
									categoryFilter === tab.id
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
								)}
							>
								{tab.label}
							</button>
						{/each}
					</nav>

					<div class="flex items-center gap-1">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										type="button"
										aria-label="Filter"
										class={cn(
											"h-9 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-xs font-bold uppercase tracking-wider",
											activeFilterCount > 0 &&
												"text-primary bg-primary/10",
										)}
									>
										<Funnel class="h-4 w-4" />
										<span class="hidden sm:inline"
											>Filter</span
										>
										{#if activeFilterCount > 0}
											<span
												class="h-4 min-w-4 px-1 grid place-items-center rounded-full bg-primary text-primary-foreground text-[10px] font-black tabular-nums"
											>
												{activeFilterCount}
											</span>
										{/if}
									</button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content
								align="end"
								sideOffset={8}
								class="w-80 rounded-2xl p-2 bg-popover border border-border/60 shadow-2xl"
							>
								{#if data.termOptions.length > 0}
									<DropdownMenu.Group>
										<DropdownMenu.GroupHeading
											class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70"
										>
											Exam term
											{#if data.activeAcademicTitle}
												<span
													class="ml-1 text-muted-foreground/50 normal-case font-medium tracking-normal"
												>
													· {data.activeAcademicTitle}
												</span>
											{/if}
										</DropdownMenu.GroupHeading>
										<DropdownMenu.RadioGroup
											value={String(activeTermId)}
											onValueChange={(v) =>
												selectTerm(Number(v))}
										>
											{#each data.termOptions as opt (opt.id)}
												<DropdownMenu.RadioItem
													value={String(opt.id)}
													class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
												>
													<Calendar
														class="h-4 w-4 mr-3 text-muted-foreground"
													/>
													{opt.name}
												</DropdownMenu.RadioItem>
											{/each}
										</DropdownMenu.RadioGroup>
									</DropdownMenu.Group>

									<DropdownMenu.Separator
										class="my-2 h-px bg-border/60"
									/>
								{/if}

								<DropdownMenu.Group>
									<DropdownMenu.GroupHeading
										class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70"
									>
										Source
									</DropdownMenu.GroupHeading>
									<DropdownMenu.CheckboxItem
										checked={sourceFilter.has("uploaded")}
										onCheckedChange={() =>
											toggleSource("uploaded")}
										class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
									>
										<Upload
											class="h-4 w-4 mr-3 text-muted-foreground"
										/>
										Uploaded
									</DropdownMenu.CheckboxItem>
									<DropdownMenu.CheckboxItem
										checked={sourceFilter.has("generated")}
										onCheckedChange={() =>
											toggleSource("generated")}
										class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
									>
										<Sparkles
											class="h-4 w-4 mr-3 text-muted-foreground"
										/>
										Generated
									</DropdownMenu.CheckboxItem>
								</DropdownMenu.Group>

								<DropdownMenu.Separator
									class="my-2 h-px bg-border/60"
								/>

								<DropdownMenu.Group>
									<DropdownMenu.GroupHeading
										class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70"
									>
										File type
									</DropdownMenu.GroupHeading>
									{#each [{ id: "image" as const, label: "Images", Icon: FileImage }, { id: "document" as const, label: "Documents", Icon: FileText }, { id: "spreadsheet" as const, label: "Spreadsheets", Icon: Table2 }, { id: "presentation" as const, label: "Presentations", Icon: Presentation }, { id: "pdf" as const, label: "PDFs", Icon: FileText }] as item (item.id)}
										<DropdownMenu.CheckboxItem
											checked={categoryMulti.has(item.id)}
											onCheckedChange={() =>
												toggleCategory(item.id)}
											class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
										>
											<item.Icon
												class="h-4 w-4 mr-3 text-muted-foreground"
											/>
											{item.label}
										</DropdownMenu.CheckboxItem>
									{/each}
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<div
							class="h-5 w-px bg-border/60 mx-1"
							aria-hidden="true"
						></div>

						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										type="button"
										aria-label="View mode"
										class="sm:hidden h-9 w-9 grid place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
									>
										{#if viewMode === "grid"}
											<LayoutGrid class="h-4 w-4" />
										{:else}
											<LayoutList class="h-4 w-4" />
										{/if}
									</button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content
								align="end"
								sideOffset={8}
								class="w-44 rounded-2xl p-1 bg-popover border border-border/60 shadow-2xl"
							>
								<DropdownMenu.Item
									onclick={() => (viewMode = "grid")}
									class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
								>
									<LayoutGrid
										class="h-4 w-4 mr-3 text-muted-foreground"
									/>
									Grid
									{#if viewMode === "grid"}
										<Check
											class="h-4 w-4 ml-auto"
											strokeWidth={3}
										/>
									{/if}
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={() => (viewMode = "list")}
									class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
								>
									<LayoutList
										class="h-4 w-4 mr-3 text-muted-foreground"
									/>
									List
									{#if viewMode === "list"}
										<Check
											class="h-4 w-4 ml-auto"
											strokeWidth={3}
										/>
									{/if}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<div class="hidden sm:flex items-center gap-1">
							<button
								type="button"
								aria-label="Grid view"
								onclick={() => (viewMode = "grid")}
								class={cn(
									"h-9 w-9 grid place-items-center rounded-full transition-colors",
									viewMode === "grid"
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
								)}
							>
								<LayoutGrid class="h-4 w-4" />
							</button>
							<button
								type="button"
								aria-label="List view"
								onclick={() => (viewMode = "list")}
								class={cn(
									"h-9 w-9 grid place-items-center rounded-full transition-colors",
									viewMode === "list"
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
								)}
							>
								<LayoutList class="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>
			{/if}

			{#if !data.files}
				<div
					class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
				>
					{#each Array(6) as _, i (i)}
						<Skeleton class="aspect-[3/4] rounded-3xl" />
					{/each}
				</div>
			{:else if filteredFiles.length === 0}
				<div
					class="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-accent/50 bg-accent/10"
				>
					<FileQuestion
						class="size-12 text-muted-foreground/30 mb-3"
					/>
					<p
						class="text-[11px] font-black uppercase tracking-widest text-muted-foreground"
					>
						{#if isThreadScoped}
							No artifacts yet for this thread
						{:else if searchQuery || activeFilterCount > 0 || categoryFilter !== "all"}
							No matches
						{:else}
							No files in this term
						{/if}
					</p>
					{#if isThreadScoped}
						<a
							href="/filestore"
							class="mt-3 text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
						>
							View all library
						</a>
					{/if}
				</div>
			{:else if viewMode === "grid"}
				<div
					class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6"
				>
					{#each filteredFiles as file (file.id)}
						{@const Icon = categoryIcon(file.category)}
						{@const isActive =
							inspector.filestoreArtifact?.id === file.id}
						{@const isSelected = selectedIds.has(file.id)}
						{@const displayName = file.title.replace(/\.[a-z0-9]+$/i, "")}
						<div
							role="button"
							tabindex="0"
							onclick={() => openFile(file)}
							onkeydown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									openFile(file);
								}
							}}
							class={cn(
								"group relative aspect-square rounded-3xl overflow-hidden text-left transition-all duration-300 cursor-pointer bg-card",
								"shadow-lg hover:shadow-[0_1px_3px_0px_oklch(0_0_0/0.1),0_12px_24px_-6px_oklch(0_0_0/0.25)] hover:-translate-y-1 hover:bg-muted/30",
								isActive
									? "ring-1 ring-primary"
									: isSelected
										? "ring-1 ring-foreground"
										: "",
							)}
						>
							<button
								type="button"
								aria-label="Select"
								onclick={(e) => {
									e.stopPropagation();
									toggleSelect(file.id);
								}}
								class={cn(
									"absolute top-3 right-3 z-10 size-7 grid place-items-center rounded-full border transition-all",
									isSelected
										? "bg-primary text-primary-foreground border-primary"
										: "bg-background/85 backdrop-blur-sm border-foreground/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
								)}
							>
								{#if isSelected}
									<Check class="size-3.5" strokeWidth={3.5} />
								{/if}
							</button>
							{#if file.kind === "image" && file.url}
								<img
									src={file.url}
									alt={file.title}
									loading="lazy"
									class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
								/>
								<div
									class="absolute bottom-0 left-0 right-0 h-1/2 bg-linear-to-t from-black/40 to-transparent pointer-events-none"
								>
									<Icon
										class="size-14 text-foreground/30"
										strokeWidth={1.25}
									/>
								</div>
							{:else}
								<div
									class="absolute inset-0 grid place-items-center from-muted/30 via-background/10 to-muted/40"
								>
									<Icon
										class="size-14 text-foreground/30"
										strokeWidth={1.25}
									/>
								</div>
							{/if}

							<h3
								class="absolute capitalize text-base top-3 left-3 right-12 font-bold leading-tight line-clamp-2 text-white drop-shadow-sm pointer-events-none"
								title={file.title}
							>
								{displayName}
							</h3>
							<div
								class="absolute bottom-3 left-3 right-12 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest pointer-events-none"
							>
								<span class="text-white/60 drop-shadow-sm"
									>{categoryLabel(file.category)}</span
								>
								<span class="text-white/40" aria-hidden="true"
									>·</span
								>
								<span
									class="tabular-nums text-white/60 drop-shadow-sm"
									>{formatSize(file.size) || "—"}</span
								>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div>
					<div
						class="grid grid-cols-[1fr_auto] sm:grid-cols-[auto_1fr_140px_120px_60px] items-center gap-4 px-2 sm:px-4 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground"
					>
						<button
							type="button"
							aria-label="Select all"
							onclick={toggleSelectAll}
							class="hidden sm:grid place-items-center"
						>
							{#if selectedIds.size > 0 && selectedIds.size === filteredFiles.length}
								<span
									class="grid place-items-center size-4 rounded-[5px] bg-foreground text-background"
								>
									<Check class="size-3" strokeWidth={3.5} />
								</span>
							{:else if selectedIds.size > 0}
								<span
									class="grid place-items-center size-4 rounded-[5px] border border-foreground/60 bg-foreground/10"
								>
									<div
										class="size-2 rounded-[3px] bg-foreground/60"
									/>
								</span>
							{:else}
								<span
									class="size-4 rounded-[5px] border border-foreground/30"
								/>
							{/if}
						</button>
						<span class="sm:hidden">Name</span>
						<button
							type="button"
							onclick={() => toggleSort("name")}
							class="hidden sm:inline text-left hover:text-foreground transition-colors"
						>
							Name
						</button>
						<button
							type="button"
							onclick={() => toggleSort("modified")}
							class="hidden sm:inline-flex text-left hover:text-foreground transition-colors items-center gap-1"
						>
							Modified
							{#if sortBy === "modified"}
								<ChevronDown
									class={cn(
										"size-3 transition-transform",
										sortDir === "asc" && "rotate-180",
									)}
								/>
							{:else}
								<ChevronDown class="size-3 opacity-30" />
							{/if}
						</button>
						<button
							type="button"
							onclick={() => toggleSort("size")}
							class="hidden sm:inline text-left hover:text-foreground transition-colors"
						>
							Size
						</button>
						<span class="hidden sm:inline" aria-hidden="true"
						></span>
					</div>

					<ul class="divide-y divide-border/40">
						{#each filteredFiles as file (file.id)}
							{@const Icon = categoryIcon(file.category)}
							{@const isActive =
								inspector.filestoreArtifact?.id === file.id}
							{@const isSelected = selectedIds.has(file.id)}
							<li
								class={cn(
									"grid grid-cols-[1fr_auto] sm:grid-cols-[auto_1fr_140px_120px_60px] items-center gap-4 px-2 sm:px-4 py-2 transition-colors rounded-lg",
									isActive
										? "bg-foreground/10"
										: "hover:bg-muted/30",
								)}
							>
								<button
									type="button"
									aria-label="Select"
									onclick={(e) => {
										e.stopPropagation();
										toggleSelect(file.id);
									}}
									class={cn(
										"hidden sm:grid place-items-center size-5 rounded-full border transition-all shrink-0",
										isSelected
											? "bg-primary text-primary-foreground border-primary"
											: "border-foreground/30",
									)}
								>
									{#if isSelected}
										<div
											class="size-2 rounded-full bg-current"
										/>
									{/if}
								</button>
								<button
									type="button"
									onclick={() => openFile(file)}
									class="flex items-center gap-3 min-w-0 text-left"
								>
									<div
										class="size-12 rounded-lg overflow-hidden bg-muted/40 border border-border/40 grid place-items-center shrink-0"
									>
										{#if file.kind === "image" && file.url}
											<img
												src={file.url}
												alt={file.title}
												loading="lazy"
												class="w-full h-full object-cover"
											/>
										{:else}
											<Icon
												class="size-5 text-foreground/70"
											/>
										{/if}
									</div>
									<div class="flex flex-col min-w-0">
										<span
											class="truncate text-sm font-medium text-foreground/90"
										>
											{file.title}
										</span>
										<span
											class="truncate text-xs text-muted-foreground sm:hidden"
										>
											{formatDate(file.modifiedAt)}
										</span>
									</div>
								</button>

								<span
									class="hidden sm:inline text-sm text-muted-foreground truncate"
								>
									{formatDate(file.modifiedAt)}
								</span>
								<span
									class="hidden sm:inline text-sm text-muted-foreground tabular-nums"
								>
									{formatSize(file.size) || "—"}
								</span>

								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												type="button"
												aria-label="More actions"
												onclick={(e) =>
													e.stopPropagation()}
												class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
											>
												<Ellipsis class="size-4" />
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content
										align="end"
										sideOffset={4}
										class="w-48 rounded-xl p-1 bg-popover border border-border/60 shadow-2xl"
									>
										<DropdownMenu.Item
											onclick={() => openFile(file)}
											class="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
										>
											<Eye
												class="h-4 w-4 mr-3 text-muted-foreground"
											/>
											Open
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => downloadFile(file)}
											class="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
										>
											<Download
												class="h-4 w-4 mr-3 text-muted-foreground"
											/>
											Download
										</DropdownMenu.Item>
										<DropdownMenu.Separator
											class="my-1 h-px bg-border/60"
										/>
										<DropdownMenu.Item
											onclick={() => {
												clearSelection();
												selectedIds = new Set([
													file.id,
												]);
												deleteDialogOpen = true;
											}}
											class="px-3 py-2 rounded-lg text-sm font-medium text-destructive focus:text-destructive cursor-pointer"
										>
											<Trash2 class="h-4 w-4 mr-3" />
											Delete
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
</div>

<Dialog.Root bind:open={noteDialogOpen}>
	<Dialog.Content
		class="bg-background/95 backdrop-blur-3xl border border-border/60 rounded-3xl p-6 shadow-2xl max-w-md"
	>
		<Dialog.Header>
			<Dialog.Title>New note</Dialog.Title>
			<Dialog.Description>
				Write a quick markdown note and save it to the active term.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-3 py-2">
			<Input
				placeholder="Filename (e.g. meeting-notes)"
				bind:value={noteName}
				autofocus
			/>
			<Textarea
				placeholder="# Heading&#10;&#10;Write your note in markdown…"
				bind:value={noteBody}
				class="min-h-32 font-mono text-sm"
			/>
		</div>
		<Dialog.Footer class="gap-2">
			<Button
				variant="ghost"
				onclick={() => (noteDialogOpen = false)}
				disabled={noteSaving}
			>
				Cancel
			</Button>
			<Button onclick={saveNote} disabled={noteSaving}>
				{noteSaving ? "Saving…" : "Save note"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content
		class="bg-background/95 backdrop-blur-3xl border border-border/60 rounded-3xl p-6 shadow-2xl max-w-sm"
	>
		<AlertDialog.Header>
			<AlertDialog.Title
				>Delete {selectedIds.size} file{selectedIds.size === 1
					? ""
					: "s"}?</AlertDialog.Title
			>
			<AlertDialog.Description>
				This action cannot be undone. The selected files will be
				permanently removed from your library.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer class="gap-2">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={confirmDelete}
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
