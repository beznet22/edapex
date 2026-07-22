<script lang="ts">
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
	import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";
	import BottomToolbar from "$lib/components/editor/BottomToolbar.svelte";
	import MobileAISheet from "$lib/components/editor/MobileAISheet.svelte";
	import {
		breakpointFromWidth,
		type ContainerBreakpoint,
	} from "$lib/components/editor/useContainerBreakpoint.svelte";
	import LoadingState from "./loading-state.svelte";
	import { Markdown } from "$lib/components/prompt-kit/markdown";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { Button } from "$lib/components/ui/button/index.js";
	import { toast } from "svelte-sonner";
	import { SelectedClass } from "$lib/context/sync.svelte";
	import { DESIGNATIONS } from "$lib/types/sms-types";
	import { parseMarksheetMarkdown } from "$lib/utils/marksheet-ast-parser";
	import { patchFile } from "$lib/state/manifest-patches.svelte";

	import { usePdfiumEngine } from "@embedpdf/engines/svelte";
	import { EmbedPDF } from "@embedpdf/core/svelte";
	import { createPluginRegistration } from "@embedpdf/core";
	import {
		ViewportPluginPackage,
		Viewport,
	} from "@embedpdf/plugin-viewport/svelte";
	import {
		Scroller,
		ScrollPluginPackage,
		type RenderPageProps,
	} from "@embedpdf/plugin-scroll/svelte";
	import {
		DocumentManagerPluginPackage,
		DocumentContent,
	} from "@embedpdf/plugin-document-manager/svelte";
	import {
		RenderLayer,
		RenderPluginPackage,
	} from "@embedpdf/plugin-render/svelte";

	let {
		filename = "",
		url = "",
		saveUrl = "",
		content = "",
		type = "text",
		editorMode = $bindable("wysiwyg"),
		isSaving = $bindable(false),
		validationState = $bindable({ errors: [], errorCount: 0 }),
		streaming = false,
		user,
		artifactId = "",
		title = "",
		examTypeId = null,
	}: {
		filename?: string;
		url?: string;
		saveUrl?: string;
		content?: string;
		type?: "text" | "image" | "pdf";
		editorMode?: "wysiwyg" | "raw";
		isSaving?: boolean;
		validationState?: { errors: string[]; errorCount: number };
		streaming?: boolean;
		user?: { designation?: string };
		artifactId?: string;
		title?: string;
		examTypeId?: number | null;
	} = $props();

	let textContent = $state("Loading...");
	let editContent = $state("");
	let containerWidth = $state(0);
	let containerRef = $state<HTMLDivElement | null>(null);
	let textContainerRef = $state<HTMLDivElement | null>(null);
	let textContainerWidth = $state(0);
	const containerBreakpoint = $derived<ContainerBreakpoint>(
		breakpointFromWidth(textContainerWidth),
	);
	let mobileSheetOpen = $state(false);
	let pdfFetchState = $state<"idle" | "fetching" | "ready" | "error">("idle");
	let pdfFetchError = $state<string | null>(null);
	let editorSkeletonVisible = $state(false);
	let pdfUrlReady = $state(false);
	let pdfUrlError = $state<string | null>(null);
	let skeletonVisible = $state(true);

	const selectedClass = SelectedClass.fromContext();
	const designationId = $derived(
		DESIGNATIONS.indexOf((user?.designation as any) ?? "it") || 1,
	);
	const selectedClassId = $derived(selectedClass?.data?.classId ?? null);
	const selectedSectionId = $derived(selectedClass?.data?.sectionId ?? null);
	const selectedClassName = $derived(selectedClass?.data?.className ?? "");
	const selectedSectionName = $derived(
		selectedClass?.data?.sectionName ?? "",
	);

	// Editor is always editable; validation approval is handled via the tool
	// approval flow (ActionBar) and does not lock the canvas.
	const editable = $derived(true);

	const isMarkdownFile = $derived(
		filename.endsWith(".md") || filename.endsWith(".markdown"),
	);
	let wysiwygContent = $state("");
	let lastSavedContent = $state<string>("");
	let contentVersion = $state(0);
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	type CommitState = 'idle' | 'pending' | 'committing' | 'committed' | 'failed';
	let commitState: CommitState = $state('idle');
	let commitSecondsLeft = $state(0);
	let commitError: string | null = $state(null);
	let commitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let commitTickInterval: ReturnType<typeof setInterval> | null = null;
	let commitAutoResetTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCommitTarget: { path: string; examTypeId: number } | null = $state(null);
	let lastCommittedRecordId: number | null = $state(null);
	const COMMIT_DEBOUNCE_MS = 8000;

	function commitManifestRelPathFromUrl(targetUrl: string): string {
		try {
			const u = new URL(targetUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
			const m = u.pathname.match(/\/api\/file\/(.+?)(?:\/?$|\?)/);
			return m ? decodeURIComponent(m[1]) : targetUrl;
		} catch {
			const idx = targetUrl.indexOf('/api/file/');
			if (idx >= 0) {
				const after = targetUrl.slice(idx + '/api/file/'.length);
				return after.split('?')[0] ?? after;
			}
			return targetUrl;
		}
	}

	function scheduleCommit(manifestRelPath: string, examTypeIdValue: number) {
		if (commitDebounceTimer) clearTimeout(commitDebounceTimer);
		if (commitTickInterval) { clearInterval(commitTickInterval); commitTickInterval = null; }
		if (commitAutoResetTimer) { clearTimeout(commitAutoResetTimer); commitAutoResetTimer = null; }
		lastCommitTarget = { path: manifestRelPath, examTypeId: examTypeIdValue };
		commitError = null;
		commitState = 'pending';
		commitSecondsLeft = Math.floor(COMMIT_DEBOUNCE_MS / 1000);
		commitDebounceTimer = setTimeout(() => {
			commitDebounceTimer = null;
			fireCommit();
		}, COMMIT_DEBOUNCE_MS);
	}

	function cancelCommit() {
		if (commitDebounceTimer) { clearTimeout(commitDebounceTimer); commitDebounceTimer = null; }
		if (commitTickInterval) { clearInterval(commitTickInterval); commitTickInterval = null; }
		commitState = 'idle';
		commitSecondsLeft = 0;
		commitError = null;
		lastCommitTarget = null;
	}

	async function fireCommit() {
		const target = lastCommitTarget;
		if (!target) return;
		commitDebounceTimer = null;
		if (commitTickInterval) { clearInterval(commitTickInterval); commitTickInterval = null; }
		commitState = 'committing';
		try {
			const res = await fetch('/api/commit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: target.path,
					examTypeId: target.examTypeId,
					reason: 'Auto-commit',
				}),
			});
			const data = await res.json().catch(() => null);
			if (res.ok && data && data.ok) {
				lastCommittedRecordId = data.recordId ?? null;
				commitError = null;
				commitState = 'committed';
				commitAutoResetTimer = setTimeout(() => {
					if (commitState === 'committed') {
						commitState = 'idle';
						commitAutoResetTimer = null;
					}
				}, 3000);
			} else {
				const firstErr = data?.errors?.[0];
				commitError = firstErr?.message ?? `HTTP ${res.status}`;
				commitState = 'failed';
			}
		} catch (err) {
			commitError = err instanceof Error ? err.message : String(err);
			commitState = 'failed';
		}
	}

	function handleWysiwygUpdate(markdown: string) {
		wysiwygContent = markdown;
		editContent = markdown;
	}

	export async function save(): Promise<boolean> {
		const target = saveUrl || url;
		if (!target) return false;
		isSaving = true;
		try {
			const body =
				editorMode === "wysiwyg" ? wysiwygContent : editContent;
			const res = await fetch(target, {
				method: "PUT",
				body: new Blob([body], { type: "text/plain" }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			textContent = body;
			toast.success("File saved successfully");
			return true;
		} catch (err) {
			console.error("Save error:", err);
			toast.error("Failed to save file");
			return false;
		} finally {
			isSaving = false;
		}
	}

	export function copy() {
		const body =
			editorMode === "wysiwyg" && isMarkdownFile
				? wysiwygContent
				: editContent;
		if (body) {
			navigator.clipboard.writeText(body);
			toast.success("Copied to clipboard");
		}
	}

	export function toggleMode() {
		editorMode = editorMode === "wysiwyg" ? "raw" : "wysiwyg";
	}

	export function setContent(md: string) {
		textContent = md;
		editContent = md;
		wysiwygContent = md;
		lastSavedContent = md;
		contentVersion++;
	}

	const pdfEngine = usePdfiumEngine();

	let plugins = $derived(
		url
			? [
					createPluginRegistration(DocumentManagerPluginPackage, {
						initialDocuments: [{ url: url }],
					}),
					createPluginRegistration(ViewportPluginPackage),
					createPluginRegistration(ScrollPluginPackage),
					createPluginRegistration(RenderPluginPackage),
				]
			: [],
	);

	$effect(() => {
		if (type === "text") {
			if (streaming) {
				textContent = content ?? "";
				editContent = content ?? "";
			} else if (content) {
				textContent = content;
				editContent = content;
				lastSavedContent = content;
			} else if (url) {
				const targetUrl = url;
				textContent = "Loading...";
				editContent = "";
				let cancelled = false;
				const timeoutId = setTimeout(() => {
					if (!cancelled) {
						textContent = "Error: Request timed out after 10s";
						editContent = textContent;
					}
				}, 10000);
				fetch(targetUrl)
					.then((r) => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.text();
					})
					.then((t) => {
						clearTimeout(timeoutId);
						if (cancelled) return;
						textContent = t;
						editContent = t;
						lastSavedContent = t;
					})
					.catch((e) => {
						clearTimeout(timeoutId);
						if (cancelled) return;
						const msg = e instanceof Error ? e.message : String(e);
						textContent = `Error loading file: ${msg}`;
						editContent = textContent;
					});
				return () => {
					cancelled = true;
					clearTimeout(timeoutId);
				};
			}
		}
	});

	let showParseBar = $state(false);

	$effect(() => {
		const md = wysiwygContent;
		if (!md || normalizeMarkdown(md) === normalizeMarkdown(lastSavedContent)) return;
		if (streaming) return;
		if (!artifactId) return;
		if (!url) return;

		if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
		saveDebounceTimer = setTimeout(async () => {
			try {
				const urlExamTypeMatch = url.match(/examType-(\d+)/);
			const resolvedExamTypeId = examTypeId ?? (urlExamTypeMatch ? Number(urlExamTypeMatch[1]) : null);
			const saveTarget = resolvedExamTypeId ? `${url}${url.includes('?') ? '&' : '?'}examTypeId=${resolvedExamTypeId}` : url;
				const res = await fetch(saveTarget, {
					method: "PUT",
					body: new Blob([md], { type: "text/markdown" }),
				});
				if (!res.ok) return;
				const data = await res.json();
				lastSavedContent = md;

				if (data.validation) {
					validationState = data.validation;
					showParseBar = true;
				}

				if (data.manifestStatus) {
					patchFile(url, {
						manifestStatus: data.manifestStatus,
						validationErrors: data.validation?.errors ?? [],
						validationErrorCount: data.validation?.errorCount ?? 0,
					});
				}

				if (resolvedExamTypeId != null) {
					const relPath = commitManifestRelPathFromUrl(saveTarget);
					if (/marksheets\/.*\.md$/.test(relPath)) {
						scheduleCommit(relPath, resolvedExamTypeId);
					}
				}

				try {
					const parsed = parseMarksheetMarkdown(md);
					const rawJsonUrl = url.replace(/\.md$/, ".raw.json");
					const rawJsonTarget = resolvedExamTypeId ? `${rawJsonUrl}${rawJsonUrl.includes('?') ? '&' : '?'}examTypeId=${resolvedExamTypeId}` : rawJsonUrl;
					await fetch(rawJsonTarget, {
						method: "PUT",
						body: new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" }),
					}).catch(() => {});
				} catch {
					// raw.json is a fast-path cache; skip if parsing fails
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error("Auto-save failed:", msg);
			}
		}, 2000);

		return () => {
			if (saveDebounceTimer) {
				clearTimeout(saveDebounceTimer);
				saveDebounceTimer = null;
			}
			if (commitDebounceTimer) { clearTimeout(commitDebounceTimer); commitDebounceTimer = null; }
			if (commitTickInterval) { clearInterval(commitTickInterval); commitTickInterval = null; }
			if (commitAutoResetTimer) { clearTimeout(commitAutoResetTimer); commitAutoResetTimer = null; }
		};
	});

	$effect(() => {
		if (commitState !== 'pending') {
			if (commitTickInterval) { clearInterval(commitTickInterval); commitTickInterval = null; }
			return;
		}
		if (commitTickInterval) return;
		commitTickInterval = setInterval(() => {
			if (commitState === 'pending' && commitSecondsLeft > 0) {
				commitSecondsLeft = commitSecondsLeft - 1;
			}
		}, 1000);
	});

	$effect(() => {
		if (containerRef) {
			const observer = new ResizeObserver((entries) => {
				containerWidth = entries[0].contentRect.width;
			});
			observer.observe(containerRef);
			return () => observer.disconnect();
		}
	});

	$effect(() => {
		if (textContainerRef) {
			const observer = new ResizeObserver((entries) => {
				textContainerWidth = entries[0].contentRect.width;
			});
			observer.observe(textContainerRef);
			return () => observer.disconnect();
		}
	});

	$effect(() => {
		if (!streaming) {
			skeletonVisible = false;
			return;
		}
		if (textContent && textContent.length > 0) {
			skeletonVisible = false;
			return;
		}
		skeletonVisible = true;
		const t = setTimeout(() => {
			skeletonVisible = false;
		}, 200);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (type !== "pdf" || !url) {
			pdfUrlReady = false;
			pdfUrlError = null;
			return;
		}
		let cancelled = false;
		pdfUrlReady = false;
		pdfUrlError = null;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		fetch(url, { method: "HEAD", signal: controller.signal })
			.then((r) => {
				if (cancelled) return;
				if (!r.ok) {
					pdfUrlError = `HTTP ${r.status}`;
					pdfUrlReady = false;
				} else {
					pdfUrlReady = true;
					pdfUrlError = null;
				}
			})
			.catch((e) => {
				if (cancelled) return;
				pdfUrlError = e instanceof Error ? e.message : String(e);
				pdfUrlReady = false;
			})
			.finally(() => clearTimeout(timeout));
		return () => {
			cancelled = true;
			clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

{#if filename}
	{#if type === "text"}
		{#if streaming && isMarkdownFile && editorMode === "wysiwyg"}
			{#if skeletonVisible}
				<ScrollArea
					class="flex-1 w-full bg-background overflow-hidden p-4"
				>
					<div class="space-y-2 max-w-3xl">
						{#each [60, 80, 45, 75, 55, 70, 40] as w, i (i)}
							<div
								class="h-3 rounded-md bg-muted-foreground/15"
								style:width="{w}%"
							></div>
						{/each}
					</div>
				</ScrollArea>
			{:else}
				<ScrollArea
					class="flex-1 w-full bg-background overflow-hidden p-4"
				>
					<div class="prose prose-sm max-w-none dark:prose-invert">
						<Markdown content={textContent} />
					</div>
				</ScrollArea>
			{/if}
		{:else if textContent === "Loading..." || textContent.startsWith("Error loading")}
			<LoadingState
				label={textContent === "Loading..."
					? "Loading file content"
					: textContent}
			/>
		{:else if isMarkdownFile && editorMode === "wysiwyg"}
			<div class="flex-1 min-h-0 overflow-hidden flex flex-col">
				<div
					class="flex-1 min-h-0 overflow-hidden"
					bind:this={textContainerRef}
				>
					{#key `${url}-v${contentVersion}`}
						<WysiwygEditor
							content={textContent}
							onUpdate={handleWysiwygUpdate}
							{designationId}
							{selectedClassId}
							{selectedSectionId}
							{selectedClassName}
							{selectedSectionName}
							{editable}
						/>
					{/key}
				</div>
				{#if showParseBar}
					{@const commitMode = commitState !== 'idle'}
					{@const pillDot = commitMode
						? (commitState === 'committed' ? 'bg-green-500' : commitState === 'failed' ? 'bg-red-500' : 'bg-amber-500')
						: (validationState.errorCount === 0 ? 'bg-green-500' : 'bg-red-500')}
					{@const pillText = commitMode
						? (commitState === 'committed' ? 'text-green-700' : commitState === 'failed' ? 'text-red-700' : 'text-amber-700')
						: (validationState.errorCount === 0 ? 'text-green-700' : 'text-red-700')}
					{@const pillBg = commitMode
						? (commitState === 'committed' ? 'bg-green-50/50' : commitState === 'failed' ? 'bg-red-50/50' : 'bg-amber-50/50')
						: (validationState.errorCount === 0 ? 'bg-green-50/50' : 'bg-red-50/50')}
					{@const pillLabel = commitMode
						? (commitState === 'pending'
							? `Committing in ${commitSecondsLeft}s…`
							: commitState === 'committing'
								? 'Committing…'
								: commitState === 'committed'
									? 'Committed ✓'
									: `Commit failed${commitError ? `: ${commitError}` : ''}`)
						: (validationState.errorCount === 0
							? 'Template OK'
							: `${validationState.errorCount} validation error${validationState.errorCount === 1 ? '' : 's'}`)}
					<div
						class="h-5 px-3 flex items-center gap-1.5 text-[10px] font-medium border-t {pillBg}"
					>
						{#if commitState === 'committing'}
							<Spinner class="size-2.5" />
						{:else}
							<div class="size-1.5 rounded-full {pillDot}"></div>
						{/if}
						<span class={pillText}>{pillLabel}</span>
						{#if commitState === 'pending'}
							<button
								type="button"
								onclick={cancelCommit}
								class="ml-auto text-[10px] text-amber-700/70 hover:text-amber-700 hover:bg-amber-100 rounded px-1 leading-none"
								aria-label="Cancel pending commit"
							>×</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<ScrollArea
				class="flex-1 w-full bg-background overflow-hidden relative"
			>
				<textarea
					bind:value={editContent}
					readonly={streaming}
					class="w-full min-h-full absolute inset-0 p-4 text-[0.7rem] font-mono leading-relaxed bg-transparent resize-none outline-none border-none focus:ring-0"
				></textarea>
			</ScrollArea>
		{/if}
	{:else if type === "image"}
		<ScrollArea class="flex-1">
			<div class="flex items-center justify-center p-4">
				<img
					src={url}
					alt={filename}
					class="max-w-full rounded-md shadow-sm"
				/>
			</div>
		</ScrollArea>
	{:else if type === "pdf"}
		<div
			class="h-full w-full overflow-hidden borde"
			bind:this={containerRef}
		>
			{#if pdfEngine.isLoading || !pdfEngine.engine}
				<LoadingState label="Loading PDF engine" />
			{:else if pdfUrlError}
				<div
					class="h-full flex flex-col items-center justify-center gap-3 text-center px-6"
				>
					<AlertCircleIcon class="size-10 text-destructive/70" />
					<p class="text-sm font-semibold text-foreground">
						PDF not ready
					</p>
					<p class="text-[11px] text-muted-foreground max-w-xs">
						{pdfUrlError}
					</p>
					<Button
						size="sm"
						variant="outline"
						onclick={() => location.reload()}
					>
						<RefreshCwIcon class="size-3.5 mr-1" /> Retry
					</Button>
				</div>
			{:else if !pdfUrlReady}
				<div
					class="h-full flex flex-col items-center justify-center gap-3"
				>
					<Spinner class="size-8 text-primary" />
					<p
						class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
					>
						Loading PDF…
					</p>
				</div>
			{:else}
				<EmbedPDF engine={pdfEngine.engine} {plugins}>
					{#snippet children({ activeDocumentId })}
						{#if activeDocumentId}
							{@const documentId = activeDocumentId}
							<DocumentContent {documentId}>
								{#snippet children(documentContent)}
									{#if documentContent.isLoaded}
										{#snippet renderPage(
											page: RenderPageProps,
										)}
									{@const pageScale = containerWidth
										? containerWidth / page.width
										: 1}
										{console.log({pageScale, page: page.width, height: page.height, containerWidth})}
									<div
										style:width="{page.width *
											pageScale}px"
										style:height="{page.height *
											pageScale}px"
										class="origin-top"
									>
										<RenderLayer
											{documentId}
											pageIndex={page.pageIndex}
											scale={pageScale}
										/>
									</div>
										{/snippet}
										<Viewport
											{documentId}
											class="w-full h-full overflow-x-hidden relative"
										>
											<Scroller
												{documentId}
												{renderPage}
											/>
										</Viewport>
									{/if}
								{/snippet}
							</DocumentContent>
						{/if}
					{/snippet}
				</EmbedPDF>
			{/if}
		</div>
	{/if}
{/if}
