<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import { Button } from "$lib/components/ui/button";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ListIcon from "@lucide/svelte/icons/list";
  import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import FilePlusIcon from "@lucide/svelte/icons/file-plus";
  import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import ArchiveIcon from "@lucide/svelte/icons/file-archive";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

  let {
    searchQuery = $bindable(),
    onStartCreate,
    onTriggerUpload,
    onTriggerFolderUpload
  }: {
    searchQuery: string;
    onStartCreate: (type: "file" | "dir", path: string) => void;
    onTriggerUpload: () => void;
    onTriggerFolderUpload: () => void;
  } = $props();
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-slate-950/10">
  <div class="relative flex-4 group">
    <SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-white/10 group-focus-within:text-primary transition-colors pointer-events-none" />
    <input 
      type="text" 
      placeholder="Search..."
      class="w-full h-8 bg-white/5 border border-white/5 rounded-lg pl-8 pr-2 text-[11px] text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all font-medium"
      bind:value={searchQuery}
    />
  </div>
  
  <div class="flex flex-1 items-center justify-end gap-1">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button variant="outline" size="sm" class="h-8 px-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors gap-2 text-[10px] font-black uppercase tracking-widest text-white/70 cursor-pointer" {...props}>
            <PlusIcon class="size-3.5" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="bg-slate-950/95 backdrop-blur-xl border-white/10 rounded-xl p-1 shadow-2xl min-w-[200px]">
        <DropdownMenu.Label class="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 px-2 py-2">Create New</DropdownMenu.Label>
        <DropdownMenu.Item class="rounded-lg text-[10px] font-bold tracking-widest uppercase gap-3 focus:bg-white/10 transition-all h-10 cursor-pointer" onclick={() => onStartCreate('file', '')}>
          <div class="size-6 rounded-md bg-white/5 flex items-center justify-center">
            <FilePlusIcon class="size-3.5 opacity-60" />
          </div>
          Create file
        </DropdownMenu.Item>
        <DropdownMenu.Item class="rounded-lg text-[10px] font-bold tracking-widest uppercase gap-3 focus:bg-white/10 transition-all h-10 cursor-pointer" onclick={() => onStartCreate('dir', '')}>
          <div class="size-6 rounded-md bg-white/5 flex items-center justify-center">
            <FolderPlusIcon class="size-3.5 opacity-60" />
          </div>
          Create folder
        </DropdownMenu.Item>
        
        <DropdownMenu.Separator class="bg-white/5 my-1" />
        <DropdownMenu.Label class="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 px-2 py-2">Import Assets</DropdownMenu.Label>
        
        <DropdownMenu.Item class="rounded-lg text-[10px] font-bold tracking-widest uppercase gap-3 focus:bg-white/10 transition-all h-10 cursor-pointer" onclick={onTriggerUpload}>
          <div class="size-6 rounded-md bg-white/5 flex items-center justify-center">
            <UploadIcon class="size-3.5 opacity-60" />
          </div>
          Upload files
        </DropdownMenu.Item>
        <DropdownMenu.Item class="rounded-lg text-[10px] font-bold tracking-widest uppercase gap-3 focus:bg-white/10 transition-all h-10 cursor-pointer" onclick={onTriggerFolderUpload}>
          <div class="size-6 rounded-md bg-white/5 flex items-center justify-center">
            <FolderPlusIcon class="size-3.5 opacity-60" />
          </div>
          Upload folder
        </DropdownMenu.Item>
        <DropdownMenu.Item class="rounded-lg text-[10px] font-bold tracking-widest uppercase gap-3 focus:bg-white/10 transition-all h-10 cursor-pointer" onclick={onTriggerUpload}>
          <div class="size-6 rounded-md bg-white/5 flex items-center justify-center">
            <ArchiveIcon class="size-3.5 opacity-60" />
          </div>
          Import Zip
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
