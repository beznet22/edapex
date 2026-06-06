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
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { backgroundTasks, serializeTenant } from "$lib/state/background-tasks.svelte";
	import { cn } from "$lib/utils/shadcn";
	import { toast } from "svelte-sonner";
	import type { PageData } from "./$types";
	import type { Artifact, ArtifactCategory, ArtifactSource } from "$lib/types/workspace-types";

	let { data }: { data: PageData } = $props();

	const inspector = useInspector();
	const isThreadScoped = $derived(typeof data.threadId === "string" && data.threadId.length > 0);

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
	let isStartingChat = $state(false);
	let isExtracting = $state(false);

	$effect(() => {
		if (activeTermId !== data.activeTermId) {
			goto("?term=" + activeTermId, {
				replaceState: true,
				keepFocus: true,
				noScroll: true,
			});
		}
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

	function clearSelection() {
		selectedIds = new Set();
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
			if (sourceFilter.size > 0 && (!f.source || !sourceFilter.has(f.source))) return false;
			if (
				categoryMulti.size > 0 &&
				(!f.category || !categoryMulti.has(f.category))
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

		return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
			case "pdf": return "application/pdf";
			case "image": return "image/jpeg";
			case "document": return "text/markdown";
			default: return "application/octet-stream";
		}
	}

	function termPrefix(): string {
		return `exams/examType-${activeTermId}/`;
	}

	function slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;
		const prefix = termPrefix();
		for (const file of Array.from(files)) {
			const path = prefix + file.name;
			const res = await fetch(`/api/file/${path}`, {
				method: "PUT",
				body: file,
			});
			if (!res.ok) {
				toast.error(`Failed to upload ${file.name}`);
			}
		}
		toast.success(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
		if (fileInputRef) fileInputRef.value = "";
		await invalidateAll();
	}

	async function saveNote() {
		if (!noteName.trim() || !noteBody.trim()) {
			toast.error("Name and body are required");
			return;
		}
		noteSaving = true;
		try {
			const path = termPrefix() + slugify(noteName) + ".md";
			const res = await fetch(`/api/file/${path}`, {
				method: "PUT",
				headers: { "Content-Type": "text/markdown" },
				body: noteBody,
			});
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
		if (selectedIds.size !== 1) return;
		const id = [...selectedIds][0];
		const file = filteredFiles.find((f) => f.id === id);
		if (!file) return;
		isStartingChat = true;
		try {
			const res = await fetch("/api/chat/start-with-files", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					files: [
						{
							key: file.id,
							name: file.title,
							mimeType: mimeForKind(file.kind),
							kind: file.kind,
						},
					],
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as { threadId: string; fileReferences: unknown[] };
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("pendingFileReferences", JSON.stringify(json.fileReferences));
			}
			clearSelection();
			await goto(`/chat/${json.threadId}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to start chat: ${message}`);
		} finally {
			isStartingChat = false;
		}
	}

	async function extractSelected() {
		if (selectedIds.size === 0) return;
		const keys = filteredFiles.filter((f) => selectedIds.has(f.id)).map((f) => f.id);
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
			});
			backgroundTasks.runTask({ kind: "ocr-batch", keys, tenant });
			toast.info(`Queued ${keys.length} file${keys.length === 1 ? "" : "s"} for extraction`);
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
			toast.success(`Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}`);
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
	const singleSelected = $derived(selectedIds.size === 1);
</script>

<svelte:head>
	<title>{isThreadScoped ? "Thread artifacts" : "Library"} · Edapex</title>
</svelte:head>

<div class="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
	<ChatHeader />

	<div class="flex-1 min-h-0 overflow-auto bg-background">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-6 sm:space-y-8">
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
						<span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1 hidden sm:inline">
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
							class="pl-11 h-12 w-full sm:w-80 bg-muted/40 border border-border/40 rounded-full text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:bg-background transition-all"
							bind:value={searchQuery}
						/>
					</div>

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class="h-12 px-5 rounded-full font-bold text-sm gap-1.5 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow bg-foreground text-background inline-flex items-center"
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
								<Upload class="h-4 w-4 mr-3 text-muted-foreground" />
								Upload files
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onclick={() => (noteDialogOpen = true)}
								class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
							>
								<FileText class="h-4 w-4 mr-3 text-muted-foreground" />
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
					<span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80 ml-1">
						{selectedIds.size} selected
					</span>
					<span class="h-5 w-px bg-border/60 mx-1" aria-hidden="true"></span>

					<Button
						variant="default"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						disabled={!singleSelected || isStartingChat}
						onclick={startChatWithSelected}
						title={singleSelected ? "Start a new chat with this file" : "Multi-file chat coming soon"}
					>
						<MessageSquare class="size-3.5" />
						Start chat
					</Button>

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
						variant="ghost"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						onclick={downloadSelected}
					>
						<Download class="size-3.5" />
						Download
					</Button>

					<Button
						variant="ghost"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold text-destructive hover:text-destructive"
						onclick={() => (deleteDialogOpen = true)}
					>
						<Trash2 class="size-3.5" />
						Delete
					</Button>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<nav class="flex items-center gap-1 sm:gap-2" aria-label="File categories">
						{#each [
							{ id: "all", label: "All" },
							{ id: "images", label: "Images" },
							{ id: "files", label: "Files" },
						] as tab (tab.id)}
							<button
								type="button"
								onclick={() => (categoryFilter = tab.id as typeof categoryFilter)}
								class={cn(
									"h-10 px-5 rounded-full text-sm font-bold transition-colors",
									categoryFilter === tab.id
										? "bg-foreground text-background"
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
											"h-10 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-xs font-bold uppercase tracking-wider",
											activeFilterCount > 0 && "text-foreground bg-muted/40",
										)}
									>
										<Funnel class="h-4 w-4" />
										<span class="hidden sm:inline">Filter</span>
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
												<span class="ml-1 text-muted-foreground/50 normal-case font-medium tracking-normal">
													· {data.activeAcademicTitle}
												</span>
											{/if}
										</DropdownMenu.GroupHeading>
										<DropdownMenu.RadioGroup
											value={String(activeTermId)}
											onValueChange={(v) => selectTerm(Number(v))}
										>
											{#each data.termOptions as opt (opt.id)}
												<DropdownMenu.RadioItem
													value={String(opt.id)}
													class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
												>
													<Calendar class="h-4 w-4 mr-3 text-muted-foreground" />
													{opt.name}
												</DropdownMenu.RadioItem>
											{/each}
										</DropdownMenu.RadioGroup>
									</DropdownMenu.Group>

									<DropdownMenu.Separator class="my-2 h-px bg-border/60" />
								{/if}

								<DropdownMenu.Group>
									<DropdownMenu.GroupHeading
										class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70"
									>
										Source
									</DropdownMenu.GroupHeading>
									<DropdownMenu.CheckboxItem
										checked={sourceFilter.has("uploaded")}
										onCheckedChange={() => toggleSource("uploaded")}
										class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
									>
										<Upload class="h-4 w-4 mr-3 text-muted-foreground" />
										Uploaded
									</DropdownMenu.CheckboxItem>
									<DropdownMenu.CheckboxItem
										checked={sourceFilter.has("generated")}
										onCheckedChange={() => toggleSource("generated")}
										class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
									>
										<Sparkles class="h-4 w-4 mr-3 text-muted-foreground" />
										Generated
									</DropdownMenu.CheckboxItem>
								</DropdownMenu.Group>

								<DropdownMenu.Separator class="my-2 h-px bg-border/60" />

								<DropdownMenu.Group>
									<DropdownMenu.GroupHeading
										class="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/70"
									>
										File type
									</DropdownMenu.GroupHeading>
									{#each [
										{ id: "image" as const, label: "Images", Icon: FileImage },
										{ id: "document" as const, label: "Documents", Icon: FileText },
										{ id: "spreadsheet" as const, label: "Spreadsheets", Icon: Table2 },
										{ id: "presentation" as const, label: "Presentations", Icon: Presentation },
										{ id: "pdf" as const, label: "PDFs", Icon: FileText },
									] as item (item.id)}
										<DropdownMenu.CheckboxItem
											checked={categoryMulti.has(item.id)}
											onCheckedChange={() => toggleCategory(item.id)}
											class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
										>
											<item.Icon class="h-4 w-4 mr-3 text-muted-foreground" />
											{item.label}
										</DropdownMenu.CheckboxItem>
									{/each}
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<div class="h-6 w-px bg-border/60 mx-1" aria-hidden="true"></div>

						<button
							type="button"
							aria-label="Grid view"
							onclick={() => (viewMode = "grid")}
							class={cn(
								"h-10 w-10 grid place-items-center rounded-full transition-colors",
								viewMode === "grid"
									? "bg-foreground text-background"
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
								"h-10 w-10 grid place-items-center rounded-full transition-colors",
								viewMode === "list"
									? "bg-foreground text-background"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
							)}
						>
							<LayoutList class="h-4 w-4" />
						</button>
					</div>
				</div>
			{/if}

			{#if !data.files}
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
					{#each Array(6) as _, i (i)}
						<Skeleton class="aspect-[3/4] rounded-3xl" />
					{/each}
				</div>
			{:else if filteredFiles.length === 0}
				<div
					class="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-dashed border-accent/50 bg-accent/10"
				>
					<FileQuestion class="size-12 text-muted-foreground/30 mb-3" />
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
					class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
				>
					{#each filteredFiles as file (file.id)}
						{@const Icon = categoryIcon(file.category)}
						{@const isActive = inspector.filestoreArtifact?.id === file.id}
						{@const isSelected = selectedIds.has(file.id)}
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
								"group relative aspect-[3/4] rounded-3xl border bg-card/40 overflow-hidden text-left transition-all cursor-pointer",
								"hover:bg-card/70 hover:border-border/80 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5",
								isActive
									? "border-primary ring-2 ring-primary/30"
									: isSelected
										? "border-foreground/70 ring-2 ring-foreground/70"
										: "border-border/40",
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
									"absolute top-3 right-3 z-10 size-6 grid place-items-center rounded-full border transition-all",
									isSelected
										? "bg-foreground text-background border-foreground"
										: "bg-background/80 backdrop-blur-sm border-border/60 opacity-0 group-hover:opacity-100",
								)}
							>
								{#if isSelected}
									<Check class="size-3.5" strokeWidth={3.5} />
								{/if}
							</button>

							<div class="absolute inset-0 p-5 flex flex-col pointer-events-none">
								<h3
									class="text-[15px] font-bold text-foreground leading-tight line-clamp-2 pr-1"
									title={file.title}
								>
									{file.title}
								</h3>

								<div class="flex-1 grid place-items-center my-4">
									{#if file.kind === "image" && file.url}
										<div
											class="w-full h-full rounded-2xl overflow-hidden bg-muted/30 grid place-items-center"
										>
											<img
												src={file.url}
												alt={file.title}
												loading="lazy"
												class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
											/>
										</div>
									{:else}
										<div
											class="size-20 grid place-items-center rounded-2xl bg-foreground/5 border border-border/40 group-hover:bg-foreground/10 transition-colors"
										>
											<Icon class="size-10 text-foreground/80" />
										</div>
									{/if}
								</div>

								<div
									class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
								>
									<span class="text-foreground/80">{categoryLabel(file.category)}</span>
									<span aria-hidden="true">·</span>
									<span class="tabular-nums">{formatSize(file.size) || "—"}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="rounded-2xl border border-border/40 overflow-hidden bg-card/20">
					<div
						class="grid grid-cols-[auto_1fr_140px_120px_60px] items-center gap-4 px-4 sm:px-6 py-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/40"
					>
						<button
							type="button"
							aria-label="Select all"
							onclick={toggleSelectAll}
							class="grid place-items-center"
						>
							{#if selectedIds.size > 0 && selectedIds.size === filteredFiles.length}
								<span
									class="grid place-items-center size-4 rounded-[5px] bg-foreground text-background"
								>
									<Check class="size-3" strokeWidth={3.5} />
								</span>
							{:else if selectedIds.size > 0}
								<span
									class="grid place-items-center size-4 rounded-[5px] border-[1.5px] border-foreground bg-foreground/30 text-background"
								>
									<span class="block w-2 h-0.5 bg-current rounded-full"></span>
								</span>
							{:else}
								<Square class="size-4 text-muted-foreground/60" strokeWidth={1.5} />
							{/if}
						</button>
						<button
							type="button"
							onclick={() => toggleSort("name")}
							class="text-left hover:text-foreground transition-colors"
						>
							Name
						</button>
						<button
							type="button"
							onclick={() => toggleSort("modified")}
							class="text-left hover:text-foreground transition-colors flex items-center gap-1"
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
							class="text-left hover:text-foreground transition-colors"
						>
							Size
						</button>
						<span aria-hidden="true"></span>
					</div>

					<ul class="divide-y divide-border/40">
						{#each filteredFiles as file (file.id)}
							{@const Icon = categoryIcon(file.category)}
							{@const isActive = inspector.filestoreArtifact?.id === file.id}
							{@const isSelected = selectedIds.has(file.id)}
							<li
								class={cn(
									"group grid grid-cols-[auto_1fr_140px_120px_60px] items-center gap-4 px-4 sm:px-6 py-3 transition-colors",
									isActive
										? "bg-foreground/10"
										: isSelected
											? "bg-primary/10"
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
									class="grid place-items-center"
								>
									{#if isSelected}
										<span
											class="grid place-items-center size-4 rounded-[5px] bg-foreground text-background"
										>
											<Check class="size-3" strokeWidth={3.5} />
										</span>
									{:else}
										<Square
											class="size-4 text-muted-foreground/60 group-hover:text-foreground transition-colors"
											strokeWidth={1.5}
										/>
									{/if}
								</button>

								<button
									type="button"
									onclick={() => openFile(file)}
									class="flex items-center gap-3 min-w-0 text-left"
								>
									<div
										class="size-10 rounded-xl overflow-hidden bg-muted/40 border border-border/40 grid place-items-center shrink-0"
									>
										{#if file.kind === "image" && file.url}
											<img
												src={file.url}
												alt={file.title}
												loading="lazy"
												class="w-full h-full object-cover"
											/>
										{:else}
											<Icon class="size-5 text-foreground/70" />
										{/if}
									</div>
									<span class="truncate text-sm font-medium text-foreground/90">
										{file.title}
									</span>
								</button>

								<span class="text-sm text-muted-foreground truncate">
									{formatDate(file.modifiedAt)}
								</span>
								<span class="text-sm text-muted-foreground tabular-nums">
									{formatSize(file.size) || "—"}
								</span>

								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												type="button"
												aria-label="More actions"
												onclick={(e) => e.stopPropagation()}
												class="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
											<Eye class="h-4 w-4 mr-3 text-muted-foreground" />
											Open
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onclick={() => downloadFile(file)}
											class="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
										>
											<Download class="h-4 w-4 mr-3 text-muted-foreground" />
											Download
										</DropdownMenu.Item>
										<DropdownMenu.Separator class="my-1 h-px bg-border/60" />
										<DropdownMenu.Item
											onclick={() => {
												clearSelection();
												selectedIds = new Set([file.id]);
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
	<Dialog.Content class="bg-background/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl max-w-md">
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
	<AlertDialog.Content class="bg-background/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl max-w-sm">
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {selectedIds.size} file{selectedIds.size === 1 ? "" : "s"}?</AlertDialog.Title>
			<AlertDialog.Description>
				This action cannot be undone. The selected files will be permanently removed from your library.
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
