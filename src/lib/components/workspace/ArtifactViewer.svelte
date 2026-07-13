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
	import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
	import Share2Icon from "@lucide/svelte/icons/share-2";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FileTypeIcon from "@lucide/svelte/icons/file-type";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import FileDownIcon from "@lucide/svelte/icons/file-down";
	import EditorCanvas from "./editor-canvas.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { useChat } from "$lib/context/chat-context.svelte";
	import {
		deriveDocumentId,
		documentStreams,
		type DocumentStreamEntry,
	} from "$lib/context/thread-data.svelte";
	import Markdown from "$lib/components/prompt-kit/markdown/Markdown.svelte";

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
		return entry?.status ?? "processing";
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
		studentId?: number | null;
		examTypeId?: number | null;
		academicId?: number | null;
		studentFullName?: string | null;
		adminNo?: number | null;
		documentId?: string;
		currentMarkdownPath?: string;
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

	// PDF counterpart lives next to the markdown file with the same stem.
	// We don't know whether the assistant has published a PDF until we probe
	// `/api/file/<pdfPath>` — that's the `pdfAvailable` derivation below.
	const pdfUrl = $derived.by(() => {
		if (!persistedMarkdownPath) return null;
		const swapped = persistedMarkdownPath.replace(/\.md$/i, ".pdf");
		return `/api/file/${swapped}`;
	});

	let viewMode = $state<"markdown" | "pdf">("markdown");
	let pdfAvailable = $state(false);
	let pdfProbeSeq = 0;

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
				m.toast.error(e instanceof Error ? e.message : "Download failed"),
			);
		}
	}

	function handleDownloadMarkdown() {
		if (!persistedMarkdownPath) return;
		const filename =
			persistedMarkdownPath.split("/").pop() ?? `${displayTitle}.md`;
		triggerDownload(persistedMarkdownPath, filename);
	}

	function handleDownloadPDF() {
		if (!pdfUrl || !pdfAvailable) return;
		const filename =
			persistedMarkdownPath?.replace(/\.md$/i, ".pdf").split("/").pop() ??
			`${displayTitle}.pdf`;
		triggerDownload(pdfUrl.replace(/^\/api\/file\//, ""), filename);
	}

	function toggleViewMode() {
		viewMode = viewMode === "pdf" ? "markdown" : "pdf";
	}

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);
	const current = $derived.by((): Artifact | null => {
		const found = artifacts.find((a) => a.id === viewingId);
		if (found) return found;
		// Streamed documents are not added to inspector.chatArtifacts, but the
		// workspace panel still needs a current artifact to render header actions.
		if (effectiveStatus === "success" && persistedMarkdownPath) {
			return {
				id: viewingId,
				title: displayTitle,
				kind: "document" as const,
				content: entry?.content ?? "",
				url: `/api/file/${persistedMarkdownPath}`,
				saveUrl: `/api/file/${persistedMarkdownPath}`,
				status: "success" as const,
			};
		}
		return null;
	});
	// Effective streaming state: prefer the merged tool output / stream-entry
	// status so the header actions are disabled while the artifact is still
	// being formatted by `streamDocument` or persisted by `validate-marksheet`,
	// not just while the artifact card itself reports `processing`.
	const isStreaming = $derived(
		effectiveStatus === "streaming" || effectiveStatus === "processing",
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

	function handleDownload() {
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
								disabled={isStreaming}
								aria-label="Copy artifact"
							>
								<CopyIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{isStreaming ? 'Copy (available when streaming finishes)' : 'Copy'}</Tooltip.Content>
				</Tooltip.Root>

				{#if current.url}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
									onclick={handleDownload}
									disabled={isStreaming}
									aria-label="Download artifact"
								>
									<DownloadIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{isStreaming ? 'Download (available when streaming finishes)' : 'Download'}</Tooltip.Content>
					</Tooltip.Root>
				{/if}

				{#if persistedMarkdownPath}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
									onclick={handleDownloadMarkdown}
									disabled={isStreaming}
									aria-label="Download markdown"
								>
									<FileTextIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Download markdown (.md)</Tooltip.Content>
					</Tooltip.Root>
				{/if}

				{#if pdfAvailable && viewMode === 'pdf'}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-primary hover:text-primary hover:bg-primary/15 disabled:opacity-40 disabled:pointer-events-none"
									onclick={toggleViewMode}
									disabled={isStreaming}
									aria-label="Switch to markdown view"
								>
									<EyeIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>View markdown</Tooltip.Content>
					</Tooltip.Root>
				{:else if pdfAvailable && viewMode === 'markdown'}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
									onclick={toggleViewMode}
									disabled={isStreaming}
									aria-label="Switch to PDF view"
								>
									<FileTypeIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>View PDF</Tooltip.Content>
					</Tooltip.Root>
				{/if}

				{#if pdfAvailable}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
									onclick={handleDownloadPDF}
									disabled={isStreaming}
									aria-label="Download PDF"
								>
									<FileDownIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Download PDF</Tooltip.Content>
					</Tooltip.Root>
				{/if}

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
								disabled={isStreaming}
								aria-label="More actions"
							>
								<MoreHorizontalIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="end"
						class="w-44 bg-popover backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl"
					>
						<DropdownMenu.Item onclick={handleSave} disabled={isStreaming}>
							<SaveIcon class="size-3.5 mr-2" />
							Save
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={handleShare} disabled={isStreaming}>
							<Share2Icon class="size-3.5 mr-2" />
							Share
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={handlePrint} disabled={isStreaming}>
							<PrinterIcon class="size-3.5 mr-2" />
							Print
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
		{#if persistedMarkdownPath && viewMode === 'pdf' && pdfAvailable && pdfUrl}
			<EditorCanvas
				filename={persistedMarkdownPath.replace(/\.md$/i, '.pdf').split('/').pop() ?? `${displayTitle}.pdf`}
				title={displayTitle}
				url={pdfUrl}
				type="pdf"
				streaming={false}
			/>
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
						onclick={handleDownload}
					>
						<DownloadIcon class="size-3.5 mr-2" />
						Download
					</Button>
				{/if}
			</div>
		{:else if current.kind === "document"}
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
		{:else if current.kind === "pdf"}
			<EditorCanvas
				filename={current.title}
				url={current.url ?? ""}
				type="pdf"
				streaming={false}
			/>
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
