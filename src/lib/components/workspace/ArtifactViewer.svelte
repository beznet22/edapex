<script lang="ts">
	import type { Artifact } from "$lib/types/workspace-types";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { cn } from "$lib/utils/shadcn";
	import FileIcon from "@lucide/svelte/icons/file";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SaveIcon from "@lucide/svelte/icons/save";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import MoreVerticalIcon from "@lucide/svelte/icons/more-vertical";
	import Share2Icon from "@lucide/svelte/icons/share-2";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import SendIcon from "@lucide/svelte/icons/send";
	import EditorCanvas from "./editor-canvas.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { useChat } from "$lib/context/chat-context.svelte";
	import {
		deriveDocumentId,
		documentStreams,
		type DocumentStreamEntry,
	} from "$lib/context/thread-data.svelte";
	import Markdown from "$lib/components/prompt-kit/markdown/Markdown.svelte";
	import { autoFixStructure } from "$lib/utils/marksheet-ast-parser";

	let {
		artifacts,
		activeId,
		mode,
		user,
	}: {
		artifacts: Artifact[];
		activeId?: string;
		mode: "chat" | "filestore";
		user?: { designation?: string };
	} = $props();

	const inspector = useInspector();
	const chat = useChat();

	const toolPart = $derived.by(() => {
		if (!inspector.activeChatArtifactId || !chat) return null;
		for (const message of chat.messages) {
			for (const part of message.parts ?? []) {
				const p = part as {
					type?: string;
					toolCallId?: string;
					state?: string;
					input?: { contentHash?: string; fileName?: string };
					output?: {
						artifactId?: string;
						contentHash?: string;
						fileName?: string;
						initialMarkdownPath?: string;
						persistedMarkdownPath?: string;
						title?: string;
						validatedTitle?: string;
						studentId?: number | null;
						examTypeId?: number | null;
						academicId?: number | null;
						studentFullName?: string | null;
						adminNo?: number | null;
						documentId?: string;
					};
					errorText?: string;
				};
				if (
					p.type === "tool-streamDocument" &&
					deriveDocumentId(p.input ?? {}) ===
						inspector.activeChatArtifactId
				) {
					return p;
				}
			}
		}
		return null;
	});

	// Live streaming content. Module-level `$state` proxy shared across
	// the app; ArtifactViewer reads via direct import (not via `chat`).
	const entry = $derived.by((): DocumentStreamEntry | null => {
		const activeId = inspector.activeChatArtifactId;
		if (!activeId) return null;
		return documentStreams[activeId] ?? null;
	});

	const effectiveStatus = $derived.by(() => {
		if (toolPart?.state === "output-available") return "success";
		if (toolPart?.state === "output-error") return "error";
		if (entry?.status) return entry.status;
		return "processing";
	});

	/**
	 * Validation output for the same document. validate-marksheet runs in
	 * a subsequent message (after the user clicks Validate and the
	 * hitlVerifyStep resumes). We find it by matching input.studentId
	 * against the active streamDocument's output.studentId. If the
	 * streamDocument didn't carry a studentId (upload wasn't linked yet),
	 * we don't have a reliable match — fall back to streamDocument output.
	 */
	const validationOutput = $derived.by(() => {
		if (!chat) return null;
		const streamOutput =
			toolPart?.state === "output-available" ? toolPart.output : null;
		const streamStudentId = streamOutput?.studentId ?? null;
		if (streamStudentId === null || streamStudentId === undefined)
			return null;
		for (const message of chat.messages) {
			for (const part of message.parts ?? []) {
				const p = part as {
					type?: string;
					state?: string;
					input?: { studentId?: number };
					output?: {
						persistedMarkdownPath?: string;
						validatedTitle?: string;
						currentMarkdownPath?: string;
						documentId?: string;
						artifactId?: string;
					};
				};
				if (
					p.type === "tool-validate-marksheet" &&
					p.state === "output-available" &&
					p.input?.studentId === streamStudentId
				) {
					return p.output ?? null;
				}
			}
		}
		return null;
	});

	/**
	 * Unified shape of the merged tool output. Both `streamDocument` and
	 * `validate-marksheet` write to `part.output`; we merge them so the
	 * UI sees a single flat object. All fields optional because either
	 * tool may have run without the other, or the schema may evolve.
	 */
	type MergedToolOutput = {
		artifactId?: string;
		contentHash?: string;
		fileName?: string;
		initialMarkdownPath?: string;
		persistedMarkdownPath?: string;
		title?: string;
		validatedTitle?: string;
		marksheetStatus?: string;
		studentId?: number | null;
		examTypeId?: number | null;
		academicId?: number | null;
		studentFullName?: string | null;
		adminNo?: number | null;
		documentId?: string;
		currentMarkdownPath?: string;
		parentName?: string | null;
		parentEmail?: string | null;
	};

	/**
	 * Tool output captured from `part.output` when the tool completes.
	 * Merges streamDocument output (filename-based title + initialMarkdownPath)
	 * with validate-marksheet output (validatedTitle + persistedMarkdownPath).
	 * Validation fields win because they supersede the working fields.
	 */
	const toolOutput = $derived.by((): MergedToolOutput | null => {
		const streamOutput =
			toolPart?.state === "output-available" ? toolPart.output : null;
		if (!streamOutput && !validationOutput) return null;
		if (!validationOutput && streamOutput)
			return streamOutput as MergedToolOutput;
		if (!streamOutput && validationOutput)
			return validationOutput as MergedToolOutput;
		return { ...streamOutput, ...validationOutput } as MergedToolOutput;
	});

	const persistedMarkdownPath = $derived(
		toolOutput?.persistedMarkdownPath ??
			toolOutput?.initialMarkdownPath ??
			null,
	);

	const displayTitle = $derived(
		toolOutput?.validatedTitle ?? toolOutput?.title ?? "Untitled",
	);

	// PDF URL: either derived from the API response (after generate) or probed.
	let pdfStoragePath = $state<string | null>(null);
	let pdfGenerating = $state(false);

	const pdfUrl = $derived.by(() => {
		if (pdfStoragePath) return `/api/file/${pdfStoragePath}`;
		if (!persistedMarkdownPath) return null;
		const swapped = persistedMarkdownPath.replace(/\.md$/i, ".pdf");
		return `/api/file/${swapped}`;
	});

	let viewMode = $state<"markdown" | "validate" | "pdf">("markdown");
	let pdfAvailable = $state(false);
	let pdfProbeSeq = 0;

	let validateLoading = $state(false);
	let validateLoadingText = $state("");
	let validationExplanation = $state<string | null>(null);

	$effect(() => {
		const url = pdfUrl;
		if (!url) {
			pdfAvailable = false;
			return;
		}
		const seq = ++pdfProbeSeq;
		fetch(url, { method: "HEAD" })
			.then((r) => {
				if (seq !== pdfProbeSeq) return;
				pdfAvailable = r.ok;
				if (!r.ok && viewMode === "pdf") viewMode = "markdown";
			})
			.catch(() => {
				if (seq !== pdfProbeSeq) return;
				pdfAvailable = false;
				if (viewMode === "pdf") viewMode = "markdown";
			});
	});

	let editorRef = $state<
		{ save: () => Promise<boolean> | void; copy: () => void } | undefined
	>(undefined);

	async function triggerDownload(path: string, filename: string) {
		try {
			const res = await fetch(`/api/file/${path}`);
			if (!res.ok) {
				import("svelte-sonner").then((m) =>
					m.toast.error(`Download failed: ${res.status}`),
				);
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (e) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Download failed",
				),
			);
		}
	}

	function extractStudentIds(): {
		studentId: number | null;
		examTypeId: number | null;
		academicId: number | null;
		studentFullName: string | null;
		adminNo: number | null;
	} {
		if (toolOutput) {
			return {
				studentId: toolOutput.studentId ?? null,
				examTypeId: toolOutput.examTypeId ?? null,
				academicId: toolOutput.academicId ?? null,
				studentFullName: toolOutput.studentFullName ?? null,
				adminNo: toolOutput.adminNo ?? null,
			};
		}
		if (current?.id) {
			const match = current.id.match(/^pdf-(\d+)-(\d+)$/);
			if (match) {
				return {
					studentId: Number(match[1]),
					examTypeId: Number(match[2]),
					academicId: null,
					studentFullName: null,
					adminNo: null,
				};
			}
		}
		const path = persistedMarkdownPath ?? validatePath;
		if (path) {
			const match = path.match(/ADM(\d+)-(\d+)-(.+?)\.md$/);
			if (match) {
				return {
					adminNo: Number(match[1]),
					studentId: null,
					examTypeId: Number(match[2]),
					academicId: null,
					studentFullName: match[3].replace(/_/g, " ") ?? null,
				};
			}
		}
		return {
			studentId: null,
			examTypeId: null,
			academicId: null,
			studentFullName: null,
			adminNo: null,
		};
	}

	async function handleDownload() {
		const ids = extractStudentIds();
		if (!ids.studentId || !ids.examTypeId) {
			if (current?.url) {
				handleDownloadRaw();
				return;
			}
			import("svelte-sonner").then((m) =>
				m.toast.error(
					"No student data available — cannot generate PDF",
				),
			);
			return;
		}

		pdfGenerating = true;
		try {
			const res = await fetch("/api/results/generate-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId: ids.studentId,
					examTypeId: ids.examTypeId,
					academicId: ids.academicId,
					fullName: ids.studentFullName,
					admissionNo: ids.adminNo,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);

			const binary = Uint8Array.from(atob(data.pdfBase64), (c) =>
				c.charCodeAt(0),
			);
			const blob = new Blob([binary], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = data.filename ?? "result.pdf";
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);

			pdfStoragePath = data.storagePath;
			viewMode = "pdf";
		} catch (e) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Download failed",
				),
			);
		} finally {
			pdfGenerating = false;
		}
	}

	async function handleToggleView() {
		if (viewMode === "pdf" || viewMode === "validate") {
			viewMode = "markdown";
			return;
		}
		const committedOrPublished =
			marksheetStatus === "committed" || marksheetStatus === "published";
		if (!committedOrPublished) {
			viewMode = "validate";
			return;
		}
		if (pdfAvailable && pdfUrl) {
			viewMode = "pdf";
			return;
		}
		const ids = extractStudentIds();
		if (!ids.studentId || !ids.examTypeId) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					"No student data available — cannot generate PDF",
				),
			);
			return;
		}

		pdfGenerating = true;
		try {
			const res = await fetch("/api/results/generate-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId: ids.studentId,
					examTypeId: ids.examTypeId,
					academicId: ids.academicId,
					fullName: ids.studentFullName,
					admissionNo: ids.adminNo,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (data.error) throw new Error(data.error);

			pdfStoragePath = data.storagePath;
			viewMode = "pdf";
		} catch (e) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Failed to generate PDF",
				),
			);
		} finally {
			pdfGenerating = false;
		}
	}

	async function handleValidate() {
		const path = validatePath;
		if (!path) {
			import("svelte-sonner").then((m) =>
				m.toast.error("No marksheet markdown to validate"),
			);
			return;
		}

		const ids = extractStudentIds();

		validateLoading = true;
		validateLoadingText = "Validating marksheet...";
		validationExplanation = null;
		try {
			const res = await fetch("/api/results/validate-marksheet", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId: ids.studentId,
					examTypeId: ids.examTypeId,
					academicId: ids.academicId,
					admissionNo: ids.adminNo,
					fullName: ids.studentFullName,
					currentMarkdownPath: path,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			if (data.ok) {
				viewMode = "markdown";
				import("svelte-sonner").then((m) =>
					m.toast.success("Marksheet validated successfully"),
				);
			} else if (data.explanation) {
				validationExplanation = data.explanation;
			} else {
				import("svelte-sonner").then((m) =>
					m.toast.error(data.error ?? "Validation failed"),
				);
			}
		} catch (e) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Validation failed",
				),
			);
		} finally {
			validateLoading = false;
			validateLoadingText = "";
		}
	}

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);
	const current = $derived.by((): Artifact | null => {
		const found = artifacts.find((a) => a.id === viewingId);
		if (found) return found;
		// Streamed documents are not added to inspector.chatArtifacts, but the
		// workspace panel still needs a current artifact to render header actions.
		// Status is computed from primitives to avoid a circular dependency with
		// `effectiveStatus` (which reads `current?.status`).
		const syntheticStatus =
			toolPart?.state === "output-available"
				? "success"
				: toolPart?.state === "output-error"
					? "error"
					: (entry?.status ?? "processing");
		if (syntheticStatus === "success" && persistedMarkdownPath) {
			const rawContent = entry?.content ?? "";
			const { fixedMd } = autoFixStructure(rawContent);
			return {
				id: viewingId,
				title: displayTitle,
				kind: "document" as const,
				content: fixedMd,
				url: `/api/file/${persistedMarkdownPath}`,
				saveUrl: `/api/file/${persistedMarkdownPath}`,
				status: "success" as const,
			};
		}
		return null;
	});

	const marksheetStatus = $derived.by((): string | null => {
		if (toolOutput?.marksheetStatus) return toolOutput.marksheetStatus;
		if (current?.marksheetStatus) return current.marksheetStatus;
		return null;
	});

	/** Path to the marksheet file for validation. Falls back to current.url
	 *  in filestore mode where toolOutput is not available. */
	const validatePath = $derived(
		persistedMarkdownPath ??
			(mode === "filestore" && current?.url
				? current.url.replace("/api/file/", "")
				: null),
	);
	// Effective streaming state: prefer the merged tool output / stream-entry
	// status so the header actions are disabled while the artifact is still
	// being formatted by `streamDocument` or persisted by `validate-marksheet`,
	// not just while the artifact card itself reports `processing`.
	const isStreaming = $derived(
		(toolPart !== null || entry !== null) &&
			(effectiveStatus === "streaming" ||
				effectiveStatus === "processing"),
	);

	async function handleSave() {
		if (editorRef) {
			await editorRef.save();
		}
	}

	function handleCopy() {
		if (editorRef) {
			editorRef.copy();
		} else if (current?.content) {
			navigator.clipboard.writeText(current.content);
		}
	}

	let publishDialogOpen = $state(false);
	let publishState = $state<{
		parentName: string;
		parentEmail: string;
		studentName: string;
		loading: boolean;
		loadingText: string;
	} | null>(null);

	function handlePublishClick() {
		if (!toolOutput?.parentName && !toolOutput?.parentEmail) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					"No parent contact info available for this student",
				),
			);
			return;
		}
		publishState = {
			parentName: toolOutput?.parentName ?? "Parent/Guardian",
			parentEmail: toolOutput?.parentEmail ?? "",
			studentName:
				toolOutput?.studentFullName ??
				toolOutput?.validatedTitle ??
				"Student",
			loading: false,
			loadingText: "",
		};
		publishDialogOpen = true;
	}

	async function handlePublishConfirm() {
		if (!toolOutput) return;
		const { studentId, examTypeId, academicId, studentFullName, adminNo } =
			toolOutput;
		if (!studentId || !examTypeId) return;

		if (!publishState) return;
		publishState.loading = true;
		publishState.loadingText = "Generating PDF...";

		try {
			const res = await fetch("/api/results/publish-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					studentId,
					examTypeId,
					academicId,
					fullName: studentFullName,
					admissionNo: adminNo,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			publishDialogOpen = false;
			if (data.status === "published") {
				import("svelte-sonner").then((m) =>
					m.toast.success(`Result published to ${data.parentEmail}`),
				);
			} else if (data.status === "skipped_already_published") {
				import("svelte-sonner").then((m) =>
					m.toast.info(
						`Result already published to ${data.parentEmail}`,
					),
				);
			} else {
				import("svelte-sonner").then((m) =>
					m.toast.error(data.error ?? "Publish failed"),
				);
			}
		} catch (e) {
			publishDialogOpen = false;
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Publish failed",
				),
			);
		} finally {
			if (publishState) {
				publishState.loading = false;
				publishState.loadingText = "";
			}
		}
	}

	function handleDownloadRaw() {
		if (!current?.url) return;
		const a = document.createElement("a");
		a.href =
			current.url +
			(current.url.includes("?") ? "&" : "?") +
			"action=download";
		a.download = current.title;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function formatSize(bytes?: number): string {
		if (!bytes) return "";
		const k = 1024;
		if (bytes < k) return bytes + " B";
		if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
		return (bytes / (k * k)).toFixed(1) + " MB";
	}

	async function handleShare() {
		if (!current?.url) return;
		const relPath = current.url.replace("/api/file/", "");
		const wsIdx = (current.id ?? "").indexOf("exams/");
		const workspace =
			wsIdx !== -1 ? (current.id ?? "").slice(0, wsIdx - 1) : "";
		try {
			const res = await fetch("/api/file/share", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key: relPath, workspace }),
			});
			if (!res.ok) throw new Error("Share failed");
			const data = await res.json();
			if (data.url) {
				await navigator.clipboard.writeText(data.url);
				import("svelte-sonner").then((m) =>
					m.toast.success("Share link copied to clipboard"),
				);
			}
		} catch {
			import("svelte-sonner").then((m) =>
				m.toast.error("Failed to generate share link"),
			);
		}
	}

	function handlePrint() {
		if (!current?.content) return;
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(
			`<!DOCTYPE html><html><head><title>${current.title}</title></head><body>${current.content}</body></html>`,
		);
		win.document.close();
		win.focus();
		win.print();
	}

	let deleteOpen = $state(false);

	async function handleDelete() {
		if (!current?.url) return;
		try {
			const res = await fetch(current.url, { method: "DELETE" });
			if (!res.ok) throw new Error("Delete failed");
			inspector.close();
		} catch {
			import("svelte-sonner").then((m) =>
				m.toast.error("Failed to delete file"),
			);
		}
	}
</script>

<div class="flex flex-col h-full min-h-0 bg-background">
	<header
		class="flex items-center justify-between h-12 px-2 sm:px-4 shrink-0 gap-2 min-w-0 w-full"
	>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 shrink-0"
						onclick={() => inspector.close()}
						aria-label="Close workspace"
					>
						<ArrowLeftIcon class="size-4" />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Close workspace</Tooltip.Content>
		</Tooltip.Root>

		<div class="flex items-center min-w-0 flex-1 gap-1">
			{#if artifacts.length > 1}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="h-8 px-2 text-[13px] font-semibold text-foreground hover:bg-muted/40 hover:text-foreground flex items-center gap-2 min-w-0 max-w-full"
							>
								<FileIcon
									class="size-4 text-primary/80 shrink-0"
								/>
								<span class="truncate text-left block min-w-0"
									>{displayTitle}</span
								>
								<ChevronDownIcon
									class="size-3.5 text-muted-foreground shrink-0"
								/>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="start"
						class="w-64 bg-popover backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl"
					>
						<DropdownMenu.Label
							class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5"
						>
							{mode === "chat"
								? "Artifacts in thread"
								: "Open file"}
						</DropdownMenu.Label>
						{#each artifacts as artifact (artifact.id)}
							<DropdownMenu.Item
								class={cn(
									"text-[12px] font-medium rounded-lg cursor-pointer my-0.5",
									viewingId === artifact.id
										? "bg-primary/15 text-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
								)}
								onclick={() =>
									inspector.openChatArtifact(artifact.id)}
							>
								<FileTextIcon class="size-3 mr-2 shrink-0" />
								<span class="truncate">{artifact.title}</span>
								{#if viewingId === artifact.id}
									<CheckIcon
										class="size-3 ml-auto text-primary shrink-0"
									/>
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<div class="flex items-center gap-2 min-w-0 px-2">
					<FileIcon class="size-4 text-primary/80 shrink-0" />
					<span
						class="truncate text-[13px] font-semibold text-foreground"
					>
						{displayTitle}
					</span>
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-1 shrink-0">
			{#if current}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
								onclick={handleCopy}
								disabled={isStreaming || pdfGenerating}
								aria-label="Copy artifact"
							>
								<CopyIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content
						>{isStreaming
							? "Copy (available when streaming finishes)"
							: "Copy"}</Tooltip.Content
					>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
								onclick={handleToggleView}
								disabled={isStreaming ||
									pdfGenerating ||
									validateLoading}
								aria-label={viewMode === "markdown"
									? marksheetStatus === "committed" ||
										marksheetStatus === "published"
										? "View PDF"
										: "Validate marksheet"
									: "View markdown"}
							>
								{#if viewMode === "pdf"}
									<EyeOffIcon class="size-4" />
								{:else if viewMode === "validate"}
									<EyeOffIcon class="size-4" />
								{:else}
									<EyeIcon class="size-4" />
								{/if}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>
						{viewMode === "pdf"
							? "View markdown"
							: viewMode === "validate"
								? "View markdown"
								: pdfGenerating
									? "Generating PDF…"
									: marksheetStatus === "committed" ||
										  marksheetStatus === "published"
										? "View PDF"
										: "Validate marksheet"}
					</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
								onclick={handleDownload}
								disabled={isStreaming || pdfGenerating}
								aria-label="Download PDF"
							>
								<DownloadIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content
						>{pdfGenerating
							? "Generating PDF…"
							: "Download PDF"}</Tooltip.Content
					>
				</Tooltip.Root>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
								disabled={isStreaming || pdfGenerating}
								aria-label="More actions"
							>
								<MoreVerticalIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="end"
						class="w-44 bg-popover backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl"
					>
						<DropdownMenu.Item
							onclick={handleSave}
							disabled={isStreaming}
						>
							<SaveIcon class="size-3.5 mr-2" />
							Save
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onclick={handleShare}
							disabled={isStreaming}
						>
							<Share2Icon class="size-3.5 mr-2" />
							Share
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onclick={handlePrint}
							disabled={isStreaming}
						>
							<PrinterIcon class="size-3.5 mr-2" />
							Print
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onclick={handlePublishClick}
							disabled={isStreaming}
						>
							<SendIcon class="size-3.5 mr-2" />
							Publish
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item
							onclick={() => (deleteOpen = true)}
							class="text-destructive focus:text-destructive"
							disabled={isStreaming}
						>
							<Trash2Icon class="size-3.5 mr-2" />
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</header>

	<div class="flex-1 h-full relative group">
		{#if viewMode === "validate"}
			<div
				class="h-full flex flex-col items-center justify-center gap-6 px-8"
			>
				{#if validateLoading}
					<div class="flex flex-col items-center gap-3">
						<div
							class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin"
						/>
						<p class="text-sm text-muted-foreground">
							{validateLoadingText}
						</p>
					</div>
				{:else if validationExplanation}
					<ScrollArea class="h-full w-full">
						<div class="p-6 max-w-3xl mx-auto">
							<Markdown content={validationExplanation} />
						</div>
					</ScrollArea>
					<div class="pb-6 shrink-0">
						<Button onclick={handleValidate}>
							<CheckIcon class="size-4 mr-2" />
							Retry validation
						</Button>
					</div>
				{:else}
					<div
						class="flex flex-col items-center gap-4 max-w-md text-center"
					>
						<p class="text-sm text-muted-foreground">
							Validate this marksheet to check for errors and
							persist the structured data.
						</p>
						<Button size="lg" onclick={handleValidate}>
							<CheckIcon class="size-4 mr-2" />
							Validate marksheet
						</Button>
					</div>
				{/if}
			</div>
		{:else if persistedMarkdownPath && viewMode === "pdf" && pdfAvailable && pdfUrl}
			<ScrollArea class="h-full w-full">
				<div class="p-6 max-w-3xl mx-auto">
					<EditorCanvas
						filename={pdfUrl?.split("/").pop() ??
							`${displayTitle}.pdf`}
						title={displayTitle}
						url={pdfUrl}
						type="pdf"
						streaming={false}
					/>
				</div>
			</ScrollArea>
		{:else if persistedMarkdownPath}
			<ScrollArea class="h-full w-full">
				<div
					class="flex flex-col p-6 max-w-3xl mx-auto relative pb-20 group"
				>
					<EditorCanvas
						bind:this={editorRef}
						editorMode="wysiwyg"
						filename={persistedMarkdownPath.split("/").pop() ??
							displayTitle}
						title={displayTitle}
						url={`/api/file/${persistedMarkdownPath}`}
						saveUrl={`/api/file/${persistedMarkdownPath}`}
						content={entry?.content ?? ""}
						type="text"
						streaming={isStreaming}
						{user}
						artifactId={toolOutput?.artifactId ?? ""}
					/>
				</div>
			</ScrollArea>
		{:else if entry?.content}
			<ScrollArea class="h-full">
				<div class="p-6 max-w-3xl mx-auto">
					<Markdown
						content={entry.content}
						animation={{ enabled: true }}
					/>
				</div>
			</ScrollArea>
		{:else if !current}
			<div
				class="h-full flex flex-col items-center justify-center text-center px-8 opacity-50"
			>
				<FileQuestionIcon
					class="size-12 text-muted-foreground/40 mb-3"
				/>
				<p
					class="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground"
				>
					No artifact selected
				</p>
			</div>
		{:else if current.kind === "unsupported"}
			<div
				class="h-full flex flex-col items-center justify-center text-center px-8"
			>
				<FileQuestionIcon
					class="size-14 text-muted-foreground/50 mb-4"
				/>
				<p class="text-[13px] font-semibold text-foreground mb-1">
					{current.title}
				</p>
				{#if current.size}
					<p class="text-[10px] text-muted-foreground mb-4">
						{formatSize(current.size)}
					</p>
				{/if}
				{#if current.url}
					<Button
						variant="outline"
						size="sm"
						class="rounded-full text-xs"
						onclick={handleDownloadRaw}
					>
						<DownloadIcon class="size-3.5 mr-2" />
						Download
					</Button>
				{/if}
			</div>
		{:else if current.kind === "document"}
			<ScrollArea class="h-full w-full mb-20">
				<div class="p-6 max-w-3xl mx-auto">
					<EditorCanvas
						bind:this={editorRef}
						editorMode="wysiwyg"
						filename={current.title}
						url={current.url ?? ""}
						saveUrl={current.saveUrl ?? current.url}
						content={current.content ?? ""}
						type="text"
						streaming={isStreaming}
						{user}
					/>
				</div>
			</ScrollArea>
		{:else if current.kind === "pdf"}
			<ScrollArea class="h-full w-full">
				<div class="p-6 max-w-3xl mx-auto">
					<EditorCanvas
						filename={current.title}
						url={current.url ?? ""}
						type="pdf"
						streaming={false}
					/>
				</div>
			</ScrollArea>
		{:else if current.kind === "image"}
			<ScrollArea class="h-full">
				<div class="flex items-center justify-center p-4 min-h-full">
					{#if current.url}
						<img
							src={current.url}
							alt={current.title}
							class="max-w-full max-h-full rounded-md shadow-sm"
						/>
					{/if}
				</div>
			</ScrollArea>
		{/if}
	</div>
</div>

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this file?</AlertDialog.Title>
			<AlertDialog.Description>
				This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete}
				>Delete</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={publishDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Publish result</AlertDialog.Title>
			<AlertDialog.Description>
				{#if publishState}
					Publish result for <strong
						>{publishState.studentName}</strong
					>
					to
					<strong>{publishState.parentName}</strong>
					({publishState.parentEmail})?
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			{#if publishState?.loading}
				<div
					class="flex items-center gap-2 text-sm text-muted-foreground"
				>
					<div
						class="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"
					/>
					{publishState.loadingText}
				</div>
			{:else}
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={handlePublishConfirm}
					>Publish</AlertDialog.Action
				>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
