<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable";
  import EditorCanvas from "./editor-canvas.svelte";
  import * as Accordion from "$lib/components/ui/accordion";

  import { cn } from "$lib/utils/shadcn";
  import { toast } from "svelte-sonner";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import FileIcon from "@lucide/svelte/icons/file";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import SearchIcon from "@lucide/svelte/icons/search";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import ArtifactView from "./ArtifactView.svelte";
  import ExtractionInspector from "./ExtractionInspector.svelte";
  import FileBrowserHeader from "./FileBrowserHeader.svelte";
  import FileTree from "./FileTree.svelte";
  import FloatingToolbar from "./FloatingToolbar.svelte";
  import PublishViewer from "./PublishViewer.svelte";
  import RunHistory from "./RunHistory.svelte";
  import WorkflowStatusBadge from "./WorkflowStatusBadge.svelte";
  import WorkflowStatusPills from "./WorkflowStatusPills.svelte";
  import { useWorkspace } from "./workspace-context.svelte.ts";
  import WorkspaceHeader from "./WorkspaceHeader.svelte";

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
  let fileBrowserPane: any = $state();
  let fileInput: HTMLInputElement;
  let folderInput: HTMLInputElement;
  let ws = useWorkspace();

  $effect(() => {
    if (fileBrowserPane) {
      if (ws.maxPreviewMode) {
        fileBrowserPane.collapse();
      } else {
        fileBrowserPane.expand();
      }
    }
  });

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

  function handleUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      ws.processUpload(target.files);
    }
    target.value = "";
  }

  function triggerUpload() {
    if (fileInput) fileInput.click();
  }

  function triggerFolderUpload() {
    if (folderInput) folderInput.click();
  }

  function focusAction(node: HTMLInputElement) {
    node.focus();
    node.select();
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
  ondragover={ws.handleDragOver}
  ondragleave={ws.handleDragLeave}
  ondrop={ws.handleDrop}
>
  {#if ws.isDragging}
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
  {#if ws.uploadingFiles.length > 0}
    <div
      class="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 min-w-[200px] max-w-[280px]"
    >
      {#each ws.uploadingFiles as f}
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
    connectionStatus={ws.derivedConnectionStatus}
    onRetryConnection={ws.retryWorkflowConnection}
    completionSummaries={ws.completionSummaries}
  />

  <Resizable.PaneGroup direction="horizontal" class="flex-1 min-h-0 w-full">
    <!-- Panel A: File Browser -->
    <Resizable.Pane
      bind:this={fileBrowserPane}
      order={1}
      collapsible={true}
      collapsedSize={0}
      defaultSize={ws.maxPreviewMode ? 0 : 30}
      minSize={20}
      onCollapse={() => {
        ws.maxPreviewMode = true;
      }}
      onExpand={() => {
        ws.maxPreviewMode = false;
      }}
      class="flex flex-col min-h-0 border-r border-white/5 transition-all duration-300 ease-out overflow-hidden"
    >
      <FileBrowserHeader
        workspaceMode={ws.workspaceMode}
        artifactView={ws.artifactView}
        onStartCreate={ws.startCreate}
        onTriggerUpload={triggerUpload}
        onTriggerFolderUpload={triggerFolderUpload}
        onToggleArtifactView={() =>
          (ws.artifactView = ws.artifactView === "grid" ? "list" : "grid")}
      />

      <Accordion.Root type="single" value="explorer" class="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
        {#if ws.recentFiles.length > 0 && !ws.searchQuery}
          <Accordion.Item value="recent" class="border-b border-white/5 bg-slate-950/20 shrink-0">
            <Accordion.Trigger class="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/60 !no-underline w-full hover:bg-white/5">
              <span class="flex items-center gap-2">Recent Files</span>
            </Accordion.Trigger>
            <Accordion.Content class="px-3 pb-2 data-[state=open]:animate-accordion-down ">
              {#if ws.workspaceMode === "artifacts" && ws.artifactView === "grid"}
                <div class="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 pt-2">
                  {#each ws.recentFiles as file}
                    {@const Icon = getFileIcon(file.name)}
                    <button
                      class={cn(
                        "group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-150 cursor-pointer",
                        ws.activeFileKey === file.key
                          ? "border-primary/40 bg-primary/10 text-white"
                          : "border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:bg-white/7 hover:text-white",
                      )}
                      onclick={() => ws.handleFileClick(file)}
                    >
                      <Icon class="size-6 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span class="text-[10px] font-medium leading-tight line-clamp-2 w-full break-all">{file.name}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="flex flex-col gap-0.5 pt-2">
                  {#each ws.recentFiles as file}
                    {@const Icon = getFileIcon(file.name)}
                    <button
                      class={cn(
                        "group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-300 w-full text-left",
                        ws.activeFileKey === file.key
                          ? "text-primary bg-primary/10 font-semibold"
                          : "text-white/40 hover:text-white hover:bg-white/5 font-medium",
                      )}
                      onclick={() => ws.handleFileClick(file)}
                    >
                      <Icon class="size-3.5 opacity-60 group-hover:opacity-100" />
                      <span class="text-[10.5px] truncate max-w-[180px]">{file.name}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </Accordion.Content>
          </Accordion.Item>
        {/if}

        <Accordion.Item value="explorer" class="data-[state=open]:flex-1 flex flex-col min-h-0 border-0">
          <Accordion.Trigger class="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/60 border-b border-white/5 !no-underline w-full hover:bg-white/5 shrink-0">
            <span class="flex items-center gap-2">Explorer</span>
          </Accordion.Trigger>
          <Accordion.Content class="data-[state=open]:flex-1 data-[state=open]:animate-accordion-down min-h-0 overflow-y-auto overflow-x-hidden bg-slate-950/10 !pb-0 w-full">
            {#if ws.workspaceMode === "files"}
              <div class="h-full w-full">
                <FileTree
                  tree={ws.filteredFileTree}
                  expandedDirs={ws.expandedDirs}
                  activeFileKey={ws.activeFileKey}
                  activeDirKey={ws.activeDirKey}
                  workspaceId={ws.workspaceId}
                  nameInputState={ws.nameInputState}
                  bind:nameInputValue={ws.nameInputValue}
                  fileContext={ws.fileContext}
                  inlineError={ws.inlineError}
                  references={ws.fileContext.references}
                  onToggleDir={ws.toggleDir}
                  onFileClick={ws.handleFileClick}
                  onToggleReference={ws.toggleReference}
                  onRenameFile={ws.renameFile}
                  onDeleteFile={ws.deleteFile}
                  onCopyPathToClipboard={ws.copyPathToClipboard}
                  onSubmitInlineAction={ws.submitInlineAction}
                  onCancelInlineAction={ws.cancelInlineAction}
                  onStartRename={ws.startRename}
                  onTriggerExtract={ws.triggerExtract}
                  onDownloadFile={ws.downloadFile}
                  onShareFile={ws.shareFile}
                  onStartCreate={ws.startCreate}
                />
              </div>
            {:else}
              <div class="h-full w-full">
                <ArtifactView
                  groups={ws.artifactGroups}
                  viewMode={ws.artifactView}
                  activeFileKey={ws.activeFileKey}
                  references={ws.fileContext.references}
                  onFileClick={(file) =>
                    ws.handleFileClick({
                      name: file.name,
                      type: "file",
                      key: file.key,
                      size: file.size,
                      lastModified: file.lastModified,
                    })}
                  onToggleReference={(file) =>
                    ws.toggleReference({
                      name: file.name,
                      type: "file",
                      key: file.key,
                      size: file.size,
                      lastModified: file.lastModified,
                    })}
                />
              </div>
            {/if}
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="cloud" class="border-t border-white/5 bg-slate-950/20 shrink-0 border-0">
          <Accordion.Trigger class="px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/60 !no-underline w-full hover:bg-white/5">
            <span class="flex items-center gap-2">Cloud Storage</span>
          </Accordion.Trigger>
          <Accordion.Content class="px-3 pb-2">
            <div class="flex flex-col gap-1.5 pt-2">
              <button class="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-white/50 hover:text-white/80 group">
                <div class="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-70 group-hover:opacity-100"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  <span class="text-[10.5px] font-medium">Google Drive</span>
                </div>
                <span class="text-[9px] px-1.5 py-0.5 rounded-sm bg-white/10 text-white/40 group-hover:text-white/70">Connect</span>
              </button>
              <button class="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-white/50 hover:text-white/80 group">
                <div class="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-70 group-hover:opacity-100"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line></svg>
                  <span class="text-[10.5px] font-medium">OneDrive</span>
                </div>
                <span class="text-[9px] px-1.5 py-0.5 rounded-sm bg-white/10 text-white/40 group-hover:text-white/70">Connect</span>
              </button>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>

      <div class="p-3 border-t border-white/5 bg-slate-950/20 shrink-0">
        <div class="relative group">
          <SearchIcon
            class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/20 group-focus-within:text-[#D4AF37] transition-colors pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search files..."
            class="w-full h-8 bg-white/5 border border-white/5 rounded-lg pl-9 pr-3 text-[11px] text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/40 transition-all font-medium"
            bind:value={ws.searchQuery}
          />
        </div>
      </div>
    </Resizable.Pane>
    <Resizable.Handle
      withHandle
      class={cn(
        "w-px bg-white/5 hover:bg-primary/40 transition-colors z-10",
        ws.maxPreviewMode && "hidden",
      )}
    />

    <!-- Panel B: Preview Area -->
    <Resizable.Pane
      order={2}
      defaultSize={ws.maxPreviewMode ? 100 : 70}
      minSize={30}
      onResize={(size) => {
        if (size < 30 && fileBrowserPane) {
          fileBrowserPane.collapse();
        }
      }}
      class="flex flex-col min-h-0 bg-slate-900/20 backdrop-blur-md relative group"
    >
      <!-- View Tabs Removed for Floating Island Paradigm -->

      <!-- View Content -->
      {#if ws.artifactModeType}
        <div class="flex flex-col h-full bg-slate-950/20 backdrop-blur-md min-w-0 relative">
          <!-- Premium Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 shrink-0">
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]">Artifact Mode</span>
              <h2 class="text-sm font-bold text-white flex items-center gap-2 truncate mt-0.5">
                <FileTextIcon class="size-4 text-primary shrink-0" />
                <span>Reviewing Artifact</span>
              </h2>
            </div>
            
            <div class="flex items-center gap-3">
              <button
                class="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[11px] font-semibold transition-all"
                onclick={() => ws.closeArtifact()}
              >
                Cancel
              </button>
            </div>
          </div>

          <div class="flex-1 flex min-h-0 overflow-hidden relative">
            <EditorCanvas 
              type={ws.artifactModeType === 'pdf' ? 'pdf' : 'text'}
              filename={ws.artifactModeType === 'pdf' ? 'artifact.pdf' : 'artifact.md'}
              content={ws.artifactModeType === 'pdf' ? undefined : (typeof ws.artifactModeContent === 'string' ? ws.artifactModeContent : JSON.stringify(ws.artifactModeContent, null, 2))}
              url={ws.artifactModeType === 'pdf' && typeof ws.artifactModeContent === 'string' ? ws.artifactModeContent : undefined}
              editorMode="wysiwyg"
              onExtract={() => ws.artifactModeCallbacks?.onApprove?.(ws.artifactModeContent)}
              onClose={() => ws.artifactModeCallbacks?.onReject?.(ws.artifactModeContent)}
            />
          </div>
        </div>
      {:else if ws.activeArtifact}
        <!-- HITL OCR/Artifact review view (Phase 3.2) -->
        <div class="flex flex-col h-full bg-slate-950/20 backdrop-blur-md min-w-0">
          <!-- Premium Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 shrink-0">
            <div class="flex flex-col">
              <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]">Human-In-The-Loop Verification</span>
              <h2 class="text-sm font-bold text-white flex items-center gap-2 truncate mt-0.5">
                <FileTextIcon class="size-4 text-primary shrink-0" />
                <span>Reviewing {ws.activeArtifact.fileId}</span>
              </h2>
            </div>
            
            <div class="flex items-center gap-3">
              <button
                class="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[11px] font-semibold transition-all"
                onclick={() => { ws.activeArtifact = null; }}
                disabled={ws.activeArtifact.status === 'submitting'}
              >
                Cancel
              </button>
              <button
                class="px-4 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold transition-all gold-glow hover:brightness-110 flex items-center gap-2"
                onclick={async () => {
                  if (!ws.activeArtifact) return;
                  ws.activeArtifact.status = 'submitting';
                  try {
                    if (ws.activeArtifact.runId) {
                      const res = await fetch('/api/ai/workflow/resume', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          workflowId: ws.activeArtifact.workflowId || 'document-extraction',
                          runId: ws.activeArtifact.runId,
                          stepId: ws.activeArtifact.stepId || 'suspend-for-validation',
                          resumeData: {
                            extractedResults: JSON.parse(ws.activeArtifact.markdown)
                          }
                        })
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to resume workflow');
                      }
                    }
                    ws.activeArtifact.status = 'done';
                    toast.success('Artifact approved successfully!');
                    setTimeout(() => {
                      ws.activeArtifact = null;
                    }, 800);
                  } catch (err: any) {
                    console.error(err);
                    ws.activeArtifact.status = 'reviewing';
                    ws.activeArtifact.error = err.message;
                    toast.error(err.message || 'Approval failed');
                  }
                }}
                disabled={ws.activeArtifact.status === 'submitting'}
              >
                {#if ws.activeArtifact.status === 'submitting'}
                  <ActivityIcon class="size-3.5 animate-spin" />
                  <span>Submitting...</span>
                {:else}
                  <span>Approve & Resume</span>
                {/if}
              </button>
            </div>
          </div>

          <!-- Main Layout Split -->
          <div class="flex-1 flex min-h-0 overflow-hidden relative">
            {#if ws.activeArtifact.status === 'submitting'}
              <div class="absolute inset-0 bg-background/55 backdrop-blur-xs z-50 flex items-center justify-center">
                <div class="flex flex-col items-center gap-3">
                  <ActivityIcon class="size-8 text-primary animate-spin" />
                  <span class="text-xs font-semibold text-white/60 animate-pulse">Processing approval...</span>
                </div>
              </div>
            {/if}

            <div class="w-1/2 flex flex-col border-r border-white/5">
              <div class="px-4 py-2 bg-slate-950/20 border-b border-white/5 flex items-center justify-between shrink-0">
                <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Raw Output / Markdown</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-white/5 font-mono text-white/50">Svelte 5 Reactive Editor</span>
              </div>
              <textarea
                class="flex-1 w-full bg-slate-950/30 p-4 text-xs font-mono text-white/90 placeholder:text-white/20 focus:outline-none resize-none overflow-y-auto leading-relaxed border-0"
                bind:value={ws.activeArtifact.markdown}
              ></textarea>
            </div>
            
            <div class="w-1/2 flex flex-col bg-slate-950/10">
              <div class="px-4 py-2 bg-slate-950/20 border-b border-white/5 flex items-center justify-between shrink-0">
                <span class="text-[10px] font-bold text-white/40 uppercase tracking-wider">Formatted Live Preview</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">Synced</span>
              </div>
              <div class="flex-1 p-6 overflow-y-auto prose prose-invert prose-xs max-w-none">
                {#if ws.activeArtifact.markdown.trim().startsWith('{') || ws.activeArtifact.markdown.trim().startsWith('[')}
                  <pre class="bg-black/40 border border-white/5 rounded-xl p-4 text-[11px] text-amber-300 overflow-x-auto leading-relaxed font-mono">
                    {ws.activeArtifact.markdown}
                  </pre>
                {:else}
                  <div class="text-xs font-medium text-white/80 leading-relaxed whitespace-pre-wrap">
                    {ws.activeArtifact.markdown}
                  </div>
                {/if}
              </div>
            </div>
          </div>

          {#if ws.activeArtifact.error}
            <div class="px-6 py-3 border-t border-destructive/20 bg-destructive/10 text-destructive text-xs font-semibold shrink-0">
              Error: {ws.activeArtifact.error}
            </div>
          {/if}
        </div>
      {:else if ws.activeView === "files"}
        <!-- Files View (headless editor with top bar) -->
        <div class="flex flex-col h-full bg-slate-950/10 min-w-0">
          <!-- Flat Headless Top Bar -->
          <WorkspaceHeader
            onSave={() => editorCanvasRef?.save()}
            onCopy={() => editorCanvasRef?.copy()}
            onShare={() => editorCanvasRef?.share()}
            onUpload={triggerUpload}
            onDownload={() => {
              if (ws.activeFileDef) {
                ws.downloadFile({
                  name: ws.activeFileDef.name,
                  key: ws.activeFileDef.key,
                  type: "file",
                } as any);
              }
            }}
          />

          {#if ws.openedFiles.length > 0}
            <div class="flex-1 min-h-0 relative">
              {#if ws.activeFileDef}
                <EditorCanvas
                  bind:this={editorCanvasRef}
                  filename={ws.activeFileDef.name}
                  url={`/api/file/${encodeURIComponent(ws.activeFileDef.key)}?workspace=${ws.workspaceId}`}
                  type={ws.activeFileDef.type}
                  onDownload={() =>
                    ws.downloadFile({
                      name: ws.activeFileDef!.name,
                      key: ws.activeFileDef!.key,
                      type: "file",
                    } as any)}
                  onExtract={() =>
                    ws.triggerExtract({
                      name: ws.activeFileDef!.name,
                      key: ws.activeFileDef!.key,
                      type: "file",
                    } as any)}
                />
              {/if}
            </div>
          {:else}
            <div
              class="flex-1 flex flex-col items-center justify-center text-center px-12 opacity-20"
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
        </div>
      {:else if ws.activeView === "workflow"}
        <!-- Workflow View: phase-based component mounting -->
        <div class="flex flex-col h-full min-h-0">
          <!-- WorkflowStatusBadge (always shown when not idle) -->
          {#if ws.workflowEvents.workflowStatus !== "idle"}
            <div
              class="px-4 py-3 border-b border-white/5 bg-slate-950/30 shrink-0"
            >
              <WorkflowStatusBadge
                workflowStatus={ws.workflowEvents.workflowStatus}
                error={ws.workflowEvents.error}
              />
            </div>
          {/if}

          <!-- Phase-based view mounting -->
          <div class="flex-1 min-h-0 overflow-hidden">
            {#if ws.showExtractionInspector}
              <ExtractionInspector
                students={ws.extractionStudents}
                runId={ws.extractionRunId}
                status={ws.extractionStatus}
                validationResults={ws.validationResults}
              />
            {:else if ws.showPublishViewer}
              <PublishViewer
                pdfs={ws.publishPdfs}
                status={ws.publishStatus}
                currentStep={ws.publishCurrentStep}
                completionSummary={ws.publishCompletionSummary}
                failedGenerations={ws.publishFailedGenerations}
              />
            {:else if ws.workflowEvents.workflowStatus === "complete"}
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
      {:else if ws.activeView === "run-history"}
        <!-- Run History View (role-gated) -->
        <div class="flex flex-col h-full min-h-0">
          <RunHistory
            runs={ws.runHistoryRuns}
            selectedRun={ws.selectedRun}
            steps={ws.runHistorySteps}
            designationId={ws.designationId}
            onSelectRun={ws.handleSelectRun}
            isLoading={ws.runHistoryLoading}
          />
        </div>
      {/if}

      <!-- Floating Contextual UI — always present, auto-shows on Panel B hover -->
      <FloatingToolbar
        bind:maxPreviewMode={ws.maxPreviewMode}
        bind:ocrEnabled={ws.ocrEnabled}
        bind:compressionEnabled={ws.compressionEnabled}
        bind:activeView={ws.activeView}
        chat={ws.chat}
        uploadingFiles={ws.uploadingFiles}
        workflowStatus={ws.workflowEvents.workflowStatus}
        canViewRunHistory={ws.canViewRunHistory}
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
      if (files) ws.fileContext.add(files);
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
      if (files) ws.fileContext.add(files);
    }}
  />
</aside>
