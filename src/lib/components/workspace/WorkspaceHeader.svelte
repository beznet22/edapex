<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import FileIcon from "@lucide/svelte/icons/file";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import CheckIcon from "@lucide/svelte/icons/check";
  import SaveIcon from "@lucide/svelte/icons/save";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import Share2Icon from "@lucide/svelte/icons/share-2";
  import FoldersIcon from "@lucide/svelte/icons/folders";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import MoreVerticalIcon from "@lucide/svelte/icons/more-vertical";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import { useWorkspace } from "./workspace-context.svelte.ts";
  import * as Tooltip from "$lib/components/ui/tooltip";

  let {
    onSave,
    onCopy,
    onShare,
    onDownload,
    onUpload,
  }: {
    onSave?: () => void;
    onCopy?: () => void;
    onShare?: () => void;
    onDownload?: () => void;
    onUpload?: () => void;
  } = $props();

  const ws = useWorkspace();
</script>

<div class="flex items-center justify-between h-12 px-2 sm:px-4 shrink-0 bg-transparent gap-2 min-w-0 w-full overflow-hidden">
  <!-- Left: Document Title Dropdown -->
  <div class="flex items-center min-w-0 flex-1 gap-1">
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class={cn(
              "size-8 shrink-0 rounded-lg transition-all duration-300 hidden md:flex",
              !ws.maxPreviewMode
                ? "text-[#D4AF37] bg-[#D4AF37]/10"
                : "text-white/40 hover:text-white hover:bg-white/5",
            )}
            onclick={() => (ws.maxPreviewMode = !ws.maxPreviewMode)}
          >
            <PanelLeftIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="bottom">Toggle File Browser</Tooltip.Content>
    </Tooltip.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-[13px] font-semibold text-white/90 hover:bg-white/5 hover:text-white flex items-center gap-2 min-w-0 max-w-full shrink overflow-hidden"
          >
            <FileIcon class="size-4 text-primary/80 shrink-0" />
            <span class="truncate text-left block min-w-0 shrink">
              {ws.activeFileDef?.name.split('/').pop() || "Untitled"}
            </span>
            <ChevronDownIcon class="size-3.5 text-white/40 shrink-0" />
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
        {#each ws.openedFiles as file}
          <DropdownMenu.Item
            class={cn(
              "text-[12px] font-medium rounded-lg cursor-pointer my-0.5",
              ws.activeFileKey === file.key
                ? "bg-primary/20 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5",
            )}
            onclick={() => (ws.activeFileKey = file.key)}
          >
            <FileIcon class="size-3 mr-2 shrink-0" />
            <span class="truncate">{file.name.split('/').pop()}</span>
            {#if ws.activeFileKey === file.key}
              <CheckIcon class="size-3 ml-auto text-primary shrink-0" />
            {/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
  </div>

  <!-- Far Right: Actions & Workspace Mode Toggle -->
  <div class="flex items-center gap-1 shrink-0">
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
            onclick={onSave}
            disabled={!ws.activeFileDef}
          >
            <SaveIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Save File</Tooltip.Content>
    </Tooltip.Root>

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
            onclick={onCopy}
            disabled={!ws.activeFileDef}
          >
            <CopyIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Copy Content</Tooltip.Content>
    </Tooltip.Root>

    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
            onclick={onUpload}
          >
            <UploadIcon class="size-4" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>Upload File</Tooltip.Content>
    </Tooltip.Root>

    <div class="w-px h-4 bg-white/10 mx-1"></div>

    <!-- Workspace Options Menu -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5 ml-1"
          >
            <MoreVerticalIcon class="size-4" />
          </Button>
        {/snippet}d
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        class="w-48 bg-slate-950/90 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl p-1 z-50"
      >
        <DropdownMenu.Item
          class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
          onclick={onShare}
          disabled={!ws.activeFileDef}
        >
          <Share2Icon class="size-3.5 mr-2 shrink-0" />
          Share
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
          onclick={onDownload}
          disabled={!ws.activeFileDef}
        >
          <DownloadIcon class="size-3.5 mr-2 shrink-0" />
          Download
        </DropdownMenu.Item>
        
        <DropdownMenu.Separator class="bg-white/5" />

        <DropdownMenu.Group>
          <DropdownMenu.Label class="text-[10px] uppercase tracking-widest text-white/40 px-2.5 py-2">
            Editor Options
          </DropdownMenu.Label>
          <DropdownMenu.Item
            class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
            onclick={() => (ws.copilotEnabled = !ws.copilotEnabled)}
          >
            <SparklesIcon class="size-3.5 mr-2 shrink-0 {ws.copilotEnabled ? 'text-primary' : ''}" />
            Copilot Autocomplete
            {#if ws.copilotEnabled}
              <CheckIcon class="size-3 ml-auto text-primary shrink-0" />
            {/if}
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        
        <DropdownMenu.Separator class="bg-white/5" />
        
        <DropdownMenu.Group>
          <DropdownMenu.Label class="text-[10px] uppercase tracking-widest text-white/40 px-2.5 py-2">
            Workspace Mode
          </DropdownMenu.Label>
          <DropdownMenu.Item
            class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
            onclick={() => (ws.workspaceMode = "files")}
          >
            <FoldersIcon class="size-3.5 mr-2 shrink-0" />
            Files
            {#if ws.workspaceMode === "files"}
              <CheckIcon class="size-3 ml-auto text-primary shrink-0" />
            {/if}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="text-[12px] font-medium rounded-lg cursor-pointer my-0.5 text-white/70 hover:text-white hover:bg-white/5"
            onclick={() => (ws.workspaceMode = "artifacts")}
          >
            <LayersIcon class="size-3.5 mr-2 shrink-0" />
            Artifacts
            {#if ws.workspaceMode === "artifacts"}
              <CheckIcon class="size-3 ml-auto text-primary shrink-0" />
            {/if}
          </DropdownMenu.Item>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
