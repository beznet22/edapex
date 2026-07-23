<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Dialog from "$lib/components/ui/dialog";
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
	import AlertCircle from "@lucide/svelte/icons/alert-circle";
	import CheckCheck from "@lucide/svelte/icons/check-check";
	import GitCommit from "@lucide/svelte/icons/git-commit";
	import BookOpen from "@lucide/svelte/icons/book-open";
	import ImageUp from "@lucide/svelte/icons/image-up";
	import FolderUp from "@lucide/svelte/icons/folder-up";
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import Users from "@lucide/svelte/icons/users";
	import SearchablePicker, {
		type SearchableItem,
	} from "$lib/components/library";
	import { generateId } from "ai";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { mobileUiState } from "$lib/state/mobile-ui.svelte";
	import { getPatches } from "$lib/state/manifest-patches.svelte";
	import { IsMobile } from "$lib/hooks/is-mobile.svelte";
	import {
		backgroundTasks,
		serializeTenant,
	} from "$lib/state/background-tasks.svelte";
	import { deriveKind, deriveCategory } from "$lib/utils/artifact-kind";
	import { cn } from "$lib/utils/shadcn";
	import { toast } from "svelte-sonner";
	import type { PageData } from "./$types";
	import type {
		Artifact,
		ArtifactCategory,
	} from "$lib/types/workspace-types";

	let { data }: { data: PageData } = $props();
	const inspector = useInspector();
	const isMobile = new IsMobile();
	const isThreadScoped = $derived(
		typeof data.threadId === "string" && data.threadId.length > 0,
	);

	let activeTermId = $state(data.activeTermId);
	let searchQuery = $state("");
	let categoryFilter = $state<
		"all" | "images" | "pdf" | "marksheet" | "shared" | "files"
	>("marksheet");
	let statusFilter = $state<Set<string>>(new Set());
	// TODO: re-plan categoryMulti filter — placeholder stubs to satisfy
	// type checking of the disabled dropdown section below.
	const categoryMulti = new Set<ArtifactCategory>();
	const toggleCategory = (_c: ArtifactCategory) => {};
	let viewMode = $state<"grid" | "list">("grid");
	let sortBy = $state<"name" | "modified" | "size">("modified");
	let sortDir = $state<"asc" | "desc">("desc");
	let selectedIds = $state<Set<string>>(new Set());

	let noteDialogOpen = $state(false);
	let noteName = $state("");
	let noteBody = $state("");
	let noteSaving = $state(false);
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let importPhotosInputRef = $state<HTMLInputElement | null>(null);
	let importPhotosFolderInputRef = $state<HTMLInputElement | null>(null);
	let deleteDialogOpen = $state(false);
	let isExtracting = $state(false);
	let isFormatting = $state(false);
	let isStartingChat = $state(false);
	let isClaiming = $state(false);
	let optimisticFiles = $state(new Map<string, Artifact>());
	let optimisticallyRemoved = $state(new Set<string>());
	let lastCompletedTime = $state(0);

	// Designation IDs allowed to bulk-import to the shared pool. Mirrors the
	// server-side gate in `+server.ts` for `/api/file/[...path]/PUT` so the
	// menu items don't show to users who would get a 403 anyway.
	const IMPORT_ALLOWED = new Set([1, 4, 5, 9]); // IT, Admin, Coordinator, IT Support
	const canImportShared = $derived(IMPORT_ALLOWED.has(data.tenant.designationId));
	const isSharedPhoto = (id: string) => id.startsWith("shared/photos/");
	const selectedPhotoCount = $derived(
		[...selectedIds].filter(isSharedPhoto).length,
	);

	function getInitials(name: string | null | undefined): string {
		if (!name) return "?";
		const parts = name.trim().split(/\s+/).filter(Boolean);
		const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
		return letters || "?";
	}

	const studentPickerItems = $derived<SearchableItem[]>(
		(data.classStudents ?? []).map((s) => ({
			id: s.id,
			label: s.name ?? "Unnamed",
			secondary: s.admissionNo ? `ADM${s.admissionNo}` : undefined,
			initials: getInitials(s.name),
			searchValue: `${s.name ?? ""} ${s.admissionNo ?? ""}`,
		})),
	);
	
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
		const onDrop = (e: DragEvent) => {
			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				queueUpload(Array.from(files));
			}
		};
		document.addEventListener("drop", onDrop);
		document.addEventListener("dragover", (e) => e.preventDefault());
		return () => {
			document.removeEventListener("drop", onDrop);
		};
	});

	// Sync optimistic files from background task progress
	$effect(() => {
		const tasks = backgroundTasks.tasks;
		const prev = optimisticFiles;
		const next = new Map(prev);
		let changed = false;

		for (const task of tasks) {
			if (
				task.spec.kind === "process-files" ||
				task.spec.kind === "format-batch"
			) {
				// Live file updates — add new entries AND propagate manifestStatus
				if (task.files) {
					for (const fileState of task.files) {
						if (!fileState.key) continue;
						const url = `/api/file/${fileState.key}`;
						const existing = next.get(url);

						if (existing) {
							if (
								fileState.manifestStatus &&
								fileState.manifestStatus !==
									existing.manifestStatus
							) {
								next.set(url, {
									...existing,
									manifestStatus: fileState.manifestStatus,
									status:
										fileState.status === "completed"
											? "success"
											: existing.status,
								});
								changed = true;
							}
							if (
								fileState.contentHash &&
								fileState.contentHash !== existing.contentHash
							) {
								next.set(url, {
									...existing,
									contentHash: fileState.contentHash,
								});
								changed = true;
							}
						} else {
							if (
								fileState.status !== "completed" &&
								fileState.status !== "formatting"
							)
								continue;
							const isFormatOutput =
								fileState.source === "format-output";
							next.set(url, {
								id: url,
								title: fileState.name,
								kind: deriveKind(fileState.name),
								category: deriveCategory(fileState.name),
								source: isFormatOutput
									? "generated"
									: "uploaded",
								url,
								saveUrl: url,
								size:
									fileState.compressedSize ??
									fileState.originalSize,
								modifiedAt: Date.now(),
								examTypeId:
									task.spec.kind === "process-files"
										? (task.spec.examTypeId ?? undefined)
										: undefined,
								status: isFormatOutput
									? "success"
									: "processing",
								manifestStatus: fileState.manifestStatus,
								contentHash: fileState.contentHash,
							});
							changed = true;
						}
					}
				}

				// Terminal result update
				if (task.status === "completed" && task.result) {
					for (const result of task.result.results) {
						if (!result.key) continue;
						const url = `/api/file/${result.key}`;
						const existing = next.get(url);
						if (!existing) {
							const name =
								result.key.split("/").pop() ?? result.key;
							next.set(url, {
								id: url,
								title: name,
								kind: deriveKind(name),
								category: deriveCategory(name),
								source:
									result.manifestStatus === "Formatted" ||
									result.manifestStatus === "Validated" ||
									result.manifestStatus === "Committed" ||
									result.manifestStatus === "Generated" ||
									result.manifestStatus === "Published"
										? "generated"
										: "uploaded",
								url,
								saveUrl: url,
								modifiedAt: Date.now(),
								status:
									result.status === "success"
										? "success"
										: "error",
								manifestStatus: result.manifestStatus,
								contentHash: result.contentHash,
							});
							changed = true;
							continue;
						}

						const updates: Partial<Artifact> = {};
						if (
							result.status === "success" &&
							existing.status !== "success"
						)
							updates.status = "success";
						if (
							result.manifestStatus &&
							result.manifestStatus !== existing.manifestStatus
						)
							updates.manifestStatus = result.manifestStatus;
						if (
							result.contentHash &&
							result.contentHash !== existing.contentHash
						)
							updates.contentHash = result.contentHash;

						if (Object.keys(updates).length > 0) {
							next.set(url, { ...existing, ...updates });
							changed = true;
						}
					}

					// Successful results mean the server has the file. Prune the
					// optimistic entry so the freshly-loaded `data.files` wins
					// on the next render (with full manifest metadata instead
					// of the partial optimistic state).
					for (const result of task.result.results) {
						if (result.status !== "success" || !result.key)
							continue;
						const url = `/api/file/${result.key}`;
						if (next.delete(url)) changed = true;
					}
				}
			}

			// OCR tasks — no live file states, only terminal results
			if (
				task.spec.kind === "ocr-batch" ||
				task.spec.kind === "ocr-single" ||
				task.spec.kind === "ocr-direct"
			) {
				if (task.status === "completed" && task.result) {
					for (const result of task.result.results) {
						if (!result.key) continue;
						const url = `/api/file/${result.key}`;
						const existing = next.get(url);

						if (
							result.status === "success" &&
							result.manifestStatus === "Extracted"
						) {
							if (existing) {
								const updates: Partial<Artifact> = {};
								if (
									existing.manifestStatus !==
									result.manifestStatus
								)
									updates.manifestStatus =
										result.manifestStatus;
								if (
									result.contentHash &&
									result.contentHash !== existing.contentHash
								)
									updates.contentHash = result.contentHash;
								if (Object.keys(updates).length > 0) {
									next.set(url, { ...existing, ...updates });
									changed = true;
								}
							} else {
								const name =
									result.key.split("/").pop() ?? result.key;
								next.set(url, {
									id: url,
									title: name,
									kind: deriveKind(name),
									category: deriveCategory(name),
									source: "uploaded",
									url,
									saveUrl: url,
									modifiedAt: Date.now(),
									status: "success",
									manifestStatus: result.manifestStatus,
									contentHash: result.contentHash,
								});
								changed = true;
							}
						}
					}
				}
			}

			// import-photos tasks — add results to optimisticFiles on
			// completion so the Shared tab shows the photo immediately
			// without waiting for a reload.
			if (task.spec.kind === "import-photos") {
				if (task.status === "completed" && task.result) {
					for (const result of task.result.results) {
						if (result.status !== "success" || !result.contentHash || !result.ext) continue;
						const ext = result.ext;
						const url = `/api/file/shared/photos/${result.contentHash}.${ext}`;
						const existing = next.get(url);
						if (!existing) {
							next.set(url, {
								id: `shared/photos/${result.contentHash}.${ext}`,
								title: result.key,
								kind: "image",
								category: "image",
								source: "uploaded",
								url,
								saveUrl: url,
								modifiedAt: Date.now(),
								status: "success",
							});
							changed = true;
						}
					}
				}
			}
		}

		if (changed) optimisticFiles = next;
	});

	function selectTerm(id: number) {
		activeTermId = id;
	}

	function toggleStatus(label: string) {
		const next = new Set(statusFilter);
		if (next.has(label)) next.delete(label);
		else next.add(label);
		statusFilter = next;
	}

	// TODO: re-plan categoryMulti filter
	// function toggleCategory(c: ArtifactCategory) {
	// 	const next = new Set(categoryMulti);
	// 	if (next.has(c)) next.delete(c);
	// 	else next.add(c);
	// 	categoryMulti = next;
	// }

	function matchStatus(label: string, file: Artifact): boolean {
		const raw = file.manifestStatus ?? file.marksheetStatus ?? "";
		switch (label) {
			case "Failed":
				return raw === "Failed";
			case "Processing":
				return raw === "Uploaded" || file.status === "processing";
			case "Extracted":
				return raw === "Extracted";
			case "Ready":
				return raw === "Formatted" || raw === "formatted";
			case "Validated":
				return raw === "Validated" || raw === "validated";
			case "Committed":
				return raw === "Committed" || raw === "committed";
			case "Generated":
				return raw === "Generated";
			case "Published":
				return raw === "Published";
			default:
				return false;
		}
	}

	const STATUS_FILTER_ITEMS: ReadonlyArray<{
		id: string;
		label: string;
		Icon: typeof AlertCircle;
	}> = [
		{ id: "Failed", label: "Failed", Icon: AlertCircle },
		{ id: "Processing", label: "Processing", Icon: Upload },
		{ id: "Extracted", label: "Extracted", Icon: ScanSearch },
		{ id: "Ready", label: "Ready", Icon: Check },
		{ id: "Validated", label: "Validated", Icon: CheckCheck },
		{ id: "Committed", label: "Committed", Icon: GitCommit },
		{ id: "Generated", label: "Generated", Icon: Sparkles },
		{ id: "Published", label: "Published", Icon: BookOpen },
	];

	function clearSelection() {
		selectedIds = new Set();
	}

	function toggleSelect(id: string) {
		if (isSharedPhoto(id)) {
			// Single-select for claimable photos. Clicking a different photo
			// replaces the selection; clicking the same photo deselects.
			selectedIds = selectedIds.has(id) ? new Set() : new Set([id]);
			return;
		}
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

	const mergedFiles = $derived.by(() => {
		const map = new Map<string, Artifact>();
		for (const f of data.files) map.set(f.url ?? f.id, f);
		for (const [, f] of optimisticFiles) {
			map.set(f.url ?? f.id, f);
		}
		for (const [url, patch] of Object.entries(getPatches())) {
			const existing = map.get(url);
			if (existing) {
				map.set(url, { ...existing, ...patch });
			}
		}
		return [...map.values()].filter((f) => !optimisticallyRemoved.has(f.url ?? f.id));
	});

	const filteredFiles = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const matched = mergedFiles.filter((f) => {
			if (q && !f.title.toLowerCase().includes(q)) return false;
			if (categoryFilter === "images" && f.kind !== "image") return false;
			if (categoryFilter === "pdf" && f.kind !== "pdf") return false;
			if (
				categoryFilter === "marksheet" &&
				!f.url?.includes("/marksheets/")
			)
				return false;
			if (categoryFilter === "shared" && !f.id?.startsWith("shared/")) return false;
			if (
				categoryFilter === "files" &&
				(f.kind === "image" ||
					f.kind === "pdf" ||
					f.url?.includes("/marksheets/") ||
					f.id?.startsWith("shared/"))
			)
				return false;
			if (
				statusFilter.size > 0 &&
				![...statusFilter].some((label) => matchStatus(label, f))
			)
				return false;
			// TODO: re-plan categoryMulti filter
			// if (
			// 	categoryMulti.size > 0 &&
			// 	(!f.category || !categoryMulti.has(f.category))
			// )
			// 	return false;
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

	function badgeConfig(
		file: Artifact,
	): { label: string; cls: string; pulse?: boolean } | null {
		const ms = file.manifestStatus ?? file.marksheetStatus;
		if (ms === "Failed")
			return {
				label: "Failed",
				cls: "bg-rose-400/15 text-rose-300",
				pulse: false,
			};
		if (ms === "Uploaded")
			return {
				label: "Processing",
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		if (ms === "Extracted")
			return { label: "Extracted", cls: "bg-sky-400/15 text-sky-300" };
		if (ms === "Formatted" || ms === "formatted")
			return {
				label: "Ready",
				cls: "bg-emerald-400/15 text-emerald-300",
			};
		if (ms === "Validated" || ms === "validated")
			return {
				label: "Validated",
				cls: "bg-emerald-400/15 text-emerald-300",
			};
		if (ms === "Committed" || ms === "committed")
			return {
				label: "Committed",
				cls: "bg-emerald-400/15 text-emerald-300",
			};
		if (ms === "Generated")
			return {
				label: "Generated",
				cls: "bg-emerald-400/15 text-emerald-300",
			};
		if (ms === "Published")
			return {
				label: "Published",
				cls: "bg-emerald-400/15 text-emerald-300",
			};
		if (file.status === "processing")
			return {
				label: "Processing",
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		return null;
	}

	function taskBadge(task: {
		phase?: string;
		status: string;
		rateLimitInfo?: { countdownEnd: number };
		message?: string;
	}): { label: string; cls: string; pulse?: boolean } | null {
		if (task.rateLimitInfo) {
			const remaining = Math.max(
				0,
				Math.ceil(
					(task.rateLimitInfo.countdownEnd - Date.now()) / 1000,
				),
			);
			return {
				label: `Rate limited — retry in ${remaining}s`,
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		}
		if (task.phase === "format" && task.status === "running")
			return {
				label: "Formatting…",
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		if (task.phase === "ocr" && task.status === "running")
			return {
				label: "Extracting…",
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		if (task.status === "running")
			return {
				label: "Processing…",
				cls: "bg-amber-400/15 text-amber-300",
				pulse: true,
			};
		return null;
	}

	function openFile(file: Artifact) {
		if (file.status === "processing") return; // not ready to open yet
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
		return `exams/examType-${activeTermId}/notes/`;
	}

	function uploadPrefix(): string {
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

	async function handleImportPhotos(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const files = Array.from(input.files).map((f) => ({ file: f, name: f.name }));
		input.value = ""; // reset so the same files can be re-picked
		if (files.length === 0) return;
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
			userRole: data.tenant.userRole,
		});
		backgroundTasks.runTask({
			kind: "import-photos",
			files,
			tenant,
		});
		toast.info(
			`Importing ${files.length} file${files.length === 1 ? "" : "s"} to shared/photos/…`,
		);
	}

	async function handleClaim(item: SearchableItem) {
		if (isClaiming) return;
		const photoId = [...selectedIds][0];
		const photo = filteredFiles.find((f) => f.id === photoId);
		if (!photo) return;
		const key = photo.url ?? photo.id;
		optimisticallyRemoved = new Set([...optimisticallyRemoved, key]);
		clearSelection();
		isClaiming = true;
		try {
			const res = await fetch("/api/photos/claim", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: photo.url, studentId: item.id }),
			});
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new Error(body || `Claim failed: ${res.status}`);
			}
			await invalidateAll();
			optimisticallyRemoved = new Set([...optimisticallyRemoved].filter((k) => k !== key));
			toast.success(`Claimed ${photo.title} for ${item.label}`);
		} catch (err) {
			optimisticallyRemoved = new Set([...optimisticallyRemoved].filter((k) => k !== key));
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to claim: ${message}`);
		} finally {
			isClaiming = false;
		}
	}

	function queueUpload(files: File[]): void {
		if (files.length === 0) return;

		const prefix = uploadPrefix();
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
			userRole: data.tenant.userRole,
		});

		backgroundTasks.runTask({
			kind: "process-files",
			files: files.map((f) => ({ file: f, name: f.name })),
			tenant,
			prefix,
			examTypeId: activeTermId,
		});

		toast.info(
			`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`,
		);
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
				`/api/file/${path}?examTypeId=${activeTermId}&kind=note`,
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
				.map((f) => {
					const relPath =
						(f as any).url?.replace("/api/file/", "") ?? f.id;
					const ch = (f as any).contentHash ?? relPath;
					return btoa(
						JSON.stringify({
							k: ch,
							p: relPath,
							n: f.title,
							m:
								(f as any).mimeType ??
								"application/octet-stream",
							c: ch,
							d: (f as any).documentId ?? ch,
						}),
					);
				})
				.map(encodeURIComponent)
				.join(",");
			clearSelection();
			await goto(`/chat/${chatId}?refs=${keys}`);
		} finally {
			isStartingChat = false;
		}
	}

	async function extractSelected() {
		if (eligibleExtractFiles.length === 0) return;
		const keys = eligibleExtractFiles.map((f) => f.id);
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
				userRole: data.tenant.userRole,
			});
			backgroundTasks.runTask({ kind: "ocr-batch", keys, tenant });
			toast.info(
				`Queued ${keys.length} file${keys.length === 1 ? "" : "s"} for OCR`,
			);
			clearSelection();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to queue extraction: ${message}`);
		} finally {
			isExtracting = false;
		}
	}

	async function formatSelected() {
		if (eligibleFormatFiles.length === 0) return;
		const keys = eligibleFormatFiles.map((f) => f.id);
		const contentHashes = Object.fromEntries(
			eligibleFormatFiles
				.filter((f) => f.contentHash)
				.map((f) => [f.id, f.contentHash!]),
		);
		isFormatting = true;
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
				userRole: data.tenant.userRole,
			});
			backgroundTasks.runTask({
				kind: "format-batch",
				keys,
				contentHashes,
				tenant,
			});
			toast.info(
				`Queued ${keys.length} file${keys.length === 1 ? "" : "s"} for formatting`,
			);
			clearSelection();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			toast.error(`Failed to queue formatting: ${message}`);
		} finally {
			isFormatting = false;
		}
	}

	async function confirmDelete() {
		const ids = [...selectedIds];
		const keys = ids.map((id) => {
			const file = filteredFiles.find((f) => f.id === id);
			return file ? (file.url ?? file.id) : id;
		});
		optimisticallyRemoved = new Set([...optimisticallyRemoved, ...keys]);
		deleteDialogOpen = false;
		clearSelection();
		try {
			await Promise.all(
				ids.map((id) => fetch(`/api/file/${id}`, { method: "DELETE" })),
			);
			await invalidateAll();
			optimisticallyRemoved = new Set([...optimisticallyRemoved].filter((k) => !keys.includes(k)));
			toast.success(
				`Deleted ${ids.length} file${ids.length === 1 ? "" : "s"}`,
			);
		} catch (err) {
			optimisticallyRemoved = new Set([...optimisticallyRemoved].filter((k) => !keys.includes(k)));
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

	const eligibleExtractFiles = $derived(
		filteredFiles.filter(
			(f) => selectedIds.has(f.id) && f.manifestStatus === "Uploaded",
		),
	);
	const eligibleFormatFiles = $derived(
		filteredFiles.filter(
			(f) => selectedIds.has(f.id) && f.manifestStatus === "Extracted",
		),
	);
	const activeFilterCount = $derived(statusFilter.size);
	const bulkActionsVisible = $derived(selectedIds.size > 0);
</script>

<svelte:head>
	<title>{isThreadScoped ? "Thread artifacts" : "Library"} · Edapex</title>
</svelte:head>

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
							{#if canImportShared}
								<DropdownMenu.Separator
									class="my-2 h-px bg-border/60"
								/>
								<DropdownMenu.Item
									onclick={() => importPhotosInputRef?.click()}
									class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
								>
									<ImageUp
										class="h-4 w-4 mr-3 text-muted-foreground"
									/>
									Import photos
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={() => importPhotosFolderInputRef?.click()}
									class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
								>
									<FolderUp
										class="h-4 w-4 mr-3 text-muted-foreground"
									/>
									Import photo folder
								</DropdownMenu.Item>
							{/if}
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
					<input
						bind:this={importPhotosInputRef}
						type="file"
						accept="image/*"
						multiple
						class="hidden"
						onchange={handleImportPhotos}
					/>
					<input
						bind:this={importPhotosFolderInputRef}
						type="file"
						webkitdirectory
						class="hidden"
						onchange={handleImportPhotos}
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
						disabled={isExtracting ||
							eligibleExtractFiles.length === 0}
						onclick={extractSelected}
					>
						<ScanSearch class="size-3.5" />
						Extract
						{#if eligibleExtractFiles.length > 0 && eligibleExtractFiles.length < selectedIds.size}
							<span class="text-muted-foreground/60"
								>({eligibleExtractFiles.length})</span
							>
						{/if}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						disabled={isFormatting ||
							eligibleFormatFiles.length === 0}
						onclick={formatSelected}
					>
						<Sparkles class="size-3.5" />
						Format
						{#if eligibleFormatFiles.length > 0 && eligibleFormatFiles.length < selectedIds.size}
							<span class="text-muted-foreground/60"
								>({eligibleFormatFiles.length})</span
							>
						{/if}
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
					{#if selectedPhotoCount === 1}
						<SearchablePicker
							items={studentPickerItems}
							triggerLabel="Claim for student"
							triggerIcon={UserPlus}
							onSelect={handleClaim}
							placeholder="Search by name or ADM…"
							emptyText="No student found."
							disabled={isClaiming}
							class="h-9 px-3.5 rounded-full gap-1.5 text-xs font-bold"
						/>
					{/if}
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
						{#each [{ id: "all", label: "All" }, { id: "images", label: "Images" }, { id: "pdf", label: "PDF" }, { id: "marksheet", label: "MarkSheet" }, { id: "shared", label: "Shared" }, { id: "files", label: "Files" }] as tab (tab.id)}
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
										Status
									</DropdownMenu.GroupHeading>
									{#each STATUS_FILTER_ITEMS as item (item.id)}
										<DropdownMenu.CheckboxItem
											checked={statusFilter.has(item.id)}
											onCheckedChange={() =>
												toggleStatus(item.id)}
											class="px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
										>
											<item.Icon
												class="h-4 w-4 mr-3 text-muted-foreground"
											/>
											{item.label}
										</DropdownMenu.CheckboxItem>
									{/each}
								</DropdownMenu.Group>

								<!-- TODO: re-plan categoryMulti filter -->
								{#if false}
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
												checked={categoryMulti.has(
													item.id,
												)}
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
								{/if}
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
						{:else if categoryFilter === "shared"}
							No shared files yet. {canImportShared ? "Use 'Import photos' from the New menu to add some." : ""}
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
						{@const displayName = file.title.replace(
							/\.[a-z0-9]+$/i,
							"",
						)}
						{@const badge = badgeConfig(file)}
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
								{#if badge}
									<span class="text-white/40 drop-shadow-sm">·</span>
									<span
										class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular-nums drop-shadow-sm {badge.cls}"
									>
										{#if badge.pulse}
											<span
												class="size-1.5 rounded-full bg-amber-400 animate-pulse"
											></span>
										{/if}
										{badge.label}
									</span>
								{:else}
									<span
										class="text-white/40"
										aria-hidden="true">·</span
									>
									<span
										class="tabular-nums text-white/60 drop-shadow-sm"
										>{formatSize(file.size) || "—"}</span
									>
								{/if}
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
							{@const badge = badgeConfig(file)}
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
								<span class="hidden sm:inline">
									{#if badge}
										<span
											class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium {badge.cls}"
										>
											{#if badge.pulse}
												<span
													class="size-1.5 rounded-full bg-amber-400 animate-pulse"
												/>
											{/if}
											{badge.label}
										</span>
									{:else}
										<span
											class="text-sm tabular-nums text-muted-foreground"
										>
											{formatSize(file.size) || "—"}
										</span>
									{/if}
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

<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md p-0 gap-0 overflow-hidden [&>button]:hidden" showCloseButton={false}>
		<div class="p-6 sm:p-8">
			<div class="mx-auto flex size-12 sm:size-14 items-center justify-center rounded-full bg-destructive/10 mb-4 sm:mb-5 shrink-0">
				<Trash2 class="size-5 sm:size-6 text-destructive" />
			</div>
			<Dialog.Header class="text-center sm:text-center gap-1.5">
				<Dialog.Title class="text-base sm:text-lg font-semibold">
					Delete {selectedIds.size} file{selectedIds.size === 1 ? "" : "s"}?
				</Dialog.Title>
				<Dialog.Description class="text-sm text-muted-foreground leading-relaxed">
					This action cannot be undone. The selected files will be permanently removed from your library.
				</Dialog.Description>
			</Dialog.Header>
		</div>
		<Dialog.Footer class="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 sm:pt-0 flex-col-reverse sm:flex-row gap-2.5">
			<button
				onclick={() => (deleteDialogOpen = false)}
				class="flex-1 sm:flex-none inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:border-border/80 active:scale-[0.98]"
			>Cancel</button>
			<button
				onclick={confirmDelete}
				class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
			>
				<Trash2 class="size-3.5" />
				Delete
			</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
