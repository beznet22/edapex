<script lang="ts">
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import { useWorkspace } from "$lib/components/workspace/workspace-context.svelte";

  export let filename: string;
  export let url: string;

  const ws = useWorkspace();

  function handleClick(e: MouseEvent) {
    e.preventDefault();
    ws.openArtifact("pdf", null, {
      onApprove: () => {},
      onReject: () => {}
    });
    // the url can be fetched inside the workspace context or EditorCanvas
    // Wait, EditorCanvas handles url="...". We just need to set the workspace active artifact/file.
    ws.workspaceMode = "artifacts";
    ws.activeFileKey = url;
    // Let's use EditorCanvas inside WorkspacePane to load it?
    // Let's just use openArtifact for it or add it to openedFiles
    ws.openArtifact("pdf", null);
    // Actually, we can add a method to open a URL as PDF in the workspace pane.
  }
</script>

<button
  class="flex items-center gap-3 p-3 mt-2 mb-2 rounded-xl border border-white/10 bg-slate-900/50 hover:bg-slate-800/80 transition-all text-left w-64 group cursor-pointer shadow-sm hover:shadow-md"
  onclick={handleClick}
>
  <div class="p-2 rounded-lg bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-colors">
    <FileTextIcon class="size-5" />
  </div>
  <div class="flex flex-col flex-1 min-w-0">
    <span class="text-sm font-semibold text-white truncate">{filename}</span>
    <span class="text-[10px] text-white/50 uppercase tracking-widest font-bold">Generated PDF</span>
  </div>
</button>
