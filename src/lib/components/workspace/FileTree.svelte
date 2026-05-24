<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import FileIcon from "@lucide/svelte/icons/file";
  import MessageSquarePlusIcon from "@lucide/svelte/icons/message-square-plus";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import MoreVerticalIcon from "@lucide/svelte/icons/more-vertical";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CornerUpRightIcon from "@lucide/svelte/icons/corner-up-right";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
  import CheckIcon from "@lucide/svelte/icons/check";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PinIcon from "@lucide/svelte/icons/pin";
  import { toast } from "svelte-sonner";

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
    tree,
    expandedDirs,
    activeFileKey,
    activeDirKey,
    workspaceId,
    nameInputState,
    nameInputValue = $bindable(),
    fileContext,
    inlineError = null,
    references = [],
    maxReferences = 5,
    onToggleDir,
    onFileClick,
    onToggleReference,
    onRenameFile,
    onDeleteFile,
    onCopyPathToClipboard,
    onSubmitInlineAction,
    onCancelInlineAction,
    onStartRename,
    onTriggerExtract,
    onDownloadFile,
    onShareFile,
    onStartCreate
  }: {
    tree: FileEntry[];
    expandedDirs: Set<string>;
    activeFileKey: string | null;
    activeDirKey: string | null;
    workspaceId: string | null;
    nameInputState: any;
    nameInputValue: string;
    fileContext: any;
    inlineError?: string | null;
    references?: { key: string; name: string; type: "file" | "dir" }[];
    maxReferences?: number;
    onToggleDir: (path: string) => void;
    onFileClick: (entry: FileEntry) => void;
    onToggleReference: (entry: FileEntry) => void;
    onRenameFile: (entry: FileEntry) => void;
    onDeleteFile: (entry: FileEntry) => void;
    onCopyPathToClipboard: (entry: FileEntry) => void;
    onSubmitInlineAction: () => void;
    onCancelInlineAction: () => void;
    onStartRename: (entry: FileEntry, parentPath: string, isMove?: boolean) => void;
    onTriggerExtract: (entry: FileEntry) => void;
    onDownloadFile: (entry: FileEntry) => void;
    onShareFile: (entry: FileEntry) => void;
    onStartCreate: (type: "file" | "dir", path: string) => void;
  } = $props();

  function handleToggleReference(entry: FileEntry) {
    const isReferenced = references.some(r => r.key === entry.key);
    if (!isReferenced && references.length >= maxReferences) {
      toast.error(`Maximum of ${maxReferences} file references reached`);
      return;
    }
    onToggleReference(entry);
  }

  function isEntryReferenced(key: string): boolean {
    return references.some(r => r.key === key);
  }

  function formatSize(bytes?: number) {
    if (!bytes) return "";
    const k = 1024;
    if (bytes < k) return bytes + ' B';
    else if (bytes < k * k) return (bytes / k).toFixed(1) + ' KB';
    else return (bytes / (k * k)).toFixed(1) + ' MB';
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
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return "PDF";
    if (ext === 'md') return "MARKDOWN";
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return "IMAGE";
    if (ext === 'json') return "JSON";
    return "FILE";
  }

  function getFileColor(name: string) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return "bg-rose-900/40 text-rose-300";
    if (ext === 'md') return "bg-blue-900/40 text-blue-300";
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return "bg-purple-900/40 text-purple-300";
    return "bg-slate-800/40 text-slate-400";
  }

  function formatRelativeTime(dateStr?: string) {
    if (!dateStr) return "now";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (mins > 0) return `${mins}m`;
    return "now";
  }

  function focusAction(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<div class="flex flex-col w-full pb-6">
  <!-- Inline create at root level -->
  {#if nameInputState && nameInputState.mode === "create" && nameInputState.parentPath === ""}
    {@render inlineInput("", 0)}
  {/if}
  
  {#if tree.length === 0 && (!nameInputState || nameInputState.mode !== "create")}
    <div class="flex flex-col items-center justify-center p-12 text-center gap-6 mt-12 opacity-40">
       <div class="size-20 rounded-4xl bg-white/5 border border-white/5 flex items-center justify-center shadow-inner">
          <FolderIcon class="size-10 text-white/20" />
       </div>
       <div class="space-y-1">
         <p class="text-xs font-black tracking-widest uppercase">Workspace Empty</p>
         <p class="text-[10px] font-bold text-white/30">Drag assets here to begin</p>
       </div>
       <Button 
         variant="outline" 
         size="sm" 
         class="rounded-xl border-white/5 text-[10px] font-black uppercase px-6"
         onclick={() => onStartCreate('file', '')}
       >
         <FilePlusIcon class="size-3.5 mr-2" />
         Create File
       </Button>
    </div>
  {:else}
    {#each tree as entry (entry.key)}
      {@render treeItem(entry, "")}
    {/each}
  {/if}
</div>

{#snippet inlineInput(parentPath: string, depth: number)}
  <div class="flex flex-col w-full pr-2 py-px">
    <div class="flex items-center">
      <div style="width: {depth * 12 + 12}px" class="shrink-0 transition-all duration-300"></div>
      <div class={cn("flex-1 flex items-center gap-2 pl-1 pr-2 py-0.5 rounded-lg bg-white/10 border", inlineError ? "border-destructive/60" : "border-primary/30")}>
        {#if nameInputState?.type === "dir"}
          <FolderPlusIcon class="size-[14px] opacity-60 text-primary" />
        {:else}
          <FilePlusIcon class="size-[14px] opacity-60 text-primary" />
        {/if}
        <input
          type="text"
          bind:value={nameInputValue}
          class="flex-1 h-6 bg-transparent border-0 px-1 text-[11px] outline-none text-white focus:ring-0"
          placeholder={nameInputState?.mode === 'move' ? "New path..." : (nameInputState?.type === 'dir' ? "Folder name..." : "File name...")}
          onkeydown={(e) => {
             if (e.key === 'Enter') onSubmitInlineAction();
             if (e.key === 'Escape') onCancelInlineAction();
          }}
          use:focusAction
          onblur={() => {
            setTimeout(() => { if (nameInputState) onSubmitInlineAction() }, 100);
          }}
        />
      </div>
    </div>
    {#if inlineError}
      <div class="flex items-center">
        <div style="width: {depth * 12 + 12}px" class="shrink-0 transition-all duration-300"></div>
        <p class="text-[10px] text-destructive font-medium mt-0.5 pl-1">{inlineError}</p>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet treeItem(entry: FileEntry, parentPath: string)}
  {@const fullPath = entry.key}
  {@const isExpanded = expandedDirs.has(fullPath)}
  {@const depth = parentPath.split('/').filter(Boolean).length}

  {#if nameInputState && (nameInputState.mode === "rename" || nameInputState.mode === "move") && nameInputState.originalKey === fullPath}
    {@render inlineInput(parentPath, depth)}
  {:else if entry.type === "dir"}
    <Collapsible.Root open={isExpanded} onOpenChange={(v) => { if (v !== isExpanded) onToggleDir(fullPath) }}>
      <div class="flex w-full items-center min-w-0">
        <Collapsible.Trigger class="w-full min-w-0 text-left">
          {#snippet child({ props: triggerProps })}
            <div 
              role="button"
              tabindex={0}
              {...triggerProps}
              class={cn(
                "flex-1 min-w-0 flex items-center gap-1.5 pr-1 py-0.5 rounded-md group transition-all duration-300 hover:bg-white/5 cursor-pointer text-left focus:outline-none focus:bg-white/5 relative overflow-hidden"
              )}
            >
              <div style="width: {depth * 8}px" class="shrink-0 transition-all duration-300"></div>
              <ChevronRightIcon class={cn("size-3.5 shrink-0 opacity-50 transition-transform duration-200", isExpanded && "rotate-90")} />
              <FolderIcon class={cn("size-[15px] shrink-0 opacity-70 stroke-[1.5]", activeDirKey === fullPath ? 'text-primary opacity-100' : '')} />
              <span class={cn("flex-1 text-[0.85rem] tracking-wide transition-colors duration-200 text-left truncate leading-tight block min-w-0 pr-6", activeDirKey === fullPath ? 'text-primary font-semibold opacity-100' : 'opacity-80 font-medium text-muted-foreground group-hover:opacity-100 group-hover:text-foreground')}>{entry.name}</span>
        
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100! absolute right-1 transition-opacity bg-background/70 backdrop-blur-md rounded-md pl-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6 rounded-md hover:bg-white/10 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                  onclick={(e) => { e.stopPropagation(); handleToggleReference(entry); }}
                >
                  <MessageSquarePlusIcon class={cn("size-3.5", isEntryReferenced(entry.key) ? "text-primary" : "text-white/50 hover:text-white")} />
                </Button>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button
                        variant="ghost"
                        size="icon"
                        {...props}
                        class="size-6 rounded-md hover:bg-white/10 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                        onclick={(e) => { e.stopPropagation(); }}
                      >
                        <MoreVerticalIcon class="size-3.5 text-white/50 hover:text-white" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl p-1 shadow-2xl min-w-[150px]">
                    <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onCopyPathToClipboard(entry)}>
                      <CopyIcon class="size-3.5 opacity-40" />
                      Copy Path
                    </DropdownMenu.Item>
                    <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onStartRename(entry, parentPath)}>
                      <PencilIcon class="size-3.5 opacity-40" />
                      Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onTriggerExtract(entry)}>
                      <ZapIcon class="size-3.5 opacity-40" />
                      Extract
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator class="bg-white/5 my-1" />
                    <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-destructive/20 focus:text-destructive transition-all h-9" onclick={() => onDeleteFile(entry)}>
                      <TrashIcon class="size-3.5 opacity-40" />
                      Delete Folder
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            </div>
          {/snippet}
        </Collapsible.Trigger>
      </div>
      
      <Collapsible.Content class="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {#if entry.children}
          {#if nameInputState && nameInputState.mode === "create" && nameInputState.parentPath === fullPath}
             {@render inlineInput(fullPath, depth + 1)}
          {/if}
          {#each entry.children as child (child.key)}
            {@render treeItem(child, fullPath)}
          {/each}
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>
  {:else}
    {@const Icon = getFileIcon(entry.name)}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props: tooltipProps })}
          <div class="flex w-full items-center min-w-0" {...tooltipProps}>
            <div style="width: {depth * 8 + 8}px" class="shrink-0 transition-all duration-300"></div>
            <div 
              role="button"
              tabindex={0}
              class={cn(
                "flex-1 min-w-0 flex items-center gap-1.5 pr-1 py-0.5 rounded-md group/file transition-all duration-300 hover:bg-white/5 cursor-pointer text-left focus:outline-none focus:bg-white/5 flex-nowrap relative overflow-hidden",
                activeFileKey === entry.key ? 'bg-white/10' : ''
              )}
              onclick={() => onFileClick(entry)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onFileClick(entry) }}
            >
              <Icon class={cn("size-[14px] shrink-0 opacity-60 stroke-[1.5]", activeFileKey === entry.key ? 'text-primary opacity-100' : '')} />
              <span class={cn("flex-1 text-[0.85rem] tracking-wide truncate pr-6 block min-w-0", activeFileKey === entry.key ? 'text-foreground font-semibold opacity-100' : 'opacity-80 font-medium text-muted-foreground group-hover/file:text-foreground group-hover/file:opacity-100 transition-colors duration-200')}>
                {entry.name}
              </span>
              
              <div class="flex items-center gap-0.5 opacity-0 group-hover/file:opacity-100! absolute right-1 transition-opacity bg-background/70 backdrop-blur-md rounded-md pl-1">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props: dp })}
                      <Button
                        variant="ghost"
                        size="icon"
                        {...dp}
                        class="size-6 rounded-md hover:bg-white/10 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                        onclick={(e) => { e.stopPropagation(); }}
                      >
                        <MoreVerticalIcon class="size-3.5 text-white/50 hover:text-white" />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl p-1 shadow-2xl min-w-[150px]">
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onFileClick(entry)}>
                    <EyeIcon class="size-3.5 opacity-40" />
                    View File
                  </DropdownMenu.Item>
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onCopyPathToClipboard(entry)}>
                    <CopyIcon class="size-3.5 opacity-40" />
                    Copy Path
                  </DropdownMenu.Item>
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onDownloadFile(entry)}>
                     <DownloadIcon class="size-3.5 opacity-40" />
                     Download
                  </DropdownMenu.Item>
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onShareFile(entry)}>
                     <Share2Icon class="size-3.5 opacity-40" />
                     Share
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator class="bg-white/5 my-1" />
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onStartRename(entry, parentPath)}>
                    <PencilIcon class="size-3.5 opacity-40" />
                    Rename
                  </DropdownMenu.Item>
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onStartRename(entry, parentPath, true)}>
                    <CornerUpRightIcon class="size-3.5 opacity-40" />
                    Move
                  </DropdownMenu.Item>
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-white/10 transition-all h-9" onclick={() => onTriggerExtract(entry)}>
                    <ZapIcon class="size-3.5 opacity-40" />
                    Extract
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator class="bg-white/5 my-1" />
                  <DropdownMenu.Item class="rounded-lg text-[10px] font-bold uppercase tracking-tight gap-2 focus:bg-destructive/20 focus:text-destructive transition-all h-9" onclick={() => onDeleteFile(entry)}>
                    <TrashIcon class="size-3.5 opacity-40" />
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
              <Button
                variant="ghost"
                size="icon"
                class="size-6 rounded-md hover:bg-white/10 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                onclick={(e) => { e.stopPropagation(); handleToggleReference(entry); }}
              >
                <MessageSquarePlusIcon class={cn("size-3.5", isEntryReferenced(entry.key) ? "text-primary" : "text-white/50 hover:text-white")} />
              </Button>
            </div>
            
            <div class="flex items-center justify-end text-[10px] font-medium text-white/30 opacity-100 group-hover/file:opacity-0 absolute right-2 pointer-events-none transition-opacity">
              {formatRelativeTime(entry.lastModified)}
            </div>
          </div>
          </div>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="right" sideOffset={12} class="bg-black/90 border border-white/10 text-white p-2.5 rounded-xl shadow-2xl flex flex-col gap-1 z-50">
        <p class="text-xs font-semibold break-all max-w-[200px] leading-tight">{entry.name}</p>
        <div class="flex items-center gap-3 text-[10px] text-white/50 font-medium">
           <span class="uppercase tracking-widest">{entry.type}</span>
           {#if entry.size}<span class="tabular-nums">-</span><span class="tabular-nums">{formatSize(entry.size)}</span>{/if}
        </div>
        <p class="text-[9px] text-white/30 truncate max-w-[200px] mt-1">{entry.key}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}
{/snippet}
