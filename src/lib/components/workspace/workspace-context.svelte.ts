// workspace-context.svelte.ts
// Centralizes all workspace state and logic, consumed by WorkspacePane and child components.
import { getContext, setContext, untrack } from "svelte";
import { useChat } from "$lib/context/chat-context.svelte";
import { UserContext } from "$lib/context/user-context.svelte";
import { SelectedClass } from "$lib/context/sync.svelte";
import { FilesContext } from "$lib/context/file-context.svelte";
import { WorkflowEventSource } from "$lib/context/workflow-events.svelte";
import { validateFileName } from "$lib/utils/file-validation";
import { toast } from "svelte-sonner";

const WORKSPACE_CONTEXT_KEY = Symbol("workspace-context");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlatFile {
  name: string;
  size: number;
  type: string;
  key: string;
  lastModified?: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  key: string;
  size?: number;
  lastModified?: string;
  children?: FileEntry[];
  pinned?: boolean;
  tag?: "processed" | "invalid" | "reviewed";
}

export interface OpenedFile {
  key: string;
  name: string;
  type: "text" | "image" | "pdf";
  url: string;
}

export interface StudentExtraction {
  name: string;
  fields: Record<string, string>;
  confidence: "high" | "medium" | "low";
}

export interface ValidationResult {
  studentName: string;
  passed: boolean;
  failures: Array<{ field: string; reason: string }>;
}

export interface CompletionSummary {
  pdfCount: number;
  emailCount: number;
  failedCount: number;
  errors: Array<{ studentName: string; reason: string }>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  durationMs: number | null;
}

export interface RunStep {
  stepName: string;
  stepIndex: number;
  status: string;
  inputPayload: string | null;
  outputPayload: string | null;
  error: string | null;
  stackTrace: string | null;
  durationMs: number | null;
}

export type PanelView = "files" | "workflow" | "run-history";

export type NameInputState = {
  mode: "create" | "rename" | "move";
  type: "file" | "dir";
  parentPath: string;
  initialValue: string;
  originalKey?: string;
} | null;

export interface ArtifactGroup {
  name: string;
  icon: string; // category icon key: "media" | "image" | "document" | "data" | "markdown" | "file"
  files: FlatFile[];
}

// ─── Context Class ────────────────────────────────────────────────────────────

export class WorkspaceContext {
  // ── Injected contexts ──────────────────────────────────────────────────────
  readonly userContext = UserContext.fromContext();
  readonly selectedClass = SelectedClass.fromContext();
  readonly fileContext = FilesContext.fromContext();
  readonly chat = useChat();
  readonly workflowEvents = new WorkflowEventSource();

  // ── Workspace identity ─────────────────────────────────────────────────────
  displayContext = $derived(
    this.userContext.isTeacher && this.userContext.assignedSection
      ? `${this.userContext.assignedSection.className} (${this.userContext.assignedSection.sectionName})`
      : this.selectedClass.data
        ? `${this.selectedClass.data.className} (${this.selectedClass.data.sectionName})`
        : "MAIN",
  );

  workspaceId = $derived(
    this.userContext.isTeacher && this.userContext.assignedSection
      ? `${this.userContext.assignedSection.classId}_${this.userContext.assignedSection.sectionId}`
      : this.selectedClass.data
        ? `${this.selectedClass.data.classId}_${this.selectedClass.data.sectionId}`
        : null,
  );

  // ── File browser ───────────────────────────────────────────────────────────
  expandedDirs = $state<Set<string>>(new Set());
  rawFiles = $state<FlatFile[]>([]);
  isLoading = $state(false);
  searchQuery = $state("");
  openedFiles = $state<OpenedFile[]>([]);
  recentFiles = $state<FileEntry[]>(
    typeof localStorage !== "undefined"
      ? JSON.parse(localStorage.getItem("hermes_recent_files") || "[]")
      : [],
  );
  activeFileKey = $state<string | null>(null);
  activeDirKey = $state<string | null>(null);
  maxPreviewMode = $state(true);

  activeFileDef = $derived(this.openedFiles.find((f) => f.key === this.activeFileKey));

  // ── Upload / drag ──────────────────────────────────────────────────────────
  extractHookEnabled = $state(true);
  ocrEnabled = $state(false);
  compressionEnabled = $state(true);
  isDragging = $state(false);
  uploadingFiles = $state<{ name: string; status: "uploading" | "extracting" | "done" | "error" }[]>([]);

  // ── Panel view ─────────────────────────────────────────────────────────────
  activeView = $state<PanelView>("files");
  
  // ── Editor Features ────────────────────────────────────────────────────────
  copilotEnabled = $state(true);

  // ── Workspace mode (Files vs Artifacts) ───────────────────────────────────
  workspaceMode = $state<"files" | "artifacts">("artifacts");
  artifactView = $state<"list" | "grid">("grid");

  artifactModeContent = $state<any>(null);
  artifactModeType = $state<"markdown" | "pdf" | null>(null);
  artifactModeCallbacks = $state<{ onApprove: (data: any) => void; onReject: (data: any) => void } | null>(null);

  openArtifact(type: "markdown" | "pdf", content: any, callbacks?: { onApprove: (data: any) => void; onReject: (data: any) => void }) {
    this.workspaceMode = "artifacts";
    this.artifactModeType = type;
    this.artifactModeContent = content;
    if (callbacks) this.artifactModeCallbacks = callbacks;
  }
  
  closeArtifact() {
    this.artifactModeType = null;
    this.artifactModeContent = null;
    this.artifactModeCallbacks = null;
    this.workspaceMode = "files";
  }

  // ── Role / permissions ─────────────────────────────────────────────────────
  canViewRunHistory = $derived(this.userContext.isIt || this.userContext.isCoordinator);

  designationId = $derived(
    this.userContext.designation === "it" ? 1
      : this.userContext.designation === "coordinator" ? 5
        : this.userContext.designation === "class_teacher" ? 8
          : 0,
  );

  // ── Workflow completion summaries ──────────────────────────────────────────
  completionSummaries = $state<Array<{
    id: string; workflowName: string;
    status: "success" | "partial-failure";
    stepsCompleted: number; stepsFailed: number;
  }>>([]);

  #previousWorkflowTools = $state<string[]>([]);

  // ── Workflow view state ────────────────────────────────────────────────────
  extractionStudents = $state<StudentExtraction[]>([]);
  extractionRunId = $derived(this.workflowEvents.currentStep?.runId ?? "");
  extractionStatus = $derived(
    this.workflowEvents.workflowStatus === "extracting" ? "extracting" as const
      : this.workflowEvents.workflowStatus === "awaiting-validation" ? "awaiting-validation" as const
        : this.workflowEvents.workflowStatus === "validating" ? "validated" as const
          : "extracting" as const,
  );
  validationResults = $state<ValidationResult[] | undefined>(undefined);

  publishPdfs = $state<Array<{ url: string; studentName: string }>>([]);
  publishStatus = $derived(
    this.workflowEvents.workflowStatus === "awaiting-publish" ? "awaiting-publish" as const
      : this.workflowEvents.workflowStatus === "publishing" ? "dispatching" as const
        : this.workflowEvents.workflowStatus === "complete" ? "complete" as const
          : "generating" as const,
  );
  publishCurrentStep = $derived(this.workflowEvents.currentStep?.stepName ?? "");
  publishCompletionSummary = $state<CompletionSummary | undefined>(undefined);
  publishFailedGenerations = $state<Array<{ studentName: string; reason: string }> | undefined>(undefined);

  showExtractionInspector = $derived(
    this.workflowEvents.workflowStatus === "extracting" ||
    this.workflowEvents.workflowStatus === "awaiting-validation" ||
    this.workflowEvents.workflowStatus === "validating",
  );
  showPublishViewer = $derived(
    this.workflowEvents.workflowStatus === "awaiting-publish" ||
    this.workflowEvents.workflowStatus === "publishing",
  );
  derivedConnectionStatus = $derived(this.workflowEvents.connectionStatus);

  // ── Run history ────────────────────────────────────────────────────────────
  runHistoryRuns = $state<WorkflowRun[]>([]);
  selectedRun = $state<WorkflowRun | null>(null);
  runHistorySteps = $state<RunStep[]>([]);
  runHistoryLoading = $state(false);

  // ── Unified OCR System (Phase 3.1) ─────────────────────────────────────────
  ocrArtifact = $state<{
    fileId: string;
    markdown: string;
    status: 'idle' | 'processing' | 'done' | 'error';
    error?: string;
  } | null>(null);

  activeArtifact = $state<{
    fileId: string;
    markdown: string;
    status: 'idle' | 'reviewing' | 'submitting' | 'done';
    error?: string;
    runId?: string;
    stepId?: string;
    workflowId?: string;
  } | null>(null);

  // ── Inline rename/create ───────────────────────────────────────────────────
  nameInputState = $state<NameInputState>(null);
  nameInputValue = $state("");
  inlineError = $state<string | null>(null);

  // ── Derived file tree ──────────────────────────────────────────────────────
  resolvedEntries = $derived(this.#buildGroupedTree(this.rawFiles));
  filteredFileTree = $derived(this.#filterTree(this.resolvedEntries, this.searchQuery));

  // ── Artifact groups (categorized by file type for Artifact mode) ────────────
  artifactGroups = $derived(this.#buildArtifactGroups(this.rawFiles, this.searchQuery));


  constructor() {
    // Persist recent files
    $effect(() => {
      localStorage.setItem("hermes_recent_files", JSON.stringify(this.recentFiles));
    });

    // Phase 7.7: Wire up suspend events to open Artifact Mode
    this.workflowEvents.onSuspend = (data) => {
      this.openArtifact("markdown", JSON.stringify(data.resumeData?.extractedResults, null, 2), {
        onApprove: async (correctedMarkdown) => {
          this.artifactModeType = null; // show loading or close
          toast.info("Submitting approved artifact...");
          try {
            const res = await fetch("/api/ai/workflow/resume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workflowId: data.workflowId || "document-extraction",
                runId: data.runId,
                stepId: data.stepId || "suspend-for-validation",
                resumeData: {
                  approved: true,
                  correctedMarkdown
                }
              })
            });
            if (!res.ok) throw new Error("Failed to resume workflow");
            toast.success("Artifact approved!");
            this.closeArtifact();
          } catch (err: any) {
            toast.error(err.message || "Approval failed");
          }
        },
        onReject: async () => {
          try {
            const res = await fetch("/api/ai/workflow/resume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workflowId: data.workflowId || "document-extraction",
                runId: data.runId,
                stepId: data.stepId || "suspend-for-validation",
                resumeData: { approved: false }
              })
            });
            if (!res.ok) throw new Error("Failed to reject workflow");
            toast.success("Artifact rejected.");
            this.closeArtifact();
          } catch (err: any) {
            toast.error(err.message || "Rejection failed");
          }
        }
      });
    };

    // Auto-switch to workflow view on active workflow
    $effect(() => {
      const phase = this.workflowEvents.workflowStatus;
      if (phase !== "idle" && phase !== "complete") {
        this.activeView = "workflow";
      }
    });

    // Connect SSE when workflow starts
    $effect(() => {
      const workflows = this.chat.activeWorkflows;
      if (workflows.length > 0 && !this.workflowEvents.currentStep) {
        const first = workflows[0];
        const runId = first.args?.runId ?? first.args?.run_id;
        if (runId) this.workflowEvents.connect(runId);
      }
    });

    // Detect workflow completions for auto-dismiss summaries
    $effect(() => {
      const currentTools = this.chat.activeWorkflows.map((w) => w.tool);
      untrack(() => {
        const prev = this.#previousWorkflowTools;
        for (const tool of prev) {
          if (!currentTools.includes(tool)) {
            const summary = {
              id: `${tool}-${Date.now()}`,
              workflowName: tool,
              status: "success" as const,
              stepsCompleted: 1,
              stepsFailed: 0,
            };
            this.completionSummaries = [...this.completionSummaries, summary];
            setTimeout(() => {
              this.completionSummaries = this.completionSummaries.filter((s) => s.id !== summary.id);
            }, 10_000);
          }
        }
        this.#previousWorkflowTools = currentTools;
      });
    });

    // Fetch workspace on workspaceId change
    $effect(() => {
      this.fetchWorkspace();
      this.openedFiles = [];
      this.activeFileKey = null;
      this.activeDirKey = null;
    });

    // Fetch run history when view activates
    $effect(() => {
      if (this.activeView === "run-history" && this.canViewRunHistory && this.workspaceId) {
        this.fetchRunHistory();
      }
    });
  }

  // ── File fetching ──────────────────────────────────────────────────────────

  fetchWorkspace() {
    if (!this.workspaceId) { this.rawFiles = []; return; }
    this.isLoading = true;
    fetch(`/api/file/?workspace=${this.workspaceId}&action=list`)
      .then((r) => r.json())
      .then((d) => {
        this.rawFiles = d.success && Array.isArray(d.result?.items) ? d.result.items : [];
      })
      .catch((err) => console.error("FS Error:", err))
      .finally(() => (this.isLoading = false));
  }

  // ── Run history ────────────────────────────────────────────────────────────

  async fetchRunHistory() {
    if (!this.workspaceId) return;
    this.runHistoryLoading = true;
    try {
      const res = await fetch(`/api/workflow/runs?workspace=${this.workspaceId}`);
      if (res.ok) this.runHistoryRuns = (await res.json()).runs ?? [];
    } catch (err) {
      console.error("Failed to fetch run history:", err);
    } finally {
      this.runHistoryLoading = false;
    }
  }

  async handleSelectRun(run: WorkflowRun) {
    this.selectedRun = run;
    try {
      const res = await fetch(`/api/workflow/runs/${run.id}/steps`);
      this.runHistorySteps = res.ok ? (await res.json()).steps ?? [] : [];
    } catch {
      this.runHistorySteps = [];
    }
  }

  retryWorkflowConnection() {
    const runId =
      this.workflowEvents.currentStep?.runId ??
      this.chat.activeWorkflows[0]?.args?.runId ??
      this.chat.activeWorkflows[0]?.args?.run_id;
    if (runId) this.workflowEvents.connect(runId);
  }

  // ── File operations ────────────────────────────────────────────────────────

  handleFileClick = (entry: FileEntry) => {
    if (entry.type !== "file" || !this.workspaceId) return;
    this.activeDirKey = null;
    this.activeFileKey = entry.key;
    const filteredRecent = this.recentFiles.filter((f) => f.key !== entry.key);
    this.recentFiles = [entry, ...filteredRecent].slice(0, 5);
    if (this.openedFiles.some((f) => f.key === entry.key)) return;
    this.openedFiles = [...this.openedFiles, {
      key: entry.key, name: entry.name,
      type: this.getFileType(entry.name),
      url: `/api/file/${entry.key}?workspace=${this.workspaceId}`,
    }];
  };

  closeFile = (key: string) => {
    this.openedFiles = this.openedFiles.filter((f) => f.key !== key);
    if (this.activeFileKey === key) {
      this.activeFileKey = this.openedFiles.length > 0 ? this.openedFiles[this.openedFiles.length - 1].key : null;
    }
  };

  deleteFile = (entry: FileEntry) => {
    if (!confirm(`Are you sure you want to delete ${entry.name}?`)) return;
    this.isLoading = true;
    fetch(`/api/file/${encodeURIComponent(entry.key)}?workspace=${this.workspaceId}`, { method: "DELETE" })
      .then(() => this.fetchWorkspace())
      .finally(() => (this.isLoading = false));
  };

  renameFile = (entry: FileEntry) => {
    const newName = prompt(`Rename ${entry.name} to:`, entry.name);
    if (!newName || newName === entry.name) return;

    const pathParts = entry.key.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newKey = pathParts.join("/");

    this.isLoading = true;
    fetch(`/api/file/${encodeURIComponent(entry.key)}?workspace=${this.workspaceId}&action=rename&to=${encodeURIComponent(newKey)}`, { method: "POST" })
      .then(() => this.fetchWorkspace())
      .finally(() => (this.isLoading = false));
  };

  downloadFile = (entry: FileEntry) => {
    if (!this.workspaceId) return;
    const a = document.createElement("a");
    a.href = `/api/file/${encodeURIComponent(entry.key)}?workspace=${this.workspaceId}&action=download`;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  shareFile = async (entry: FileEntry) => {
    if (!this.workspaceId) return;
    try {
      const res = await fetch("/api/file/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: entry.key, workspace: this.workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to generate share link"); return; }
      await navigator.clipboard.writeText(data.url);
      toast.success("Share link copied to clipboard", {
        description: `Expires ${new Date(data.expiresAt).toLocaleDateString()}`,
      });
    } catch {
      toast.error("Failed to generate share link");
    }
  };

  copyPathToClipboard = (entry: FileEntry) => {
    navigator.clipboard.writeText(entry.key);
  };

  toggleReference = (entry: FileEntry) => {
    const isRef = this.fileContext.references.some((r) => r.key === entry.key);
    if (isRef) this.fileContext.removeReference(entry.key);
    else this.fileContext.addReference({ key: entry.key, name: entry.name, type: entry.type });
  };

  triggerExtract = (entry: FileEntry) => {
    if (!this.workspaceId) return;
    this.uploadingFiles = [...this.uploadingFiles, { name: entry.name, status: "extracting" }];
    setTimeout(() => {
      this.uploadingFiles = this.uploadingFiles.filter((u) => u.name !== entry.name);
    }, 2000);
  };

  triggerInstantOcr = async (file: File) => {
    this.ocrArtifact = {
      fileId: file.name,
      markdown: "",
      status: "processing"
    };
    const formData = new FormData();
    formData.append("file", file);
    formData.append("filename", file.name);

    try {
      const res = await fetch("/api/file/ocr", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process OCR");
      }
      this.ocrArtifact = {
        fileId: file.name,
        markdown: data.markdown,
        status: "done"
      };
      this.activeArtifact = {
        fileId: file.name,
        markdown: data.markdown,
        status: "reviewing"
      };
      toast.success("OCR completed successfully");
      this.fetchWorkspace();
    } catch (err: any) {
      console.error("[InstantOCR]", err);
      this.ocrArtifact = {
        fileId: file.name,
        markdown: "",
        status: "error",
        error: err.message
      };
      toast.error(err.message || "OCR processing failed");
    }
  };

  triggerBatchOcr = async (fileKeys: string[]) => {
    this.ocrArtifact = {
      fileId: "batch-job",
      markdown: "Preparing batch job...",
      status: "processing"
    };

    try {
      const res = await fetch("/api/file/ocr/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKeys })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create batch job");
      }

      const { jobId, totalFiles } = data;
      this.ocrArtifact.markdown = `Batch job created. Job ID: ${jobId}. Total files: ${totalFiles}. Polling for results...`;

      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/file/ocr/batch?jobId=${jobId}`);
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          throw new Error(statusData.error || "Failed to poll batch job");
        }

        if (statusData.status === "completed") {
          this.ocrArtifact.markdown = "Batch job completed. Downloading results...";
          const resultsRes = await fetch("/api/file/ocr/batch/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outputFileId: statusData.outputFileId })
          });
          const resultsData = await resultsRes.json();
          if (!resultsRes.ok) {
            throw new Error(resultsData.error || "Failed to download batch results");
          }

          this.ocrArtifact = {
            fileId: "batch-job",
            markdown: `Processed ${resultsData.results.length} files successfully.`,
            status: "done"
          };
          toast.success(`Batch OCR processed ${resultsData.results.length} files`);
          this.fetchWorkspace();
          return;
        } else if (statusData.status === "failed") {
          throw new Error("Mistral batch job failed");
        } else {
          this.ocrArtifact.markdown = `Job ${jobId} status: ${statusData.status}...`;
        }
        attempts++;
      }
      throw new Error("Batch OCR job timed out");
    } catch (err: any) {
      console.error("[BatchOCR]", err);
      this.ocrArtifact = {
        fileId: "batch-job",
        markdown: "",
        status: "error",
        error: err.message
      };
      toast.error(err.message || "Batch OCR failed");
    }
  };


  // ── Upload / drag ──────────────────────────────────────────────────────────

  processUpload = async (files: FileList) => {
    if (!this.workspaceId || !files.length) return;
    for (const file of Array.from(files)) {
      this.uploadingFiles = [...this.uploadingFiles, { name: file.name, status: "uploading" }];
      if (this.compressionEnabled && file.type.startsWith("image/")) {
        await new Promise((r) => setTimeout(r, 600));
      }
      const formData = new FormData();
      formData.append("file", file);
      try {
        await fetch(`/api/file/${encodeURIComponent(file.name)}?workspace=${this.workspaceId}`, { method: "POST", body: formData });
        if (this.extractHookEnabled) {
          this.uploadingFiles = this.uploadingFiles.map((u) => u.name === file.name ? { ...u, status: "extracting" } : u);
          if (this.ocrEnabled && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
            await new Promise((r) => setTimeout(r, 1800));
            try { await fetch(`/api/file/hook/ocr?workspace=${this.workspaceId}&file=${encodeURIComponent(file.name)}`, { method: "POST" }); } catch { }
          } else {
            await new Promise((r) => setTimeout(r, 600));
          }
        }
        this.uploadingFiles = this.uploadingFiles.map((u) => u.name === file.name ? { ...u, status: "done" } : u);
        this.fetchWorkspace();
      } catch {
        this.uploadingFiles = this.uploadingFiles.map((u) => u.name === file.name ? { ...u, status: "error" } : u);
      }
      setTimeout(() => { this.uploadingFiles = this.uploadingFiles.filter((u) => u.name !== file.name); }, 3000);
    }
  };

  handleDragOver = (e: DragEvent) => { e.preventDefault(); this.isDragging = true; };
  handleDragLeave = (e: DragEvent) => { if (e.currentTarget === e.target) this.isDragging = false; };
  handleDrop = (e: DragEvent) => {
    e.preventDefault(); this.isDragging = false;
    if (e.dataTransfer?.files) this.processUpload(e.dataTransfer.files);
  };

  // ── Inline name input ──────────────────────────────────────────────────────

  startCreate = (type: "file" | "dir", parentPath: string = "") => {
    const targetPath = parentPath || this.activeDirKey || "";
    this.nameInputState = { mode: "create", type, parentPath: targetPath, initialValue: "" };
    this.nameInputValue = "";
    this.inlineError = null;
    if (targetPath) {
      const next = new Set(this.expandedDirs);
      next.add(targetPath);
      this.expandedDirs = next;
    }
  };

  startRename = (entry: FileEntry, parentPath: string, isMove = false) => {
    this.nameInputState = {
      mode: isMove ? "move" : "rename", type: entry.type, parentPath,
      initialValue: isMove ? entry.key : entry.name, originalKey: entry.key,
    };
    this.nameInputValue = this.nameInputState.initialValue;
    this.inlineError = null;
  };

  cancelInlineAction = () => { this.nameInputState = null; this.nameInputValue = ""; this.inlineError = null; };

  submitInlineAction = () => {
    if (!this.nameInputState || !this.nameInputValue.trim() || !this.workspaceId) {
      this.cancelInlineAction(); return;
    }
    const state = this.nameInputState;
    const name = this.nameInputValue.trim();
    const validation = validateFileName(name);
    if (!validation.valid) { this.inlineError = validation.error ?? "Invalid name"; return; }
    this.inlineError = null; this.nameInputState = null; this.nameInputValue = "";
    this.isLoading = true;
    if (state.mode === "create") {
      let path = state.parentPath ? `${state.parentPath}/${name}` : name;
      if (state.type === "dir" && !path.endsWith("/")) path += "/.keep";
      const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
      fetch(`/api/file/${encoded}?workspace=${this.workspaceId}`, { method: "POST", body: new Blob([""], { type: "text/plain" }) })
        .then(() => this.fetchWorkspace()).finally(() => (this.isLoading = false));
    } else {
      const oldPath = state.originalKey!;
      const newPath = state.mode === "move" ? name : (state.parentPath ? `${state.parentPath}/${name}` : name);
      const encodedOld = encodeURIComponent(oldPath).replace(/%2F/g, "/");
      fetch(`/api/file/${encodedOld}?workspace=${this.workspaceId}&action=rename&to=${encodeURIComponent(newPath).replace(/%2F/g, "/")}`, { method: "POST" })
        .then(() => this.fetchWorkspace()).finally(() => (this.isLoading = false));
    }
  };

  // ── Dir toggle ─────────────────────────────────────────────────────────────

  toggleDir = (path: string) => {
    this.activeDirKey = path; this.activeFileKey = null;
    const next = new Set(this.expandedDirs);
    if (next.has(path)) next.delete(path); else next.add(path);
    this.expandedDirs = next;
  };

  // ── File helpers ───────────────────────────────────────────────────────────

  getFileType(name: string): "text" | "image" | "pdf" {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["jpg", "png", "jpeg", "svg", "webp", "gif"].includes(ext ?? "")) return "image";
    if (ext === "pdf") return "pdf";
    return "text";
  }

  formatSize(bytes?: number) {
    if (!bytes) return "";
    const k = 1024;
    if (bytes < k) return bytes + " B";
    if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
    return (bytes / (k * k)).toFixed(1) + " MB";
  }

  formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "Just now";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (mins > 0) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    return "Just now";
  }

  // ── Tree building ──────────────────────────────────────────────────────────

  #buildGroupedTree(flat: FlatFile[]): FileEntry[] {
    const root: FileEntry[] = [];
    const map = new Map<string, FileEntry>();
    for (const f of flat) {
      const parts = f.key.split("/").filter(Boolean);
      let currentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!map.has(currentPath)) map.set(currentPath, { name: parts[i], type: "dir", key: currentPath, children: [] });
      }
      if (f.key.endsWith("/")) {
        const dirPath = f.key.slice(0, -1);
        if (dirPath && !map.has(dirPath)) {
          const name = dirPath.split("/").pop() || dirPath;
          map.set(dirPath, { name, type: "dir", key: dirPath, children: [] });
        }
      }
    }
    for (const f of flat) {
      if (f.key.endsWith("/") || f.key.endsWith(".keep")) continue;
      const parts = f.key.split("/").filter(Boolean);
      const parentPath = parts.slice(0, -1).join("/");
      const entry: FileEntry = { name: parts[parts.length - 1], type: "file", key: f.key, size: f.size, lastModified: f.lastModified };
      if (parentPath && map.has(parentPath)) map.get(parentPath)!.children!.push(entry);
      else root.push(entry);
    }
    for (const [path, dirEntry] of map.entries()) {
      const parentPath = path.split("/").slice(0, -1).join("/");
      if (parentPath && map.has(parentPath)) map.get(parentPath)!.children!.push(dirEntry);
      else root.push(dirEntry);
    }
    const sortTree = (nodes: FileEntry[]) => {
      nodes.sort((a, b) => a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name));
      for (const node of nodes) if (node.children) sortTree(node.children);
    };
    sortTree(root);
    return root;
  }

  #filterTree(tree: FileEntry[], query: string): FileEntry[] {
    if (!query.trim()) return tree;
    const q = query.toLowerCase();
    return tree.map((node) => {
      if (node.type === "dir" && node.children) {
        const filtered = this.#filterTree(node.children, query);
        if (filtered.length > 0 || node.name.toLowerCase().includes(q))
          return { ...node, children: node.name.toLowerCase().includes(q) ? node.children : filtered };
        return null;
      }
      return node.name.toLowerCase().includes(q) ? node : null;
    }).filter(Boolean) as FileEntry[];
  }

  #buildArtifactGroups(flat: FlatFile[], query: string): ArtifactGroup[] {
    const CATEGORIES: { name: string; icon: string; extensions: string[] }[] = [
      { name: "Media", icon: "media", extensions: ["mp4", "mp3", "mov", "avi", "wav", "ogg", "webm", "gif"] },
      { name: "Images", icon: "image", extensions: ["png", "jpg", "jpeg", "svg", "webp", "bmp", "avif"] },
      { name: "Documents", icon: "document", extensions: ["pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls"] },
      { name: "Data", icon: "data", extensions: ["csv", "json", "xml", "yaml", "yml"] },
      { name: "Markdown", icon: "markdown", extensions: ["md", "mdx", "txt"] },
    ];

    const q = query.trim().toLowerCase();

    // Collect all real files (skip .keep placeholders and dir markers)
    const allFiles = flat.filter((f) => !f.key.endsWith("/") && !f.key.endsWith(".keep"));

    const groups: ArtifactGroup[] = [];
    const categorised = new Set<string>();

    for (const cat of CATEGORIES) {
      const files = allFiles.filter((f) => {
        const ext = f.key.split(".").pop()?.toLowerCase() ?? "";
        const matches = cat.extensions.includes(ext);
        if (!matches) return false;
        categorised.add(f.key);
        return !q || f.key.split("/").pop()?.toLowerCase().includes(q);
      });
      if (files.length > 0) groups.push({ name: cat.name, icon: cat.icon, files });
    }

    // Uncategorised "Other" group
    const otherFiles = allFiles.filter((f) => {
      if (categorised.has(f.key)) return false;
      return !q || f.key.split("/").pop()?.toLowerCase().includes(q);
    });
    if (otherFiles.length > 0) groups.push({ name: "Other", icon: "file", files: otherFiles });

    return groups;
  }

  // ── Context registration ───────────────────────────────────────────────────

  setContext() { setContext(WORKSPACE_CONTEXT_KEY, this); }
  static fromContext(): WorkspaceContext { return getContext<WorkspaceContext>(WORKSPACE_CONTEXT_KEY); }
}

export function createWorkspaceContext(): WorkspaceContext {
  const ctx = new WorkspaceContext();
  ctx.setContext();
  return ctx;
}

export function useWorkspace(): WorkspaceContext {
  return WorkspaceContext.fromContext();
}
