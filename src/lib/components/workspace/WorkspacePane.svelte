<script lang="ts">
  import { useChat } from "$lib/context/chat-context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedClass } from "$lib/context/sync.svelte";
  import { FilesContext } from "$lib/context/file-context.svelte";
  import { validateFileName } from "$lib/utils/file-validation";
  import EditorCanvas from "./editor-canvas.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { untrack } from "svelte";

  import FloatingToolbar from "./FloatingToolbar.svelte";
  import FileBrowserHeader from "./FileBrowserHeader.svelte";
  import FileTree from "./FileTree.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import SaveIcon from "@lucide/svelte/icons/save";
  import ShareIcon from "@lucide/svelte/icons/share-2";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import BotIcon from "@lucide/svelte/icons/bot";
  import CheckIcon from "@lucide/svelte/icons/check";
  import WorkflowStatusPills from "./WorkflowStatusPills.svelte";
  import ExtractionInspector from "./ExtractionInspector.svelte";
  import PublishViewer from "./PublishViewer.svelte";
  import RunHistory from "./RunHistory.svelte";
  import WorkflowStatusBadge from "./WorkflowStatusBadge.svelte";
  import { WorkflowEventSource } from "$lib/context/workflow-events.svelte";
  import { cn } from "$lib/utils/shadcn";
  import FileIcon from "@lucide/svelte/icons/file";
  import { toast } from "svelte-sonner";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import HistoryIcon from "@lucide/svelte/icons/history";

  interface FlatFile {
    name: string;
    size: number;
    type: string;
    key: string;
    lastModified?: string;
  }

  interface FileEntry {
    name: string;
    type: "file" | "dir";
    key: string;
    size?: number;
    lastModified?: string;
    children?: FileEntry[];
    pinned?: boolean;
    tag?: "processed" | "invalid" | "reviewed";
  }

  let {
    onClose,
    class: className,
    isMobile = false,
  }: {
    class?: string;
    onClose?: () => void;
    isMobile?: boolean;
  } = $props();

  let editorCanvasRef = $state<any>(null);

  const userContext = UserContext.fromContext();
  const selectedClass = SelectedClass.fromContext();
  const fileContext = FilesContext.fromContext();

  let displayContext = $derived(
    userContext.isTeacher && userContext.assignedSection
      ? `${userContext.assignedSection.className} (${userContext.assignedSection.sectionName})`
      : selectedClass.data
        ? `${selectedClass.data.className} (${selectedClass.data.sectionName})`
        : "MAIN",
  );

  let workspaceId = $derived(
    userContext.isTeacher && userContext.assignedSection
      ? `${userContext.assignedSection.classId}_${userContext.assignedSection.sectionId}`
      : selectedClass.data
        ? `${selectedClass.data.classId}_${selectedClass.data.sectionId}`
        : null,
  );

  let expandedDirs = $state<Set<string>>(new Set());
  let rawFiles = $state<FlatFile[]>([]);
  let isLoading = $state(false);
  let searchQuery = $state("");

  let openedFiles = $state<
    { key: string; name: string; type: "text" | "image" | "pdf"; url: string }[]
  >([]);
  let recentFiles = $state<FileEntry[]>(
    typeof localStorage !== "undefined"
      ? JSON.parse(localStorage.getItem("hermes_recent_files") || "[]")
      : [],
  );

  $effect(() => {
    localStorage.setItem("hermes_recent_files", JSON.stringify(recentFiles));
  });
  let activeFileKey = $state<string | null>(null);
  let activeDirKey = $state<string | null>(null);
  let maxPreviewMode = $state(true);
  let activeFileDef = $derived(
    openedFiles.find((f) => f.key === activeFileKey),
  );
  let fileBrowserPane: any = $state();

  $effect(() => {
    if (fileBrowserPane) {
      if (maxPreviewMode) {
        fileBrowserPane.collapse();
      } else {
        fileBrowserPane.expand();
      }
    }
  });

  let fileInput: HTMLInputElement;
  let folderInput: HTMLInputElement;

  let extractHookEnabled = $state(true);
  let ocrEnabled = $state(false);
  let compressionEnabled = $state(true);
  let isDragging = $state(false);
  let uploadingFiles = $state<
    { name: string; status: "uploading" | "extracting" | "done" | "error" }[]
  >([]);

  const chat = useChat();

  // Workflow completion summaries with auto-dismiss after 10s
  let completionSummaries = $state<
    Array<{
      id: string;
      workflowName: string;
      status: "success" | "partial-failure";
      stepsCompleted: number;
      stepsFailed: number;
    }>
  >([]);

  // Track previous activeWorkflows to detect completions
  let previousWorkflowTools = $state<string[]>([]);

  $effect(() => {
    const currentTools = chat.activeWorkflows.map((w) => w.tool);
    untrack(() => {
      // Detect workflows that were active but are no longer (completed)
      for (const tool of previousWorkflowTools) {
        if (!currentTools.includes(tool)) {
          const summary = {
            id: `${tool}-${Date.now()}`,
            workflowName: tool,
            status: "success" as const,
            stepsCompleted: 1,
            stepsFailed: 0,
          };
          completionSummaries = [...completionSummaries, summary];

          // Auto-dismiss after 10 seconds
          const summaryId = summary.id;
          setTimeout(() => {
            completionSummaries = completionSummaries.filter(
              (s) => s.id !== summaryId,
            );
          }, 10_000);
        }
      }
      previousWorkflowTools = currentTools;
    });
  });

  // ─── WorkflowEventSource SSE Integration ───────────────────────────────────
  // Connects SSE events to ExtractionInspector, PublishViewer, and WorkflowStatusBadge
  // Validates: Requirements 5.1, 6.1, 17.1

  const workflowEvents = new WorkflowEventSource();

  // View mode for the right panel: 'files' (default), 'workflow', 'run-history'
  type PanelView = "files" | "workflow" | "run-history";
  let activeView = $state<PanelView>("files");

  // Role-based visibility for Run History (designationId 1 = IT, 5 = Coordinator)
  let canViewRunHistory = $derived(
    userContext.isIt || userContext.isCoordinator,
  );

  // Derive designationId from designation string for RunHistory component
  let designationId = $derived(
    userContext.designation === "it"
      ? 1
      : userContext.designation === "coordinator"
        ? 5
        : userContext.designation === "class_teacher"
          ? 8
          : 0,
  );

  // Auto-switch to workflow view when a workflow starts (non-idle phase)
  $effect(() => {
    const phase = workflowEvents.workflowStatus;
    if (phase !== "idle" && phase !== "complete") {
      activeView = "workflow";
    }
  });

  // Connect WorkflowEventSource when a workflow starts via chat activeWorkflows
  $effect(() => {
    const workflows = chat.activeWorkflows;
    if (workflows.length > 0 && !workflowEvents.currentStep) {
      // Connect to the first active workflow's run ID if available in args
      const firstWorkflow = workflows[0];
      const runId = firstWorkflow.args?.runId ?? firstWorkflow.args?.run_id;
      if (runId) {
        workflowEvents.connect(runId);
      }
    }
  });

  // Expose connection status from WorkflowEventSource
  let derivedConnectionStatus = $derived(workflowEvents.connectionStatus);

  // Retry connection handler
  function retryWorkflowConnection() {
    const runId =
      workflowEvents.currentStep?.runId ??
      chat.activeWorkflows[0]?.args?.runId ??
      chat.activeWorkflows[0]?.args?.run_id;
    if (runId) {
      workflowEvents.connect(runId);
    }
  }

  // ─── Extraction Inspector State ───────────────────────────────────────────────
  // Placeholder state derived from workflow events — in production, this would
  // come from the SSE step-progress data payload containing student extractions

  interface StudentExtraction {
    name: string;
    fields: Record<string, string>;
    confidence: "high" | "medium" | "low";
  }

  interface ValidationResult {
    studentName: string;
    passed: boolean;
    failures: Array<{ field: string; reason: string }>;
  }

  let extractionStudents = $state<StudentExtraction[]>([]);
  let extractionRunId = $derived(workflowEvents.currentStep?.runId ?? "");
  let extractionStatus = $derived(
    workflowEvents.workflowStatus === "extracting"
      ? ("extracting" as const)
      : workflowEvents.workflowStatus === "awaiting-validation"
        ? ("awaiting-validation" as const)
        : workflowEvents.workflowStatus === "validating"
          ? ("validated" as const)
          : ("extracting" as const),
  );
  let validationResults = $state<ValidationResult[] | undefined>(undefined);

  // ─── Publish Viewer State ─────────────────────────────────────────────────────

  interface CompletionSummary {
    pdfCount: number;
    emailCount: number;
    failedCount: number;
    errors: Array<{ studentName: string; reason: string }>;
  }

  let publishPdfs = $state<Array<{ url: string; studentName: string }>>([]);
  let publishStatus = $derived(
    workflowEvents.workflowStatus === "awaiting-publish"
      ? ("awaiting-publish" as const)
      : workflowEvents.workflowStatus === "publishing"
        ? ("dispatching" as const)
        : workflowEvents.workflowStatus === "complete"
          ? ("complete" as const)
          : ("generating" as const),
  );
  let publishCurrentStep = $derived(workflowEvents.currentStep?.stepName ?? "");
  let publishCompletionSummary = $state<CompletionSummary | undefined>(
    undefined,
  );
  let publishFailedGenerations = $state<
    Array<{ studentName: string; reason: string }> | undefined
  >(undefined);

  // ─── Run History State ────────────────────────────────────────────────────────
  interface WorkflowRun {
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

  interface RunStep {
    stepName: string;
    stepIndex: number;
    status: string;
    inputPayload: string | null;
    outputPayload: string | null;
    error: string | null;
    stackTrace: string | null;
    durationMs: number | null;
  }

  let runHistoryRuns = $state<WorkflowRun[]>([]);
  let selectedRun = $state<WorkflowRun | null>(null);
  let runHistorySteps = $state<RunStep[]>([]);
  let runHistoryLoading = $state(false);

  // Fetch run history when the view is activated
  $effect(() => {
    if (activeView === "run-history" && canViewRunHistory && workspaceId) {
      fetchRunHistory();
    }
  });

  async function fetchRunHistory() {
    if (!workspaceId) return;
    runHistoryLoading = true;
    try {
      const res = await fetch(`/api/workflow/runs?workspace=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        runHistoryRuns = data.runs ?? [];
      }
    } catch (err) {
      console.error("Failed to fetch run history:", err);
    } finally {
      runHistoryLoading = false;
    }
  }

  async function handleSelectRun(run: WorkflowRun) {
    selectedRun = run;
    try {
      const res = await fetch(`/api/workflow/runs/${run.id}/steps`);
      if (res.ok) {
        const data = await res.json();
        runHistorySteps = data.steps ?? [];
      }
    } catch (err) {
      console.error("Failed to fetch run steps:", err);
      runHistorySteps = [];
    }
  }

  // Determine which workflow view to show based on phase
  let showExtractionInspector = $derived(
    workflowEvents.workflowStatus === "extracting" ||
      workflowEvents.workflowStatus === "awaiting-validation" ||
      workflowEvents.workflowStatus === "validating",
  );

  let showPublishViewer = $derived(
    workflowEvents.workflowStatus === "awaiting-publish" ||
      workflowEvents.workflowStatus === "publishing",
  );

  function toggleReference(entry: FileEntry) {
    const isReference = fileContext.references.some((r) => r.key === entry.key);
    if (isReference) {
      fileContext.removeReference(entry.key);
    } else {
      fileContext.addReference({
        key: entry.key,
        name: entry.name,
        type: entry.type,
      });
    }
  }

  let nameInputState = $state<{
    mode: "create" | "rename" | "move";
    type: "file" | "dir";
    parentPath: string;
    initialValue: string;
    originalKey?: string;
  } | null>(null);
  let nameInputValue = $state("");
  let inlineError = $state<string | null>(null);

  function startCreate(type: "file" | "dir", parentPath: string = "") {
    const targetPath = parentPath || activeDirKey || "";
    nameInputState = {
      mode: "create",
      type,
      parentPath: targetPath,
      initialValue: "",
    };
    nameInputValue = "";
    inlineError = null;
    if (targetPath) {
      const next = new Set(expandedDirs);
      next.add(targetPath);
      expandedDirs = next;
    }
  }

  function startRename(entry: FileEntry, parentPath: string, isMove = false) {
    nameInputState = {
      mode: isMove ? "move" : "rename",
      type: entry.type,
      parentPath,
      initialValue: isMove ? entry.key : entry.name,
      originalKey: entry.key,
    };
    nameInputValue = nameInputState.initialValue;
    inlineError = null;
  }

  function cancelInlineAction() {
    nameInputState = null;
    nameInputValue = "";
    inlineError = null;
  }

  function submitInlineAction() {
    if (!nameInputState || !nameInputValue.trim() || !workspaceId) {
      nameInputState = null;
      nameInputValue = "";
      inlineError = null;
      return;
    }
    const state = nameInputState;
    const name = nameInputValue.trim();

    // Validate file/directory name (Requirements 8.1, 8.2)
    const validation = validateFileName(name);
    if (!validation.valid) {
      inlineError = validation.error ?? "Invalid name";
      return; // Retain input for correction
    }

    inlineError = null;
    nameInputState = null;
    nameInputValue = "";
    isLoading = true;

    if (state.mode === "create") {
      let path = state.parentPath ? `${state.parentPath}/${name}` : name;
      if (state.type === "dir" && !path.endsWith("/")) {
        path += "/.keep";
      }
      const encodedPath = encodeURIComponent(path).replace(/%2F/g, "/");
      fetch(`/api/file/${encodedPath}?workspace=${workspaceId}`, {
        method: "POST",
        body: new Blob([""], { type: "text/plain" }),
      })
        .then(fetchWorkspace)
        .finally(() => {
          isLoading = false;
        });
    } else if (state.mode === "rename" || state.mode === "move") {
      let oldPath = state.originalKey!;
      let newPath =
        state.mode === "move"
          ? name
          : state.parentPath
            ? `${state.parentPath}/${name}`
            : name;

      const encodedOldPath = encodeURIComponent(oldPath).replace(/%2F/g, "/");
      fetch(
        `/api/file/${encodedOldPath}?workspace=${workspaceId}&action=rename&to=${encodeURIComponent(newPath).replace(/%2F/g, "/")}`,
        {
          method: "POST",
        },
      )
        .then(fetchWorkspace)
        .finally(() => {
          isLoading = false;
        });
    }
  }

  function copyPathToClipboard(entry: FileEntry) {
    navigator.clipboard.writeText(entry.key);
  }

  async function shareFile(entry: FileEntry) {
    if (!workspaceId) return;
    try {
      const res = await fetch("/api/file/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: entry.key, workspace: workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate share link");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      toast.success("Share link copied to clipboard", {
        description: `Expires ${new Date(data.expiresAt).toLocaleDateString()}`,
      });
    } catch (err: any) {
      toast.error("Failed to generate share link");
    }
  }

  function triggerUpload() {
    if (fileInput) fileInput.click();
  }

  function triggerFolderUpload() {
    if (folderInput) folderInput.click();
  }

  function triggerExtract(entry: FileEntry) {
    if (!workspaceId) return;
    const isDir = entry.type === "dir";
    const msg = isDir
      ? `Extracting images and PDFs from ${entry.name}...`
      : `Extracting text from ${entry.name}...`;
    uploadingFiles = [
      ...uploadingFiles,
      { name: entry.name, status: "extracting" },
    ];
    // The actual mistral OCR logic should be hooked up to an API endpoint here.
    setTimeout(() => {
      uploadingFiles = uploadingFiles.filter((u) => u.name !== entry.name);
    }, 2000); // placeholder simulation
  }

  function focusAction(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function processUpload(files: FileList) {
    if (!workspaceId || !files.length) return;

    for (const file of Array.from(files)) {
      const uploadState = { name: file.name, status: "uploading" as const };
      uploadingFiles = [...uploadingFiles, uploadState];

      // Hook logic: Pre-upload compression simulation
      if (compressionEnabled && file.type.startsWith("image/")) {
        console.log(`Compressing ${file.name}...`);
        await new Promise((r) => setTimeout(r, 600));
      }

      const formData = new FormData();
      formData.append("file", file);

      try {
        await fetch(
          `/api/file/${encodeURIComponent(file.name)}?workspace=${workspaceId}`,
          {
            method: "POST",
            body: formData,
          },
        );

        // Hook logic: Post-upload extraction/OCR
        if (extractHookEnabled) {
          uploadingFiles = uploadingFiles.map((u) =>
            u.name === file.name ? { ...u, status: "extracting" } : u,
          );

          if (
            ocrEnabled &&
            (file.type === "application/pdf" || file.type.startsWith("image/"))
          ) {
            // Simulate Mistral Batch API polling
            await new Promise((r) => setTimeout(r, 1800));
            try {
              await fetch(
                `/api/file/hook/ocr?workspace=${workspaceId}&file=${encodeURIComponent(file.name)}`,
                { method: "POST" },
              );
            } catch (e) {}
          } else {
            await new Promise((r) => setTimeout(r, 600));
          }
        }

        uploadingFiles = uploadingFiles.map((u) =>
          u.name === file.name ? { ...u, status: "done" } : u,
        );
        fetchWorkspace();
      } catch (err) {
        uploadingFiles = uploadingFiles.map((u) =>
          u.name === file.name ? { ...u, status: "error" } : u,
        );
      }

      setTimeout(() => {
        uploadingFiles = uploadingFiles.filter((u) => u.name !== file.name);
      }, 3000);
    }
  }

  function handleUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      processUpload(target.files);
    }
    target.value = "";
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    if (e.currentTarget === e.target) {
      isDragging = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files) {
      processUpload(e.dataTransfer.files);
    }
  }

  function deleteFile(entry: FileEntry) {
    if (!confirm(`Are you sure you want to delete ${entry.name}?`)) return;
    isLoading = true;
    fetch(
      `/api/file/${encodeURIComponent(entry.key)}?workspace=${workspaceId}`,
      {
        method: "DELETE",
      },
    )
      .then(fetchWorkspace)
      .finally(() => (isLoading = false));
  }

  function renameFile(entry: FileEntry) {
    const newName = prompt(`Rename ${entry.name} to:`, entry.name);
    if (!newName || newName === entry.name) return;

    const pathParts = entry.key.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newKey = pathParts.join("/");

    isLoading = true;
    fetch(
      `/api/file/${encodeURIComponent(entry.key)}?workspace=${workspaceId}&action=rename&to=${encodeURIComponent(newKey)}`,
      {
        method: "POST",
      },
    )
      .then(fetchWorkspace)
      .finally(() => (isLoading = false));
  }

  function fetchWorkspace() {
    if (!workspaceId) {
      rawFiles = [];
      return;
    }
    isLoading = true;
    fetch(`/api/file/?workspace=${workspaceId}&action=list`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.result?.items)) {
          rawFiles = d.result.items;
          // Expand root dirs by default conceptually
        } else {
          rawFiles = [];
        }
      })
      .catch((err) => console.error("FS Error:", err))
      .finally(() => (isLoading = false));
  }

  $effect(() => {
    // Whenever workspaceId changes, re-fetch the files automatically
    fetchWorkspace();
    openedFiles = [];
    activeFileKey = null;
    activeDirKey = null;
  });

  function buildGroupedTree(flat: FlatFile[]): FileEntry[] {
    const root: FileEntry[] = [];
    const map = new Map<string, FileEntry>();

    // First pass: create all directory entries (implied by paths)
    for (const f of flat) {
      const parts = f.key.split("/").filter(Boolean);
      let currentPath = "";
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!map.has(currentPath)) {
          map.set(currentPath, {
            name: parts[i],
            type: "dir",
            key: currentPath,
            children: [],
          });
        }
      }
      // Also handle explicit raw dirs if they end with '/'
      if (f.key.endsWith("/")) {
        const dirPath = f.key.slice(0, -1);
        if (dirPath && !map.has(dirPath)) {
          const name = dirPath.split("/").pop() || dirPath;
          map.set(dirPath, { name, type: "dir", key: dirPath, children: [] });
        }
      }
    }

    // Second pass: place file items in their parent directories
    for (const f of flat) {
      if (f.key.endsWith("/") || f.key.endsWith(".keep")) continue;

      const parts = f.key.split("/").filter(Boolean);
      const parentPath = parts.slice(0, -1).join("/");
      const entry: FileEntry = {
        name: parts[parts.length - 1],
        type: "file",
        key: f.key,
        size: f.size,
        lastModified: f.lastModified,
      };

      if (parentPath && map.has(parentPath)) {
        map.get(parentPath)!.children!.push(entry);
      } else {
        root.push(entry);
      }
    }

    // Third pass: link directories to their parents
    for (const [path, dirEntry] of map.entries()) {
      const parts = path.split("/");
      const parentPath = parts.slice(0, -1).join("/");
      if (parentPath && map.has(parentPath)) {
        map.get(parentPath)!.children!.push(dirEntry);
      } else {
        root.push(dirEntry);
      }
    }

    // Fourth pass: recursively sort, folders first, then by name alphabetically
    function sortTree(nodes: FileEntry[]) {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) {
          sortTree(node.children);
        }
      }
    }
    sortTree(root);

    return root;
  }

  let resolvedEntries = $derived(buildGroupedTree(rawFiles));

  function filterTree(tree: FileEntry[], query: string): FileEntry[] {
    if (!query.trim()) return tree;
    const lowerQuery = query.toLowerCase();

    return tree
      .map((node) => {
        if (node.type === "dir" && node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (
            filteredChildren.length > 0 ||
            node.name.toLowerCase().includes(lowerQuery)
          ) {
            return {
              ...node,
              children: node.name.toLowerCase().includes(lowerQuery)
                ? node.children
                : filteredChildren,
            };
          }
          return null;
        }
        return node.name.toLowerCase().includes(lowerQuery) ? node : null;
      })
      .filter(Boolean) as FileEntry[];
  }

  let filteredFileTree = $derived(filterTree(resolvedEntries, searchQuery));

  function toggleDir(path: string) {
    activeDirKey = path;
    // We intentionally DO NOT set activeFileKey = null here so the editor remains open
    const next = new Set(expandedDirs);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expandedDirs = next;
  }

  function formatSize(bytes?: number) {
    if (!bytes) return "";
    const k = 1024;
    if (bytes < k) return bytes + " B";
    else if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
    else return (bytes / (k * k)).toFixed(1) + " MB";
  }

  function getFileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return FileTextIcon;
    if (ext === "md" || ext === "txt" || ext === "csv") return FileTextIcon;
    if (
      ext === "png" ||
      ext === "jpg" ||
      ext === "jpeg" ||
      ext === "svg" ||
      ext === "webp"
    )
      return FileImageIcon;
    if (ext === "json") return FileJsonIcon;
    return FileIcon;
  }

  function getFileTypeLabel(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "PDF";
    if (ext === "md") return "MARKDOWN";
    if (ext === "png" || ext === "jpg" || ext === "jpeg") return "IMAGE";
    if (ext === "json") return "JSON";
    return "FILE";
  }

  function getFileColor(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "bg-rose-900/40 text-rose-300";
    if (ext === "md") return "bg-blue-900/40 text-blue-300";
    if (ext === "png" || ext === "jpg" || ext === "jpeg")
      return "bg-purple-900/40 text-purple-300";
    return "bg-slate-800/40 text-slate-400";
  }

  function getFileType(name: string): "text" | "image" | "pdf" {
    const ext = name.split(".").pop()?.toLowerCase();
    if (
      ext === "jpg" ||
      ext === "png" ||
      ext === "jpeg" ||
      ext === "svg" ||
      ext === "webp" ||
      ext === "gif"
    )
      return "image";
    if (ext === "pdf") return "pdf";
    return "text";
  }

  function handleFileClick(entry: FileEntry) {
    if (entry.type === "file" && workspaceId) {
      activeDirKey = null;
      activeFileKey = entry.key;

      // Update recent files
      const filteredRecent = recentFiles.filter((f) => f.key !== entry.key);
      recentFiles = [entry, ...filteredRecent].slice(0, 5);

      if (openedFiles.some((f) => f.key === entry.key)) return;

      const type = getFileType(entry.name);
      openedFiles = [
        ...openedFiles,
        {
          key: entry.key,
          name: entry.name,
          type,
          url: `/api/file/${entry.key}?workspace=${workspaceId}`,
        },
      ];
    }
  }

  function closeFile(key: string) {
    openedFiles = openedFiles.filter((f) => f.key !== key);
    if (activeFileKey === key) {
      activeFileKey =
        openedFiles.length > 0 ? openedFiles[openedFiles.length - 1].key : null;
    }
  }

  function downloadFile(entry: FileEntry) {
    if (!workspaceId) return;
    const url = `/api/file/${encodeURIComponent(entry.key)}?workspace=${workspaceId}&action=download`;
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "Just now";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (mins > 0) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    return "Just now";
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside
  class={cn(
    className,
    "flex flex-col bg-background/40 backdrop-blur-3xl relative overflow-hidden shadow-2xl",
    !isMobile
      ? "h-[calc(100%-1rem)] m-2 rounded-2xl border border-white/10"
      : "h-full w-full border-l border-white/5",
  )}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {#if isDragging}
    <div
      class="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary/50 m-2 rounded-xl pointer-events-none"
    >
      <div class="flex flex-col items-center gap-3 text-primary">
        <UploadIcon class="size-8 animate-bounce" />
        <span class="font-semibold tracking-wide text-sm"
          >Drop files to upload</span
        >
      </div>
    </div>
  {/if}

  <!-- Status Pill Overlay -->
  {#if uploadingFiles.length > 0}
    <div
      class="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 min-w-[200px] max-w-[280px]"
    >
      {#each uploadingFiles as f}
        <div
          class="rounded-full bg-background/95 backdrop-blur-md border shadow-lg px-3 py-1.5 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-wide"
        >
          <span class="truncate flex-1 max-w-[150px]">{f.name}</span>
          {#if f.status === "uploading"}
            <span class="text-primary animate-pulse">Uploading...</span>
          {:else if f.status === "extracting"}
            <span class="text-amber-500 animate-pulse">Extracting (OCR)...</span
            >
          {:else if f.status === "done"}
            <span class="text-emerald-500">Done</span>
          {:else if f.status === "error"}
            <span class="text-destructive">Error</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Workflow Running Indicators (Requirements 14.1, 14.3, 14.4, 14.5, 14.7) -->
  <WorkflowStatusPills
    connectionStatus={derivedConnectionStatus}
    onRetryConnection={retryWorkflowConnection}
    {completionSummaries}
  />

  <Resizable.PaneGroup direction="horizontal" class="flex-1 min-h-0 w-full">
    <!-- Panel A: File Browser -->
    <Resizable.Pane
      bind:this={fileBrowserPane}
      order={1}
      collapsible={true}
      collapsedSize={0}
      defaultSize={maxPreviewMode ? 0 : 30}
      minSize={20}
      class="flex flex-col min-h-0 border-r border-white/5 transition-all duration-300 ease-out overflow-hidden"
    >
      <FileBrowserHeader
        onStartCreate={startCreate}
        onTriggerUpload={triggerUpload}
        onTriggerFolderUpload={triggerFolderUpload}
      />

      {#if recentFiles.length > 0 && !searchQuery}
        <details
          class="group/recent border-b border-white/5 bg-slate-950/20 px-3 py-2 cursor-pointer outline-none"
        >
          <summary
            class="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.2em] text-white/40 group-open/recent:text-white/60 mb-1 outline-none list-none marker:hidden"
          >
            <span class="flex items-center gap-2">Recent Files</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="transition-transform group-open/recent:rotate-180 opacity-50"
              ><polyline points="6 9 12 15 18 9"></polyline></svg
            >
          </summary>
          <div class="flex flex-col gap-0.5 pt-2 pb-1">
            {#each recentFiles as file}
              {@const Icon = getFileIcon(file.name)}
              <button
                class={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-300 w-full text-left",
                  activeFileKey === file.key
                    ? "text-primary bg-white/5 font-semibold"
                    : "text-white/40 hover:text-white hover:bg-white/5 font-medium",
                )}
                onclick={() => handleFileClick(file)}
              >
                <Icon class="size-3.5 opacity-60 group-hover:opacity-100" />
                <span class="text-[10.5px] truncate max-w-[180px]"
                  >{file.name}</span
                >
              </button>
            {/each}
          </div>
        </details>
      {/if}

      <div class="flex-1 w-full bg-slate-950/10 overflow-hidden">
        <FileTree
          tree={filteredFileTree}
          {expandedDirs}
          {activeFileKey}
          {activeDirKey}
          {workspaceId}
          {nameInputState}
          bind:nameInputValue
          {fileContext}
          {inlineError}
          references={fileContext.references}
          onToggleDir={toggleDir}
          onFileClick={handleFileClick}
          onToggleReference={toggleReference}
          onRenameFile={renameFile}
          onDeleteFile={deleteFile}
          onCopyPathToClipboard={copyPathToClipboard}
          onSubmitInlineAction={submitInlineAction}
          onCancelInlineAction={cancelInlineAction}
          onStartRename={startRename}
          onTriggerExtract={triggerExtract}
          onDownloadFile={downloadFile}
          onShareFile={shareFile}
          onStartCreate={startCreate}
        />
      </div>

      <div class="p-3 border-t border-white/5 bg-slate-950/20 shrink-0">
        <div class="relative group">
          <SearchIcon
            class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/20 group-focus-within:text-[#D4AF37] transition-colors pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search files..."
            class="w-full h-8 bg-white/5 border border-white/5 rounded-lg pl-9 pr-3 text-[11px] text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
            bind:value={searchQuery}
          />
        </div>
      </div>
    </Resizable.Pane>
    <Resizable.Handle
      withHandle
      class={cn(
        "w-px bg-white/5 hover:bg-primary/40 transition-colors z-10",
        maxPreviewMode && "hidden",
      )}
    />

    <!-- Panel B: Preview Area -->
    <Resizable.Pane
      order={2}
      defaultSize={maxPreviewMode ? 100 : 70}
      minSize={30}
      class="flex flex-col min-h-0 bg-slate-900/20 backdrop-blur-md relative group"
    >
      <!-- View Tabs Removed for Floating Island Paradigm -->

      <!-- View Content -->
      {#if activeView === "files"}
        <!-- Files View (headless editor with top bar) -->
        {#if openedFiles.length > 0}
          <div class="flex flex-col h-full bg-slate-950/10">
            <!-- Flat Headless Top Bar -->
            <div
              class="flex items-center justify-between h-12 px-4 shrink-0 bg-transparent"
            >
              <!-- Left: Document Title Dropdown -->
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2 text-[13px] font-semibold text-white/90 hover:bg-white/5 hover:text-white flex items-center gap-2"
                    >
                      <FileIcon class="size-4 text-primary/80" />
                      {activeFileDef?.name || "Untitled"}
                      <ChevronDownIcon class="size-3.5 text-white/40" />
                    </Button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                  align="start"
                  class="w-56 bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl"
                >
                  <DropdownMenu.Group>
                    <DropdownMenu.Label
                      class="text-[10px] uppercase tracking-wider text-white/40 px-2 py-1.5"
                      >Open Files</DropdownMenu.Label
                    >
                    {#each openedFiles as file}
                      <DropdownMenu.Item
                        class={cn(
                          "text-[12px] font-medium rounded-lg cursor-pointer my-0.5",
                          activeFileKey === file.key
                            ? "bg-primary/20 text-white"
                            : "text-white/60 hover:text-white hover:bg-white/5",
                        )}
                        onclick={() => (activeFileKey = file.key)}
                      >
                        <FileIcon class="size-3 mr-2" />
                        {file.name}
                        {#if activeFileKey === file.key}
                          <CheckIcon class="size-3 ml-auto text-primary" />
                        {/if}
                      </DropdownMenu.Item>
                    {/each}
                  </DropdownMenu.Group>
                </DropdownMenu.Content>
              </DropdownMenu.Root>

              <!-- Far Right: Actions & Agent Role -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                  onclick={() => editorCanvasRef?.save()}
                >
                  <SaveIcon class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                  onclick={() => editorCanvasRef?.copy()}
                >
                  <CopyIcon class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                  onclick={() => editorCanvasRef?.share()}
                >
                  <ShareIcon class="size-4" />
                </Button>

                <div class="w-px h-4 bg-white/10 mx-1"></div>

                <!-- Agent Role Dropdown -->
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      {@const chatAny = chat as any}
                      <Button
                        {...props}
                        variant="ghost"
                        size="sm"
                        class="h-8 px-2.5 rounded-lg text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5 ml-1"
                      >
                        <BotIcon class="size-3.5" />
                        <span class="max-w-[80px] truncate"
                          >{chatAny?.activeAgent?.label || "Hermes"}</span
                        >
                        <ChevronDownIcon class="size-3 opacity-70" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content
                    align="end"
                    class="w-48 bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl"
                  >
                    {@const chatAny = chat as any}
                    <DropdownMenu.Label
                      class="text-[10px] uppercase tracking-wider text-white/40"
                      >Select Agent</DropdownMenu.Label
                    >
                    <DropdownMenu.Separator class="bg-white/5" />
                    {#if chatAny?.agents}
                      {#each chatAny.agents as agent}
                        <DropdownMenu.Item
                          class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
                          onclick={() => (chatAny.activeAgent = agent)}
                        >
                          {agent.label}
                          {#if chatAny?.activeAgent?.id === agent.id}
                            <CheckIcon class="size-3 ml-auto text-primary" />
                          {/if}
                        </DropdownMenu.Item>
                      {/each}
                    {/if}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            </div>

            <div class="flex-1 min-h-0 relative">
              {#if activeFileDef}
                <EditorCanvas
                  bind:this={editorCanvasRef}
                  filename={activeFileDef.name}
                  url={`/api/file/${encodeURIComponent(activeFileDef.key)}?workspace=${workspaceId}`}
                  type={activeFileDef.type}
                  onDownload={() =>
                    downloadFile({
                      name: activeFileDef!.name,
                      key: activeFileDef!.key,
                      type: "file",
                    } as any)}
                  onExtract={() =>
                    triggerExtract({
                      name: activeFileDef!.name,
                      key: activeFileDef!.key,
                      type: "file",
                    } as any)}
                />
              {/if}
            </div>
          </div>
        {:else}
          <div
            class="h-full flex flex-col items-center justify-center text-center px-12 opacity-20"
          >
            <div
              class="size-24 rounded-[2.5rem] bg-white/5 flex items-center justify-center mb-8 border border-white/5"
            >
              <EyeIcon class="size-10" />
            </div>
            <p
              class="text-[13px] font-black tracking-widest uppercase mb-3 text-white"
            >
              Workspace Preview
            </p>
            <p
              class="text-[11px] font-bold text-white/60 leading-relaxed max-w-[280px]"
            >
              Select a file to inspect and trigger AI workflows.
            </p>
          </div>
        {/if}
      {:else if activeView === "workflow"}
        <!-- Workflow View: phase-based component mounting -->
        <div class="flex flex-col h-full min-h-0">
          <!-- WorkflowStatusBadge (always shown when not idle) -->
          {#if workflowEvents.workflowStatus !== "idle"}
            <div
              class="px-4 py-3 border-b border-white/5 bg-slate-950/30 shrink-0"
            >
              <WorkflowStatusBadge
                workflowStatus={workflowEvents.workflowStatus}
                error={workflowEvents.error}
              />
            </div>
          {/if}

          <!-- Phase-based view mounting -->
          <div class="flex-1 min-h-0 overflow-hidden">
            {#if showExtractionInspector}
              <ExtractionInspector
                students={extractionStudents}
                runId={extractionRunId}
                status={extractionStatus}
                {validationResults}
              />
            {:else if showPublishViewer}
              <PublishViewer
                pdfs={publishPdfs}
                status={publishStatus}
                currentStep={publishCurrentStep}
                completionSummary={publishCompletionSummary}
                failedGenerations={publishFailedGenerations}
              />
            {:else if workflowEvents.workflowStatus === "complete"}
              <!-- Completion state -->
              <div
                class="h-full flex flex-col items-center justify-center text-center px-8 gap-4"
              >
                <div
                  class="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                >
                  <ActivityIcon class="size-7 text-emerald-400" />
                </div>
                <div class="space-y-1.5">
                  <p class="text-[12px] font-bold text-emerald-400">
                    Workflow Complete
                  </p>
                  <p
                    class="text-[10px] text-white/40 leading-relaxed max-w-[260px]"
                  >
                    The workflow has finished. Check the results above or switch
                    to Files view.
                  </p>
                </div>
              </div>
            {:else}
              <!-- Idle / waiting state -->
              <div
                class="h-full flex flex-col items-center justify-center text-center px-8 opacity-30"
              >
                <div
                  class="size-20 rounded-4xl bg-white/5 flex items-center justify-center mb-6 border border-white/5"
                >
                  <ActivityIcon class="size-9" />
                </div>
                <p
                  class="text-[12px] font-black tracking-widest uppercase mb-2 text-white"
                >
                  Workflow Monitor
                </p>
                <p
                  class="text-[10px] font-bold text-white/60 leading-relaxed max-w-[260px]"
                >
                  Start a workflow via slash commands to see real-time progress
                  here.
                </p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeView === "run-history"}
        <!-- Run History View (role-gated) -->
        <div class="flex flex-col h-full min-h-0">
          <RunHistory
            runs={runHistoryRuns}
            {selectedRun}
            steps={runHistorySteps}
            {designationId}
            onSelectRun={handleSelectRun}
            isLoading={runHistoryLoading}
          />
        </div>
      {/if}

      <!-- Floating Contextual UI — always present, auto-shows on Panel B hover -->
      <FloatingToolbar
        bind:maxPreviewMode
        bind:ocrEnabled
        bind:compressionEnabled
        bind:activeView
        {chat}
        {uploadingFiles}
        workflowStatus={workflowEvents.workflowStatus}
        {canViewRunHistory}
      />
    </Resizable.Pane>
  </Resizable.PaneGroup>

  <input
    type="file"
    bind:this={fileInput}
    class="hidden"
    multiple
    onchange={(e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) fileContext.add(files);
    }}
  />
  <input
    type="file"
    bind:this={folderInput}
    class="hidden"
    webkitdirectory
    multiple
    onchange={(e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) fileContext.add(files);
    }}
  />
</aside>
