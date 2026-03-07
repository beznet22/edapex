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
  import * as Select from "$lib/components/ui/select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import ResponsiveSheet from "./shared/responsive-sheet.svelte";

  let filesContext = useFileActions();
  let imageContext = useImageCompression();
  let userCtx = useUser();
  let previewUrls = new Map<File, string>();

  let value = $state<string>();
  const student = $derived(
    userCtx.students.find((p) => p.id === Number(value)),
  );
  let isStudentPhoto = $state(false);

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

{#snippet header()}
  <div class="flex flex-col gap-4 w-full">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <h2 class="text-sm font-black uppercase tracking-widest text-primary">
          Add Resource
        </h2>
        <p class="text-[10px] font-medium text-muted-foreground/60">
          For {filesContext.selectedClass?.className} {filesContext.selectedClass?.sectionName}
        </p>
      </div>
    </div>

    {#if userCtx.students.length > 0}
      <div class="w-full">
        <Select.Root required type="single" name="provider" bind:value>
          <Select.Trigger class="w-full h-11 bg-muted/20 border-border/50 rounded-2xl text-xs font-bold px-4">
            {student?.name || "Select a student"}
          </Select.Trigger>
          <Select.Content class="rounded-2xl shadow-2xl border-border/50">
            <Select.Group>
              <Select.Label class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 px-4 py-2">Students</Select.Label>
              {#each userCtx.students as student (student.id)}
                <Select.Item
                  value={student.id.toString()}
                  label={student.name || ""}
                  class="rounded-xl mx-1"
                >
                  {student.name}
                </Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
    {:else if filesContext.selectedClass}
      <div class="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 text-center bg-muted/10 rounded-3xl border border-dashed border-muted/30">
        No students found in {filesContext.selectedClass.className}
      </div>
    {/if}
  </div>
{/snippet}

<ResponsiveSheet
  bind:open={filesContext.openModal}
  onOpenChange={(open) => {
    if (!open) {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    }
  }}
  header={header}
  class="sm:max-w-md"
  contentClass="p-0 border-t sm:border-t-0"
>
  <div class="flex flex-col h-full overflow-hidden">
    <ScrollArea class="flex-1 px-6 py-6">
      <div class="space-y-8">
        <!-- Options & Dropzone -->
        <div class="space-y-6">
          {#if student}
            <div class="flex items-center space-x-3 px-1">
              <Switch id="student-photo" bind:checked={isStudentPhoto} class="data-[state=checked]:bg-primary" />
              <Label
                for="student-photo"
                class="text-[10px] font-black uppercase tracking-widest text-foreground/80 cursor-pointer"
              >
                Upload as Student Photo
              </Label>
            </div>
          {/if}

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
