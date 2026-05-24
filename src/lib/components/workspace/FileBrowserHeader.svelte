<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
  import UploadIcon from "@lucide/svelte/icons/upload";

  let {
    onStartCreate,
    onTriggerUpload,
    onTriggerFolderUpload
  }: {
    onStartCreate: (type: "file" | "dir", path: string) => void;
    onTriggerUpload: () => void;
    onTriggerFolderUpload: () => void;
  } = $props();
</script>

<div class="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-slate-950/10">
  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Files</span>
  <div class="flex items-center">
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
