<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import XIcon from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import { Check } from "@lucide/svelte";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { displaySize, FileDropZone, MEGABYTE, type FileDropZoneProps } from "./file-drop-zone";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ScrollArea } from "./ui/scroll-area";
  import { Loader } from "./prompt-kit/loader";

  const filesContext = useFileActions();
  let previewUrls = new Map<File, string>();

  // Cleanup object URLs on destruction
  onDestroy(() => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls.clear();
  });

  const onUpload: FileDropZoneProps["onUpload"] = async (files) => {
    await filesContext.add(files);
  };

  const onFileRejected: FileDropZoneProps["onFileRejected"] = ({ reason, file }) => {
    toast.error(`${file.name} failed to upload!`, { description: reason });
  };

  const generatePreviewUrl = (file: File): string => {
    if (previewUrls.has(file)) return previewUrls.get(file)!;
    
    const url = URL.createObjectURL(file);
    previewUrls.set(file, url);
    return url;
  };

  const removeFile = (index: number) => {
    const file = filesContext.files[index];
    if (file && previewUrls.has(file)) {
      URL.revokeObjectURL(previewUrls.get(file)!);
      previewUrls.delete(file);
    }
    filesContext.remove(index);
  };
</script>

<Dialog.Root
  bind:open={filesContext.openModal}
  onOpenChange={(open) => {
    if (!open) {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      previewUrls.clear();
    }
  }}
>
  <Dialog.Content 
    preventScroll={false} 
    class="w-[95%] rounded-lg sm:max-w-[425px] max-h-[85vh] flex flex-col p-0 gap-0"
  >
    <div class="p-6 pb-2">
      <Dialog.Header>
        <Dialog.Title>Add Recource</Dialog.Title>
        <Dialog.Description>
          Add image or documents to chat, file content will be extracted and used as chat context.
        </Dialog.Description>
      </Dialog.Header>

      <div class="mt-4">
        <FileDropZone
          {onUpload}
          {onFileRejected}
          maxFileSize={2 * MEGABYTE}
          accept="image/*"
          maxFiles={30}
          fileCount={filesContext.files.length}
        />
      </div>
    </div>

    <ScrollArea class="min-h-0 grow px-6 pb-6 overflow-auto">
      <div class="flex flex-col gap-3">
        {#each filesContext.files as file, i (file.name + i)}
          <div class="flex items-center justify-between gap-3 rounded-md p-2 bg-background">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              {#if file.type.startsWith('image/')}
                <div class="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  <img
                    src={generatePreviewUrl(file)}
                    alt={file.name}
                    class="h-full w-full object-cover"
                    loading="lazy"
                    on:error={() => {
                      URL.revokeObjectURL(previewUrls.get(file)!);
                      previewUrls.delete(file);
                    }}
                  />
                </div>
              {/if}
              
              <div class="flex flex-col min-w-0 flex-1">
                <span class="truncate text-sm font-medium leading-none" title={file.name}>
                  {file.name}
                </span>
                <span class="text-xs text-muted-foreground mt-1">
                  {displaySize(file.size)}
                </span>
              </div>
            </div>

            <!-- RESTORED EXACT LOADER/CHECK BEHAVIOR FROM ORIGINAL -->
            <div class="shrink-0">
              {#if filesContext.uploads.some(u => u.filename === file.name && !u.success)}
                <div class="flex items-center justify-center h-8 w-8">
                  <Loader variant="circular" size="sm" />
                </div>
              {:else if filesContext.uploads.some(u => u.filename === file.name && u.success)}
                <div class="flex items-center gap-1">
                  <Check class="size-4 text-green-500" />
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label="Remove {file.name}"
                    onclick={() => removeFile(i)}
                  >
                    <XIcon class="size-4" />
                  </Button>
                </div>
              {:else}
                <!-- Fallback for failed/error states -->
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Remove {file.name}"
                  onclick={() => removeFile(i)}
                >
                  <XIcon class="size-4" />
                </Button>
              {/if}
            </div>
          </div>
        {/each}
        
        {#if filesContext.files.length === 0}
          <div class="text-center text-muted-foreground py-8">
            No files added yet
          </div>
        {/if}
      </div>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>