const fs = require('fs');

let content = fs.readFileSync('src/lib/components/workspace/WorkspacePane.svelte', 'utf8');

const scriptEnd = content.indexOf('</script>');
const scriptContent = content.slice(0, scriptEnd);
let templateContent = content.slice(scriptEnd);

const importsEnd = scriptContent.indexOf('interface FlatFile');
let imports = scriptContent.slice(0, importsEnd);
imports = imports.replace(
    'import { WorkflowEventSource } from "$lib/context/workflow-events.svelte";',
    'import { createWorkspaceContext, type FileEntry } from "./workspace-context.svelte.ts";'
);

const propsMatch = scriptContent.match(/let\s*\{\s*onClose,\s*class:\s*className,\s*isMobile\s*=\s*false,\s*\}\s*:\s*\{\s*class\?:\s*string;\s*onClose\?:\s*\(\)\s*=>\s*void;\s*isMobile\?:\s*boolean;\s*\}\s*=\s*\$props\(\);/);
const props = propsMatch ? propsMatch[0] : "";

const refs = "let editorCanvasRef = $state<any>(null);\nlet fileBrowserPane: any = $state();\nlet fileInput: HTMLInputElement;\nlet folderInput: HTMLInputElement;\n";

const init = "const ws = createWorkspaceContext();\n";

const effect = `
  $effect(() => {
    if (fileBrowserPane) {
      if (ws.maxPreviewMode) {
        fileBrowserPane.collapse();
      } else {
        fileBrowserPane.expand();
      }
    }
  });
`;

const utils = `
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
    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg" || ext === "webp") return FileImageIcon;
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
    if (ext === "png" || ext === "jpg" || ext === "jpeg") return "bg-purple-900/40 text-purple-300";
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

    if (days > 0) return \`\${days} day\${days > 1 ? "s" : ""} ago\`;
    if (hours > 0) return \`\${hours} hour\${hours > 1 ? "s" : ""} ago\`;
    if (mins > 0) return \`\${mins} min\${mins > 1 ? "s" : ""} ago\`;
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
`;

const newScript = imports + props + "\n" + refs + "\n" + init + effect + utils + "\n";

const replacements = [
    "displayContext", "workspaceId", "expandedDirs", "rawFiles", "isLoading", 
    "searchQuery", "openedFiles", "recentFiles", "activeFileKey", "activeDirKey", 
    "maxPreviewMode", "activeFileDef", "extractHookEnabled", "ocrEnabled", 
    "compressionEnabled", "isDragging", "uploadingFiles", "completionSummaries", 
    "activeView", "canViewRunHistory", "designationId", "workflowEvents", 
    "extractionStudents", "extractionRunId", "extractionStatus", "validationResults", 
    "publishPdfs", "publishStatus", "publishCurrentStep", "publishCompletionSummary", 
    "publishFailedGenerations", "showExtractionInspector", "showPublishViewer", 
    "derivedConnectionStatus", "runHistoryRuns", "selectedRun", "runHistorySteps", 
    "runHistoryLoading", "nameInputState", "nameInputValue", "inlineError", 
    "resolvedEntries", "filteredFileTree"
];

const methods = [
    "handleFileClick", "toggleDir", "closeFile", "deleteFile", "downloadFile", 
    "shareFile", "copyPathToClipboard", "toggleReference", "triggerExtract", 
    "processUpload", "startCreate", "startRename", "cancelInlineAction", 
    "submitInlineAction", "retryWorkflowConnection", "handleSelectRun", 
    "fetchRunHistory", "fetchWorkspace", "handleDragOver", "handleDragLeave", 
    "handleDrop"
];

for (const prop of [...replacements, ...methods]) {
    const regex = new RegExp("(?<![a-zA-Z0-9_\\\\.$\\\\'\\\"])" + prop + "(?![a-zA-Z0-9_])", 'g');
    templateContent = templateContent.replace(regex, "ws." + prop);
}

templateContent = templateContent.replace(/chat\./g, "ws.chat.");
templateContent = templateContent.replace(/userContext\./g, "ws.userContext.");
templateContent = templateContent.replace(/fileContext\./g, "ws.fileContext.");
templateContent = templateContent.replace(/ws\.ws\./g, "ws.");

templateContent = templateContent.replace(/{ws\.filteredFileTree}/g, 'tree={ws.filteredFileTree}');
templateContent = templateContent.replace(/{ws\.expandedDirs}/g, 'expandedDirs={ws.expandedDirs}');
templateContent = templateContent.replace(/{ws\.activeFileKey}/g, 'activeFileKey={ws.activeFileKey}');
templateContent = templateContent.replace(/{ws\.activeDirKey}/g, 'activeDirKey={ws.activeDirKey}');
templateContent = templateContent.replace(/{ws\.workspaceId}/g, 'workspaceId={ws.workspaceId}');
templateContent = templateContent.replace(/{ws\.nameInputState}/g, 'nameInputState={ws.nameInputState}');
templateContent = templateContent.replace(/{ws\.fileContext}/g, 'fileContext={ws.fileContext}');
templateContent = templateContent.replace(/{ws\.inlineError}/g, 'inlineError={ws.inlineError}');
templateContent = templateContent.replace(/{ws\.validationResults}/g, 'validationResults={ws.validationResults}');

templateContent = templateContent.replace(/bind:ws\.nameInputValue/g, 'bind:nameInputValue={ws.nameInputValue}');

const finalOutput = newScript + templateContent;
fs.writeFileSync('src/lib/components/workspace/WorkspacePane.svelte', finalOutput);
console.log('Refactored');
