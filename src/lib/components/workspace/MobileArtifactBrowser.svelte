<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { useWorkspace } from "./workspace-context.svelte.ts";
  import FileTree from "./FileTree.svelte";
  import MoreVerticalIcon from "@lucide/svelte/icons/more-vertical";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

  let {
    onFileSelect,
  }: {
    onFileSelect: () => void;
  } = $props();

  let ws = useWorkspace();
  let activeSource = $state<"explorer" | "cloud">("explorer");

  function handleFileClick(entry: any) {
    ws.handleFileClick(entry);
    onFileSelect();
  }
</script>

<div class="flex flex-col h-full bg-slate-950/90">
  <div class="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
    <span class="text-[11px] font-bold text-white/70">
      {activeSource === "explorer" ? "Explorer" : "Cloud Storage"}
    </span>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="size-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <MoreVerticalIcon class="size-4" />
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        class="w-48 bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl p-1"
      >
        <DropdownMenu.Item
          class={cn(
            "text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5",
            activeSource === "explorer" && "bg-white/5 text-white",
          )}
          onclick={() => (activeSource = "explorer")}
        >
          <FolderIcon class="size-3.5 mr-2 shrink-0" />
          Explorer
          {#if activeSource === "explorer"}
            <span class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">Active</span>
          {/if}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/40 hover:text-white/70 hover:bg-white/5 opacity-60"
          onclick={() => (activeSource = "cloud")}
          disabled
        >
          <CloudIcon class="size-3.5 mr-2 shrink-0" />
          Cloud Storage
          <span class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">Coming Soon</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
    {#if activeSource === "explorer"}
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
        onFileClick={handleFileClick}
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
    {:else}
      <div class="flex flex-col items-center justify-center h-full text-center px-8 opacity-30">
        <CloudIcon class="size-12 mb-4 text-white/40" />
        <p class="text-[12px] font-black tracking-widest uppercase text-white mb-2">Cloud Storage</p>
        <p class="text-[10px] font-bold text-white/60 leading-relaxed max-w-[200px]">
          Connect cloud storage providers to access files remotely.
        </p>
        <span class="mt-3 text-[9px] px-2 py-1 rounded bg-white/10 text-white/40">Coming Soon</span>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.custom-scrollbar::-webkit-scrollbar) {
    width: 4px;
    height: 4px;
  }
  :global(.custom-scrollbar::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
    background: rgba(var(--primary), 0.1);
    border-radius: 10px;
  }
</style>
