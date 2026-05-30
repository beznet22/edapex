<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
  import ListIcon from "@lucide/svelte/icons/list";

  let {
    workspaceMode = "files",
    artifactView = "list",
    onStartCreate,
    onTriggerUpload,
    onTriggerFolderUpload,
    onToggleArtifactView,
  }: {
    workspaceMode?: "files" | "artifacts";
    artifactView?: "list" | "grid";
    onStartCreate: (type: "file" | "dir", path: string) => void;
    onTriggerUpload: () => void;
    onTriggerFolderUpload: () => void;
    onToggleArtifactView?: () => void;
  } = $props();
</script>

<div class="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-slate-950/10">
  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
    {workspaceMode === "artifacts" ? "Artifacts" : "Files"}
  </span>
  <div class="flex items-center">
    {#if workspaceMode === "files"}
      <!-- Files mode: show New File + New Folder -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-7 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              onclick={() => onStartCreate('file', '')}
            >
              <FilePlusIcon class="size-3.5" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">New File</Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-7 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all"
              onclick={() => onStartCreate('dir', '')}
            >
              <FolderPlusIcon class="size-3.5" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">New Folder</Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <!-- Artifacts mode: show Grid/List toggle -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-7 rounded-lg text-primary/60 hover:text-primary hover:bg-primary/10 transition-all"
              onclick={onToggleArtifactView}
            >
              {#if artifactView === "grid"}
                <ListIcon class="size-3.5" />
              {:else}
                <LayoutGridIcon class="size-3.5" />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top">
          {artifactView === "grid" ? "List View" : "Grid View"}
        </Tooltip.Content>
      </Tooltip.Root>
    {/if}

    <!-- Always visible: Upload -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="size-7 rounded-lg text-white/40 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all"
            onclick={onTriggerUpload}
          >
            <UploadIcon class="size-3.5" />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="top">Upload Files</Tooltip.Content>
    </Tooltip.Root>
  </div>
</div>
