<script lang="ts">
	import type { Artifact } from "$lib/types/workspace-types";
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import * as Card from "$lib/components/ui/card";
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "$lib/components/ui/collapsible";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import * as Dialog from "$lib/components/ui/dialog";
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
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import SendIcon from "@lucide/svelte/icons/send";
	import LockIcon from "@lucide/svelte/icons/lock";
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
	import XCircleIcon from "@lucide/svelte/icons/x-circle";
	import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import PenSquareIcon from "@lucide/svelte/icons/pen-square";
	import EditorCanvas from "./editor-canvas.svelte";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { useInspector } from "$lib/context/inspector-context.svelte";
	import { useChat } from "$lib/context/chat-context.svelte";
	import {
		deriveDocumentId,
		documentStreams,
		type DocumentStreamEntry,
	} from "$lib/context/thread-data.svelte";
	import Markdown from "$lib/components/prompt-kit/markdown/Markdown.svelte";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { autoFixStructure } from "$lib/utils/marksheet-ast-parser";
	import { patchFile } from "$lib/state/manifest-patches.svelte";
	import { setActive as setGlobalProgress } from "$lib/state/global-context.svelte";


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

	// PDF URL: either derived from the API response (after generate) or probed.
	let pdfStoragePath = $state<string | null>(null);
	let pdfGenerating = $state(false);

	const pdfUrl = $derived.by(() => {
		if (pdfStoragePath) return `/api/file/${pdfStoragePath}`;
		if (!persistedMarkdownPath) return null;
		const swapped = persistedMarkdownPath.replace(/\.md$/i, ".pdf");
		return `/api/file/${swapped}`;
	});

	let viewMode = $state<"markdown" | "pdf" | "validation">("markdown");
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
		{ save: () => Promise<boolean> | void; copy: () => void; setContent: (md: string) => void } | undefined
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

	function extractStudentIdentifier(): {
		admissionNo?: number;
		studentId?: number;
		contentHash?: string;
		filePath?: string;
		examTypeId?: number;
	} {
		// Send what the artifact already carries from the manifest (loaded by
		// the filestore page server at +page.server.ts:210-260). No path
		// derivation needed — the server does the manifest lookup.
		if (toolOutput?.adminNo) return { admissionNo: toolOutput.adminNo };
		if (toolOutput?.studentId) return { studentId: toolOutput.studentId };
		if (current?.admissionNo) return { admissionNo: current.admissionNo };
		if (current?.studentId) return { studentId: current.studentId };
		const path = persistedMarkdownPath ?? current?.url;
		const filePath = path?.replace(/^\/api\/file\//, "") ?? undefined;
		return {
			...(current?.contentHash
				? { contentHash: current.contentHash }
				: {}),
			...(current?.examTypeId ? { examTypeId: current.examTypeId } : {}),
			...(filePath ? { filePath } : {}),
		};
	}

	async function commitBeforePdf(): Promise<string | null> {
		const filePath = autoFixPath ?? validatePath;
		if (!filePath || !computedExamTypeId) return null;
		if (editorRef) {
			try { await editorRef.save(); } catch { /* best-effort */ }
		}
		try {
			const res = await fetch('/api/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: filePath,
					examTypeId: computedExamTypeId,
					reason: 'Pre-PDF commit',
				}),
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				const msg = (errBody as { errors?: Array<{ message: string }> }).errors?.[0]?.message ?? `HTTP ${res.status}`;
				return msg;
			}
			const data = await res.json();
			if (!data.ok) {
				return data.errors?.[0]?.message ?? 'Commit failed';
			}
			const commitUrl = `/api/file/${filePath}`;
			patchFile(commitUrl, {
				manifestStatus: data.marksheetStatus ?? 'Committed'
			});
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : 'Commit failed';
		}
	}

	async function handleDownload() {
		const commitError = await commitBeforePdf();
		if (commitError) {
			import("svelte-sonner").then((m) =>
				m.toast.error(`Cannot generate PDF: ${commitError}`),
			);
			return;
		}
		const identifier = extractStudentIdentifier();
		if (
			!identifier.admissionNo &&
			!identifier.studentId &&
			!identifier.filePath
		) {
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
				body: JSON.stringify({ ...identifier, includePdfBuffer: true }),
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
		if (viewMode === "pdf") {
			viewMode = "markdown";
			return;
		}
		if (pdfAvailable && pdfUrl) {
			viewMode = "pdf";
			return;
		}
		if (
			current?.validationErrors?.some((e) =>
				e.includes("not found in class roster"),
			)
		) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					"Fix student admission number error before generating PDF",
				),
			);
			return;
		}
		const commitError = await commitBeforePdf();
		if (commitError) {
			import("svelte-sonner").then((m) =>
				m.toast.error(`Cannot generate PDF: ${commitError}`),
			);
			return;
		}
		const identifier = extractStudentIdentifier();
		if (
			!identifier.admissionNo &&
			!identifier.studentId &&
			!identifier.filePath
		) {
			import("svelte-sonner").then((m) =>
				m.toast.error(
					"No student data available — cannot generate PDF",
				),
			);
			return;
		}

		pdfGenerating = true;
		viewMode = "pdf";
		try {
			const res = await fetch("/api/results/generate-pdf", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(identifier),
			});
			if (!res.ok) {
				let serverMessage = `HTTP ${res.status}`;
				try {
					const errorBody = (await res.json()) as { error?: unknown };
					if (typeof errorBody.error === "string") {
						serverMessage = errorBody.error;
					}
				} catch {
					// body was not JSON or unreadable; fall back to HTTP status
				}
				throw new Error(serverMessage);
			}
			const data = await res.json();
			if (data.error) throw new Error(data.error);

			pdfStoragePath = data.storagePath;
		} catch (e) {
			viewMode = "markdown";
			import("svelte-sonner").then((m) =>
				m.toast.error(
					e instanceof Error ? e.message : "Failed to generate PDF",
				),
			);
		} finally {
			pdfGenerating = false;
		}
	}

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);

	// Reset per-artifact PDF state when the active artifact changes so the
	// newly opened file is always rendered in markdown view. Without this,
	// `pdfStoragePath` and `viewMode === "pdf"` from the previous file leak
	// into the new one, showing the wrong PDF (or stuck in PDF mode).
	let lastViewingId: string | null | undefined = undefined;
	$effect(() => {
		if (viewingId === lastViewingId) return;
		lastViewingId = viewingId;
		viewMode = "markdown";
		pdfStoragePath = null;
		pdfGenerating = false;
	});

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

	const displayTitle = $derived(
		current?.studentName ??
			toolOutput?.validatedTitle ??
			toolOutput?.studentFullName ??
			toolOutput?.title ??
			"Untitled",
	);

	const marksheetStatus = $derived.by((): string | null => {
		if (toolOutput?.marksheetStatus) return toolOutput.marksheetStatus;
		if (current?.marksheetStatus) return current.marksheetStatus;
		return null;
	});

	let forceEditable = $state(false);
	let published = $state(false);
	const isPublished = $derived(marksheetStatus === 'Published' || published);
	const readOnly = $derived(isPublished && !forceEditable);

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

	let validationState = $state<{ errors: string[]; errorCount: number; warnings: string[]; warningCount: number }>({
		errors: [],
		errorCount: 0,
		warnings: [],
		warningCount: 0,
	});
	let omittedSubjectIds = $state<number[]>([]);
	let allowedSubjectIds = $state<number[]>([]);
	let crossRefErrors = $state<Array<{ subjectId: number; subjectCode: string | null; message: string; status?: 'unresolved' | 'allowed' }>>([]);
	let aiFixing = $state(false);
	let llmAdvice = $state('');
	let validating = $state(false);

	/** Tracks whether the manifest entry has ever reported validation data.
	 *  Set to true the first time `current.validationErrors` or
	 *  `current.validationErrorCount` is defined. Lets the pill renderer
	 *  distinguish "valid" from "unknown — never validated" so a marksheet
	 *  that never went through the editor (chat-pipeline upload → click
	 *  EyeIcon) doesn't silently render the green "Valid" state when the
	 *  underlying markdown is structurally broken. */
	let hasManifestValidationData = $state(false);

	/** Tri-state + warning for the validation pill.
	 *  - 'invalid': manifest has validationErrors[] with length > 0 (red)
	 *  - 'valid':   manifest has validationErrors[] with length === 0 and no warnings (green)
	 *  - 'warning': manifest has warnings but no errors (amber, distinct from unknown)
	 *  - 'unknown': manifest never reported validation data (muted amber) — surface
	 *               explicitly so the user clicks the pill to open the editor
	 *               and trigger auto-validation, instead of clicking EyeIcon
	 *               and getting a ZodError toast from a "Valid"-looking state. */
	type ValidationStatus = "valid" | "invalid" | "unknown" | "warning";
	const validationStatus: ValidationStatus = $derived.by(() => {
		if (!hasManifestValidationData) return "unknown";
		if (validationState.errorCount > 0) return "invalid";
		if (validationState.warningCount > 0) return "warning";
		return "valid";
	});

	type ValidationItem = {
		type: 'error' | 'warning';
		message: string;
		cref: { subjectId: number; subjectCode: string | null; message: string; status?: 'unresolved' | 'allowed' } | null;
	};
	const validationItems: ValidationItem[] = $derived.by(() => {
		const items: ValidationItem[] = [];
		for (const error of validationState.errors) {
			const cref = crossRefErrors.find(c => error.includes(c.subjectCode ?? `id=${c.subjectId}`));
			items.push({ type: 'error', message: error, cref: cref ? { ...cref, status: cref.status ?? 'unresolved' } : null });
		}
		for (const warning of validationState.warnings) {
			const cref = crossRefErrors.find(c => warning.includes(c.subjectCode ?? `id=${c.subjectId}`));
			items.push({ type: 'warning', message: warning, cref: cref ? { ...cref, status: cref.status ?? 'unresolved' } : null });
		}
		return items;
	});

	const crossRefItems = $derived(validationItems.filter(i => i.cref));
	const zodItems = $derived(validationItems.filter(i => !i.cref && i.type === 'error'));

	/** Tailwind classes for each pill state. Kept here so the button class
	 *  attribute stays a single template expression. */
	const pillClasses: Record<ValidationStatus, string> = {
		valid: "bg-emerald-500 hover:bg-emerald-600",
		invalid: "bg-red-500 hover:bg-red-600 animate-pulse",
		warning: "bg-amber-500 hover:bg-amber-600",
		unknown: "bg-amber-500/60 hover:bg-amber-600/60",
	};

	$effect(() => {
		const a = current;
		const vPath = autoFixPath;
		if (mode !== 'filestore' || !vPath?.includes('marksheets/') || !vPath.endsWith('.md')) {
			if (
				a?.validationErrors !== undefined ||
				a?.validationErrorCount !== undefined ||
				a?.validationWarnings !== undefined
			) {
				const errs = a.validationErrors ?? [];
				const warns = a.validationWarnings ?? [];
				validationState = {
					errors: errs,
					errorCount: a.validationErrorCount ?? errs.length,
					warnings: warns,
					warningCount: a.validationWarningCount ?? warns.length,
				};
				hasManifestValidationData = true;
			}
		}
		omittedSubjectIds = a?.omittedSubjectIds ?? [];
		allowedSubjectIds = a?.allowedSubjectIds ?? [];
		crossRefErrors = a?.crossRefErrors ?? [];
	});

	let lastValidatedPath = $state<string | null>(null);
	$effect(() => {
		const vPath = autoFixPath;
		const eid = computedExamTypeId;
		if (!vPath?.includes('marksheets/') || !vPath.endsWith('.md')) return;
		if (validating || vPath === lastValidatedPath) return;

		validating = true;
		lastValidatedPath = vPath;
		fetch(`/api/file/${vPath}?action=validate&examTypeId=${eid}`, { method: 'POST' })
			.then(r => r.ok ? r.json() : null)
			.then(data => {
				if (data?.validation) {
					const warns = data.validation.warnings ?? [];
					validationState = {
						errors: data.validation.errors ?? [],
						errorCount: data.validation.errorCount ?? 0,
						warnings: warns,
						warningCount: data.validation.warningCount ?? warns.length,
					};
					crossRefErrors = data.validation?.crossRefErrors ?? [];
					omittedSubjectIds = data.omittedSubjectIds ?? [];
					allowedSubjectIds = data.allowedSubjectIds ?? [];
					hasManifestValidationData = true;
				}
				if (data?.manifestStatus) {
					patchFile(`/api/file/${vPath}`, {
						manifestStatus: data.manifestStatus,
						validationErrors: data.validation?.errors ?? [],
						validationErrorCount: data.validation?.errorCount ?? 0,
						validationWarnings: data.validation?.warnings ?? [],
						validationWarningCount: data.validation?.warningCount ?? 0,
						crossRefErrors: data.validation?.crossRefErrors ?? [],
						omittedSubjectIds: data.omittedSubjectIds ?? [],
						allowedSubjectIds: data.allowedSubjectIds ?? [],
					});
				}
			})
			.catch(() => {})
			.finally(() => { validating = false; });
	});

	async function handlePillClick() {
		await handleAutoFix();
		if (validationStatus === 'valid' && editorRef) {
			return;
		}
		if (validationState.errorCount > 0 || validationState.warningCount > 0 || llmAdvice) {
			viewMode = 'validation';
		}
	}

	const computedExamTypeId = $derived.by(() => {
		if (toolOutput?.examTypeId) return toolOutput.examTypeId;
		if (current?.examTypeId) return current.examTypeId;
		const path = persistedMarkdownPath ?? validatePath;
		if (path) {
			const admMatch = path.match(/ADM(\d+)-(\d+)-(.+?)\.md$/);
			if (admMatch) return Number(admMatch[2]);
			const examTypeMatch = path.match(/examType-(\d+)/);
			if (examTypeMatch) return Number(examTypeMatch[1]);
		}
		return null;
	});

	const computedArtifactId = $derived(
		toolOutput?.artifactId ?? current?.id ?? "",
	);

	const marksheetFileUrl = $derived(
		persistedMarkdownPath ?? validatePath ?? null,
	);

	const isMarksheetFile = $derived(
		(marksheetFileUrl ?? "").includes("marksheets/") ||
			(marksheetFileUrl ?? "").match(/ADM\d+-\d+-.+\.md$/) !== null,
	);

	const autoFixPath = $derived(
		persistedMarkdownPath ??
			validatePath ??
			current?.url?.replace(/^\/api\/file\//, "") ??
			null,
	);

	async function omitSubject(subjectId: number) {
		const vPath = autoFixPath;
		const eid = computedExamTypeId;
		if (!vPath || !eid) return;
		try {
			const res = await fetch(
				`/api/file/${vPath}?action=omit-subject&examTypeId=${eid}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ subjectId, omit: true }),
				},
			);
			if (!res.ok) return;
			const data = await res.json();
			if (data?.validation) {
				const warns = data.validation.warnings ?? [];
				validationState = {
					errors: data.validation.errors ?? [],
					errorCount: data.validation.errorCount ?? 0,
					warnings: warns,
					warningCount: data.validation.warningCount ?? warns.length,
				};
				crossRefErrors = data.validation?.crossRefErrors ?? [];
				omittedSubjectIds = data.omittedSubjectIds ?? [];
				allowedSubjectIds = data.allowedSubjectIds ?? [];
				hasManifestValidationData = true;
			}
			if (data?.manifestStatus) {
				patchFile(`/api/file/${vPath}`, {
					manifestStatus: data.manifestStatus,
					validationErrors: data.validation?.errors ?? [],
					validationErrorCount: data.validation?.errorCount ?? 0,
					validationWarnings: data.validation?.warnings ?? [],
					validationWarningCount: data.validation?.warningCount ?? 0,
					crossRefErrors: data.validation?.crossRefErrors ?? [],
					omittedSubjectIds: data.omittedSubjectIds ?? [],
					allowedSubjectIds: data.allowedSubjectIds ?? [],
				});
			}
			if (validationState.errorCount === 0 && validationState.warningCount === 0 && !llmAdvice) {
				viewMode = 'markdown';
			}
		} catch {
			// silent
		}
	}

	async function allowSubject(subjectId: number) {
		const vPath = autoFixPath;
		const eid = computedExamTypeId;
		if (!vPath || !eid) return;
		try {
			const res = await fetch(
				`/api/file/${vPath}?action=allow-subject&examTypeId=${eid}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ subjectId, allow: true }),
				},
			);
			if (!res.ok) return;
			const data = await res.json();
			if (data?.validation) {
				const warns = data.validation.warnings ?? [];
				validationState = {
					errors: data.validation.errors ?? [],
					errorCount: data.validation.errorCount ?? 0,
					warnings: warns,
					warningCount: data.validation.warningCount ?? warns.length,
				};
				crossRefErrors = data.validation?.crossRefErrors ?? [];
				omittedSubjectIds = data.omittedSubjectIds ?? [];
				allowedSubjectIds = data.allowedSubjectIds ?? [];
				hasManifestValidationData = true;
			}
			if (data?.manifestStatus) {
				patchFile(`/api/file/${vPath}`, {
					manifestStatus: data.manifestStatus,
					validationErrors: data.validation?.errors ?? [],
					validationErrorCount: data.validation?.errorCount ?? 0,
					validationWarnings: data.validation?.warnings ?? [],
					validationWarningCount: data.validation?.warningCount ?? 0,
					crossRefErrors: data.validation?.crossRefErrors ?? [],
					omittedSubjectIds: data.omittedSubjectIds ?? [],
					allowedSubjectIds: data.allowedSubjectIds ?? [],
				});
			}
			if (validationState.errorCount === 0 && validationState.warningCount === 0 && !llmAdvice) {
				viewMode = 'markdown';
			}
		} catch {
			// silent
		}
	}

	async function handleAutoFix() {
		if (!autoFixPath || !computedExamTypeId || aiFixing) return;
		aiFixing = true;
		llmAdvice = '';
		try {
			const res = await fetch(
				`/api/file/${autoFixPath}?action=auto-fix&examTypeId=${computedExamTypeId}`,
				{ method: "POST" },
			);
			if (!res.ok) return;
			const data = await res.json();
			const errors: string[] = data.errors ?? [];
			const warns: string[] = data.warnings ?? [];
			validationState = { errors, errorCount: errors.length, warnings: warns, warningCount: warns.length };
			crossRefErrors = data.crossRefErrors ?? [];
			omittedSubjectIds = data.omittedSubjectIds ?? [];
			allowedSubjectIds = data.allowedSubjectIds ?? [];
			if (data.markdown && errors.length === 0 && editorRef) {
				editorRef.setContent(data.markdown);
			}
			if (data.diagnostics) {
				llmAdvice = data.diagnostics;
			}
			if (errors.length > 0 || warns.length > 0) {
				viewMode = 'validation';
			}
		} catch {
			// silent
		} finally {
			aiFixing = false;
		}
	}

	function handlePublishClick() {
		const filePath = current?.url?.replace(/^\/api\/file\//, "");
		if (!filePath || !computedExamTypeId) {
			import("svelte-sonner").then((m) => m.toast.error("Cannot publish: missing file path or exam type"));
			return;
		}
		if (!isMarksheetFile) {
			import("svelte-sonner").then((m) => m.toast.error("Cannot publish: selected file is not a marksheet"));
			return;
		}
		setGlobalProgress(true);
		commitBeforePdf().then(commitError => {
			if (commitError) {
				setGlobalProgress(false);
				import("svelte-sonner").then((m) => m.toast.error(`Cannot publish: ${commitError}`));
				return;
			}
			const params = new URLSearchParams({
				filePath,
				examTypeId: String(computedExamTypeId),
			});
			fetch(`/api/publish?${params}`)
				.then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
				.then(data => {
					if (data.status === "published") {
						published = true;
						forceEditable = false;
						patchFile(`/api/file/${filePath}`, { manifestStatus: 'Published' });
						import("svelte-sonner").then((m) => m.toast.success(`Result published to ${data.parentEmail}`));
					} else if (data.status === "skipped_already_published" || (data.status === "failed" && data.error?.toLowerCase().includes("already sent"))) {
						setGlobalProgress(false);
						resendData = { filePath, examTypeId: computedExamTypeId!, parentEmail: data.parentEmail, parentName: data.parentName, title: data.studentName };
						resendDialogOpen = true;
						return;
					} else {
						import("svelte-sonner").then((m) => m.toast.error(data.error ?? "Publish failed"));
					}
				})
				.catch((e) => {
					import("svelte-sonner").then((m) => m.toast.error(e instanceof Error ? e.message : "Publish failed"));
				})
				.finally(() => setGlobalProgress(false));
		});
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

	let resendDialogOpen = $state(false);
	let resendData = $state<{ filePath: string; examTypeId: number; parentEmail: string; parentName?: string; title?: string } | null>(null);

	async function handleResendConfirm() {
		if (!resendData) return;
		resendDialogOpen = false;
		setGlobalProgress(true);
		const params = new URLSearchParams({
			filePath: resendData.filePath,
			examTypeId: String(resendData.examTypeId),
			resend: "true",
		});
		try {
			const r = await fetch(`/api/publish?${params}`);
			const data = await r.json();
			if (data.status === "published") {
				patchFile(`/api/file/${resendData.filePath}`, { manifestStatus: 'Published' });
				import("svelte-sonner").then((m) => m.toast.success(`Result published to ${data.parentEmail}`));
			} else {
				import("svelte-sonner").then((m) => m.toast.error(data.error ?? "Publish failed"));
			}
		} catch (e) {
			import("svelte-sonner").then((m) => m.toast.error(e instanceof Error ? e.message : "Publish failed"));
		} finally {
			setGlobalProgress(false);
			resendData = null;
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
								disabled={isStreaming || pdfGenerating}
								aria-label={viewMode === "pdf"
									? "View markdown"
									: "View PDF"}
							>
								{#if viewMode === "pdf"}
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
							: pdfGenerating
								? "Generating PDF…"
								: "View PDF"}
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
						disabled={isStreaming || isPublished}
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
					{#if isPublished}
						<DropdownMenu.Item
							onclick={() => forceEditable = !forceEditable}
						>
							{#if forceEditable}
								<LockIcon class="size-3.5 mr-2" />
								Revert to Read-Only
							{:else}
								<PenSquareIcon class="size-3.5 mr-2" />
								Edit Anyway
							{/if}
						</DropdownMenu.Item>
					{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</header>

	<div class="h-full relative group">
		{#if viewMode === "validation"}
			<ScrollArea class="h-full w-full">
				<div class="p-4 sm:p-6 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300">
					{#if aiFixing}
						<div class="flex flex-col items-center gap-4 py-20 text-muted-foreground">
							<div class="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin gold-glow" />
							<div class="text-center space-y-1">
								<p class="text-sm font-semibold">Analyzing marksheet</p>
								<p class="text-xs text-muted-foreground/60">Running diagnostic checks…</p>
							</div>
						</div>
					{:else if validationState.errorCount > 0 || validationState.warningCount > 0 || llmAdvice}
						<Card.Root class="border-border/60 shadow-sm overflow-hidden">
							<Card.Header class="pb-3 flex-row items-center justify-between gap-4 flex-wrap">
								<Card.Title class="text-sm font-semibold">Validation Results</Card.Title>
								<div class="flex items-center gap-1.5 flex-wrap">
									{#if validationState.errorCount > 0}
										<Badge variant="destructive" class="text-[10px] h-5 px-1.5 gap-1 cursor-default pop-once">
											<AlertCircleIcon class="size-2.5" />
											{validationState.errorCount} error{validationState.errorCount === 1 ? '' : 's'}
										</Badge>
									{/if}
									{#if validationState.warningCount > 0}
										<Badge variant="outline" class="text-[10px] h-5 px-1.5 gap-1 text-amber-600 border-amber-500/30 cursor-default pop-once">
											<AlertTriangleIcon class="size-2.5" />
											{validationState.warningCount} warning{validationState.warningCount === 1 ? '' : 's'}
										</Badge>
									{/if}
								</div>
							</Card.Header>

							<Card.Content class="space-y-3 pt-0">
								{#if crossRefItems.length > 0}
									<Collapsible open={true}>
										<CollapsibleTrigger class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none py-1 cursor-pointer w-full">
											<ChevronRightIcon class="size-3 transition-transform duration-200 data-[state=open]:rotate-90" />
											Unresolved subjects ({crossRefItems.length})
										</CollapsibleTrigger>
										<CollapsibleContent class="transition-spring">
											<div class="mt-2 space-y-1.5">
												{#each crossRefItems as item}
													{@const isOmitted = item.cref && omittedSubjectIds.includes(item.cref.subjectId)}
													{@const isAllowed = item.cref && allowedSubjectIds.includes(item.cref.subjectId)}
													{@const isUnresolvedError = item.cref && item.type === 'error' && item.cref.status === 'unresolved'}
													{@const isAllowedWarning = item.cref && item.type === 'warning' && item.cref.status === 'allowed'}
													<div
														class={cn(
															"flex items-start gap-2 text-[11px] font-mono leading-relaxed px-3 py-2.5 rounded-lg border animate-in fade-in slide-in-from-bottom-1 duration-200",
															item.type === 'error' && 'bg-destructive/5 border-destructive/10 text-destructive/80',
															item.type === 'warning' && isAllowedWarning && 'bg-emerald-500/5 border-emerald-500/10 text-emerald-700/80',
															item.type === 'warning' && !isAllowedWarning && 'bg-amber-500/5 border-amber-500/10 text-amber-600/80',
														)}
													>
														<span class="flex-1 min-w-0 break-words">{item.message}</span>
														{#if !isOmitted}
															{#if isUnresolvedError}
																<div class="flex items-center gap-1 shrink-0">
																	<Tooltip.Root>
																		<Tooltip.Trigger>
																			<Button
																				variant="default"
																				size="xs"
																				onclick={() => allowSubject(item.cref!.subjectId)}
																				class="cursor-pointer h-6 gap-1 px-1.5 text-[10px] font-semibold bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 hover:scale-105 transition-all"
																			>
																				<CheckCircleIcon class="size-3" />
																				Allow
																			</Button>
																		</Tooltip.Trigger>
																		<Tooltip.Content side="top" class="text-[10px] px-2 py-1">
																			Auto-fill missing subject on commit
																		</Tooltip.Content>
																	</Tooltip.Root>
																	<Tooltip.Root>
																		<Tooltip.Trigger>
																			<Button
																				variant="destructive"
																				size="xs"
																				onclick={() => omitSubject(item.cref!.subjectId)}
																				class="cursor-pointer h-6 gap-1 px-1.5 text-[10px] font-semibold hover:scale-105 transition-all"
																			>
																				<XCircleIcon class="size-3" />
																				Omit
																			</Button>
																		</Tooltip.Trigger>
																		<Tooltip.Content side="top" class="text-[10px] px-2 py-1">
																			Exclude subject from result
																		</Tooltip.Content>
																	</Tooltip.Root>
																</div>
															{:else if isAllowedWarning}
																<Tooltip.Root>
																	<Tooltip.Trigger>
																		<Button
																			variant="ghost"
																			size="xs"
																			onclick={() => omitSubject(item.cref!.subjectId)}
																			class="cursor-pointer h-6 gap-1 px-1.5 text-[10px] font-semibold text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 hover:scale-105 transition-all"
																		>
																			<XCircleIcon class="size-3" />
																			Undo
																		</Button>
																	</Tooltip.Trigger>
																	<Tooltip.Content side="top" class="text-[10px] px-2 py-1">
																		Revoke auto-fill — subject will be omitted instead
																	</Tooltip.Content>
																</Tooltip.Root>
															{/if}
														{/if}
													</div>
												{/each}
											</div>
										</CollapsibleContent>
									</Collapsible>
								{/if}

								{#if zodItems.length > 0}
									<Collapsible open={true}>
										<CollapsibleTrigger class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none py-1 cursor-pointer w-full">
											<ChevronRightIcon class="size-3 transition-transform duration-200 data-[state=open]:rotate-90" />
											Schema errors ({zodItems.length})
										</CollapsibleTrigger>
										<CollapsibleContent class="transition-spring">
											<div class="mt-2 space-y-1.5">
												{#each zodItems as item}
													<div class="flex items-start gap-2 text-[11px] font-mono text-destructive/80 leading-relaxed px-3 py-2 rounded-lg border border-destructive/10 bg-destructive/5 animate-in fade-in slide-in-from-bottom-1 duration-200">
														<AlertCircleIcon class="size-3 mt-0.5 shrink-0" />
														<span class="flex-1 min-w-0 break-words">{item.message}</span>
													</div>
												{/each}
											</div>
										</CollapsibleContent>
									</Collapsible>
								{/if}

								{#if llmAdvice}
									<div class="p-3.5 rounded-xl bg-primary/5 border border-primary/10 shadow-sm transition-spring animate-in fade-in duration-300">
										<p class="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
											<AlertCircleIcon class="size-3" />
											AI Diagnosis
										</p>
										<div class="prose prose-sm max-w-none text-foreground/85 leading-relaxed [&_p]:mb-1.5 text-[13px]">
											<Markdown content={llmAdvice} />
										</div>
									</div>
								{/if}
							</Card.Content>

							<Card.Footer class="pt-0">
								<button
									onclick={() => (viewMode = 'markdown')}
									class="text-xs text-muted-foreground/50 hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
								>
									← Back to editor
								</button>
							</Card.Footer>
						</Card.Root>
					{/if}
				</div>
			</ScrollArea>
		{:else if viewMode === "pdf" && pdfGenerating}
			<div class="h-full flex items-center justify-center">
				<div
					class="flex flex-col items-center gap-3 text-muted-foreground"
				>
					<div
						class="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"
					/>
					<span class="text-sm">Generating PDF…</span>
				</div>
			</div>
		{:else if viewMode === "pdf" && pdfUrl && (pdfAvailable || pdfStoragePath)}
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
			<div class="relative group h-full w-full">
				<ScrollArea class="h-full w-full mb-20">
					<div class="p-6 max-w-3xl mx-auto">
						<EditorCanvas
							bind:this={editorRef}
							editorMode="wysiwyg"
							filename={current.url?.split("/").pop() ?? current.title}
							url={current.url ?? ""}
							saveUrl={`${current.saveUrl ?? current.url}?examTypeId=${computedExamTypeId}`}
							content={current.content ?? ""}
							type="text"
							streaming={isStreaming}
							{user}
							bind:validationState
							examTypeId={computedExamTypeId}
							artifactId={computedArtifactId}
							{readOnly}
						/>
					</div>
				</ScrollArea>
				{#if isMarksheetFile}
					<div
						class="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 sm:right-6 z-50 opacity-100 scale-100 md:opacity-0 md:scale-95 md:group-hover:opacity-100 md:group-hover:scale-100 transition-all duration-500 ease-out"
					>
						<button
							onclick={handlePillClick}
							disabled={aiFixing || !computedExamTypeId}
							class="flex items-center gap-1.5 min-h-12 px-3 sm:min-h-0 sm:py-1.5 rounded-full shadow-lg border border-white/20 text-white text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 {pillClasses[validationStatus]}"
						>
							{#if aiFixing}
								<RefreshCwIcon class="size-3.5 animate-spin" />
								Fixing...
							{:else if validationStatus === 'invalid'}
								<AlertCircleIcon class="size-3.5" />
								{validationState.errorCount} error{validationState.errorCount ===
								1
									? ""
									: "s"}
							{:else if validationStatus === 'valid'}
								<CheckIcon class="size-3.5" />
								Valid
							{:else if validationStatus === 'warning'}
								<AlertCircleIcon class="size-3.5" />
								{validationState.warningCount} warning{validationState.warningCount ===
								1
									? ""
									: "s"}
							{:else}
								<AlertCircleIcon class="size-3.5" />
								Not validated
							{/if}
						</button>
					</div>
				{/if}
			</div>
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

<Dialog.Root bind:open={resendDialogOpen}>
	<Dialog.Content class="sm:max-w-md p-0 gap-0 overflow-hidden [&>button]:hidden" showCloseButton={false}>
		<div class="p-6 sm:p-8">
			<div class="mx-auto flex size-12 sm:size-14 items-center justify-center rounded-full bg-primary/10 gold-glow mb-4 sm:mb-5 shrink-0">
				<SendIcon class="size-5 sm:size-6 text-primary" />
			</div>
			<Dialog.Header class="text-center sm:text-center gap-1.5">
				<Dialog.Title class="text-base sm:text-lg font-semibold">Already Published</Dialog.Title>
				<Dialog.Description class="text-sm text-muted-foreground leading-relaxed">
					This result for <span class="font-medium text-foreground">{resendData?.title ?? "this student"}</span>
					was already sent to
					<span class="font-medium text-foreground">{resendData?.parentName ?? resendData?.parentEmail ?? "the parent"}</span>.
					Would you like to send it again?
				</Dialog.Description>
			</Dialog.Header>
		</div>
		<Dialog.Footer class="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 sm:pt-0 flex-col-reverse sm:flex-row gap-2.5">
			<button
				onclick={() => { resendDialogOpen = false; resendData = null; }}
				class="flex-1 sm:flex-none inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:border-border/80 active:scale-[0.98]"
			>Cancel</button>
			<button
				onclick={handleResendConfirm}
				class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.98] gold-glow"
			>
				<SendIcon class="size-3.5" />
				Send Again
			</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

