<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { useImageCompression } from "$lib/context/image.context.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import XIcon from "@lucide/svelte/icons/x";
  import { onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    displaySize,
    FileDropZone,
    KILOBYTE,
    type FileDropZoneProps,
  } from "./file-drop-zone";
  import { Loader } from "./prompt-kit/loader";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { useUser } from "$lib/context/user-context.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import { cn } from "$lib/utils/shadcn.js";
  import { tick } from "svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import ResponsiveSheet from "./shared/responsive-sheet.svelte";

  let filesContext = useFileActions();
  let imageContext = useImageCompression();
  let userCtx = useUser();
  let previewUrls = new Map<File, string>();

  let open = $state(false);
  let value = $state<string>("");
  let triggerRef = $state<HTMLButtonElement>(null!);

  const student = $derived(
    userCtx.students.find((p) => p.id === Number(value)),
  );
  let isStudentPhoto = $state(false);

  function closeAndFocusTrigger() {
    open = false;
    tick().then(() => {
      triggerRef.focus();
    });
  }

  // Use files and uploads from the shared context
  const files = $derived(filesContext.files);
  const uploads = $derived(filesContext.uploads);

  // Cleanup object URLs on destruction
  onDestroy(() => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.clear();
  });

  const onUpload: FileDropZoneProps["onUpload"] = async (fs) => {
    const compressedFiles = await Promise.all(
      fs.map(async (file) => {
        if (file.type.startsWith("image/")) {
          toast.info(`Compressing ${file.name}...`);
          return await imageContext.compress(file, {
            quality: 0.8,
            convertPngThreshold: 2 * 1024 * 1024,
            maxSizeKB: 100,
          });
        }
        return file;
      }),
    );

    filesContext.uploadWithStudentData(compressedFiles, {
      studentId: student?.id,
      studentName: student?.name ?? undefined,
      admissionNo: student?.admissionNo ?? undefined,
      isStudentPhoto,
    });
  };

  const onFileRejected: FileDropZoneProps["onFileRejected"] = ({
    reason,
    file,
  }) => {
    toast.error(`${file.name} failed to upload!`, { description: reason });
  };

  const generatePreviewUrl = (file: File): string => {
    if (previewUrls.has(file)) return previewUrls.get(file)!;

    const url = URL.createObjectURL(file);
    previewUrls.set(file, url);
    return url;
  };

  const removeFile = (index: number) => {
    const file = files[index];
    if (file && previewUrls.has(file)) {
      URL.revokeObjectURL(previewUrls.get(file)!);
      previewUrls.delete(file);
    }
    filesContext.remove(index);
  };
</script>


{#snippet extra()}
  {#if files.length > 0}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => filesContext.clear()}
      class="h-8 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      Clear All
    </Button>
  {/if}
{/snippet}

<ResponsiveSheet
  bind:open={filesContext.openModal}
  onOpenChange={(isOpen: boolean) => {
    if (!isOpen) {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    }
  }}
  title="Add Resource"
  description="Upload files to your current context."
  {extra}
  class="sm:max-w-[30vw]"
  contentClass="p-0 border-t sm:border-t-0"
>
  <div class="flex flex-col h-full overflow-hidden">
    <ScrollArea class="flex-1 px-6 py-6">
      <div class="space-y-8">
        <!-- Student Selection & Configuration -->
        <div class="space-y-6">
          <div class="space-y-3">
             <div class="flex items-center gap-3">
                <div class="w-1 h-4 bg-primary rounded-full"></div>
                <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/60">
                   Target Assessment
                </h3>
             </div>

             {#if (userCtx.students && userCtx.students.length > 0) || filesContext.selectedClass}
               <div class="w-full">
                 <Popover.Root bind:open>
                   <Popover.Trigger bind:ref={triggerRef}>
                     {#snippet child({ props })}
                       <Button
                         {...props}
                         variant="outline"
                         class="w-full h-12 bg-muted/10 border-none rounded-2xl text-xs font-black px-5 shadow-inner transition-all hover:bg-muted/15 justify-between"
                         role="combobox"
                         aria-expanded={open}
                       >
                         <span class="truncate">{student?.name || "Select a student..."}</span>
                         <ChevronsUpDownIcon class="size-4 shrink-0 opacity-50" />
                       </Button>
                     {/snippet}
                   </Popover.Trigger>
                   <Popover.Content 
                     class="p-0 w-(--bits-popover-anchor-width)" 
                     side="bottom" 
                     align="start"
                     trapFocus={false}
                     onOpenAutoFocus={(e) => e.preventDefault()}
                     portalProps={{ disabled: true }}
                   >
                     <Command.Root class="w-full">
                       <Command.Input placeholder="Search student..." class="h-9" />
                       <Command.List class="max-h-[300px]">
                         <Command.Empty>No student found.</Command.Empty>
                         <Command.Group>
                           {#each userCtx.students as s (s.id)}
                             <Command.Item
                               value={s.name || ""}
                               onSelect={() => {
                                 value = s.id.toString();
                                 closeAndFocusTrigger();
                               }}
                               class="rounded-xl mx-1"
                             >
                               <CheckIcon
                                 class={cn("size-4", value !== s.id.toString() && "text-transparent")}
                               />
                               <span class="truncate">{s.name}</span>
                             </Command.Item>
                           {/each}
                         </Command.Group>
                       </Command.List>
                     </Command.Root>
                   </Popover.Content>
                 </Popover.Root>
               </div>
             {:else if filesContext.selectedClass?.className}
               <div class="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 text-center bg-muted/10 rounded-3xl border border-dashed border-muted/30">
                 No students found in {filesContext.selectedClass.className}
               </div>
             {/if}
          </div>

          {#if student}
            <div class="flex items-center space-x-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 transition-all animate-in fade-in slide-in-from-top-2">
              <Switch id="student-photo" bind:checked={isStudentPhoto} class="data-[state=checked]:bg-primary" />
              <div class="flex flex-col">
                <Label
                  for="student-photo"
                  class="text-[10px] font-black uppercase tracking-widest text-foreground/80 cursor-pointer"
                >
                  Upload as Student Photo
                </Label>
                <span class="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-tight mt-0.5">
                  Save this image as the official profile picture for {student.name}
                </span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Options & Dropzone -->
        <div class="space-y-6">

          <div class="rounded-[2.5rem] overflow-hidden border border-border/50 bg-muted/5 p-1 shadow-inner">
            <FileDropZone
              name="files"
              {onUpload}
              {onFileRejected}
              maxFileSize={2000 * KILOBYTE}
              accept="image/*"
              maxFiles={4}
              disabled={!value}
              fileCount={files.length}
            />
          </div>
        </div>

        <!-- File List -->
        <div class="space-y-4">
          <div class="flex items-center gap-3">
             <div class="w-1 h-4 bg-primary rounded-full"></div>
             <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/60">
                Current Queue
             </h3>
          </div>

          <div class="space-y-3">
            {#each files as file, i (file.name + i)}
              <div class="group flex items-center justify-between gap-4 rounded-3xl p-3 bg-muted/20 border border-border/50 hover:bg-muted/30 hover:border-primary/20 transition-all duration-300">
                <div class="flex items-center gap-4 min-w-0 flex-1">
                  {#if file.type.startsWith("image/")}
                    <div class="relative size-12 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-lg border-2 border-white/5">
                      <img
                        src={generatePreviewUrl(file)}
                        alt={file.name}
                        class="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                        loading="lazy"
                        onerror={() => {
                          URL.revokeObjectURL(previewUrls.get(file)!);
                          previewUrls.delete(file);
                        }}
                      />
                    </div>
                  {/if}
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="truncate text-xs font-black uppercase tracking-tight" title={file.name}>
                      {file.name}
                    </span>
                    <span class="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                      {displaySize(file.size)}
                      {#if imageContext.lastStats && imageContext.lastStats.originalSize > file.size}
                        <span class="text-emerald-500 font-black ml-1">
                          (-{Math.round((1 - file.size / imageContext.lastStats.originalSize) * 100)}%)
                        </span>
                      {/if}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <div class="flex items-center justify-center size-8">
                    {#if uploads.some((u) => u.originalName === file.name && ["extracted", "approved", "published"].includes(u.status))}
                      <CheckIcon class="size-4 text-emerald-500" />
                    {:else if uploads.some((u) => u.originalName === file.name && u.status === "uploaded")}
                      <TriangleAlertIcon class="size-4 text-amber-500" />
                    {:else if uploads.some((u) => u.originalName === file.name && u.status === "uploading")}
                      <div class="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    {:else if uploads.some((u) => u.originalName === file.name && u.status === "error")}
                      <CircleAlertIcon class="size-4 text-destructive" />
                    {/if}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 rounded-xl text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Remove {file.name}"
                    onclick={() => removeFile(i)}
                  >
                    <XIcon class="size-4" />
                  </Button>
                </div>
              </div>
            {/each}

            {#if files.length === 0}
              <div class="flex flex-col items-center justify-center py-12 text-center bg-muted/5 rounded-[2.5rem] border border-dashed border-border/50">
                <XIcon class="size-10 mb-4 opacity-5" />
                <p class="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
                  Queue is empty
                </p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</ResponsiveSheet>
