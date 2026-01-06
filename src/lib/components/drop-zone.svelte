<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { Check, CircleAlert, TriangleAlert } from "@lucide/svelte";
  import XIcon from "@lucide/svelte/icons/x";
  import { getContext, onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import {
    displaySize,
    FileDropZone,
    KILOBYTE,
    type FileDropZoneProps,
  } from "./file-drop-zone";
  import { Loader } from "./prompt-kit/loader";
  import { ScrollArea } from "./ui/scroll-area";
  import type { ActionData } from "../../routes/(chat)/$types";
  import { page } from "$app/state";
  import { useChat } from "$lib/context/chat-context.svelte";
  import { useUser } from "$lib/context/user-context.svelte";
  import * as Select from "$lib/components/ui/select/index.js";

  type Upload = {
    filename: string;
    status: "pending" | "uploading" | "done" | "error";
  };

  let filesContext = useFileActions();
  let chat = useChat();
  let userCtx = useUser();
  let previewUrls = new Map<File, string>();
  let fileForm: HTMLFormElement;
  let files = $state<File[]>([]);
  let uploads = $derived<Upload[]>(
    files.map((f) => ({
      filename: page.form?.filenames?.[f.name] || f.name,
      status: page.form?.status || "uploading",
    })),
  );

  let value = $state<string>();
  const student = $derived(
    userCtx.students.find((p) => p.id === Number(value)),
  );

  // Cleanup object URLs on destruction
  onDestroy(() => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.clear();
  });

  const onUpload: FileDropZoneProps["onUpload"] = async (fs) => {
    files = [...files, ...fs];
    fileForm.requestSubmit();
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
    files.splice(index, 1);
  };
</script>

<Dialog.Root
  bind:open={filesContext.openModal}
  onOpenChange={(open) => {
    if (!open) {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
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
        <Dialog.Title>
          Add Recource for {filesContext.selectedClass?.className}
          {filesContext.selectedClass?.sectionName}
        </Dialog.Title>
        <Dialog.Description>
          Add image or documents to chat, file content will be extracted and
          used as chat context.
        </Dialog.Description>
      </Dialog.Header>

      <form
        bind:this={fileForm}
        method="POST"
        enctype="multipart/form-data"
        use:enhance
      >
        {#if userCtx.students.length > 0}
          <div class="grid gap-4 py-4">
            <Select.Root required type="single" name="provider" bind:value>
              <Select.Trigger class="w-full">
                {student?.name || "Select a student"}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  <Select.Label>Students</Select.Label>
                  {#each userCtx.students as student (student.id)}
                    <Select.Item
                      value={student.id.toString()}
                      label={student.name || ""}
                    >
                      {student.name}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>
        {/if}

        <div class="mt-4">
          <FileDropZone
            name="files"
            {onUpload}
            {onFileRejected}
            maxFileSize={300 * KILOBYTE}
            accept="image/*"
            maxFiles={1}
            disabled={!value}
            fileCount={files.length}
          />
        </div>
        {console.log(chat.selectedClass)}
        <input hidden name="classId" value={chat.selectedClass?.classId} />
        <input hidden name="sectionId" value={chat.selectedClass?.sectionId} />
        <input hidden name="className" value={chat.selectedClass?.className} />
        <input
          hidden
          name="sectionName"
          value={chat.selectedClass?.sectionName}
        />
        <input hidden name="studentId" bind:value />
        <input hidden name="studentName" value={student?.name} />
        <input hidden name="admissionNo" value={student?.admissionNo} />
      </form>
    </div>

    <ScrollArea class="min-h-0 grow px-6 pb-6 overflow-auto">
      <div class="flex flex-col gap-3">
        {#each files as file, i (file.name + i)}
          <div
            class="flex items-center justify-between gap-3 rounded-md p-2 bg-background"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              {#if file.type.startsWith("image/")}
                <div
                  class="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted"
                >
                  <img
                    src={generatePreviewUrl(file)}
                    alt={file.name}
                    class="h-full w-full object-cover"
                    loading="lazy"
                    onerror={() => {
                      URL.revokeObjectURL(previewUrls.get(file)!);
                      previewUrls.delete(file);
                    }}
                  />
                </div>
              {/if}
              <div class="flex flex-col min-w-0 flex-1">
                <span
                  class="truncate text-sm font-medium leading-none"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span class="text-xs text-muted-foreground mt-1">
                  {displaySize(file.size)}
                </span>
              </div>
            </div>

            <div class="shrink-0">
              <div class="flex items-center gap-1">
                {#if uploads.some((u) => u.filename === file.name && u.status === "done")}
                  <Check class="size-4 text-green-500" />
                {:else if uploads.some((u) => u.filename === file.name && u.status === "pending")}
                  <TriangleAlert class="size-4 text-primary" />
                {:else if uploads.some((u) => u.filename === file.name && u.status === "uploading")}
                  <Loader variant="circular" size="sm" />
                {:else if uploads.some((u) => u.filename === file.name && u.status === "error")}
                  <CircleAlert class="size-4 text-destructive" />
                {/if}
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                  aria-label="Remove {file.name}"
                  onclick={() => removeFile(i)}
                >
                  <XIcon class="size-4" />
                </Button>
              </div>
            </div>
          </div>
        {/each}

        {#if files.length === 0}
          <div class="text-center text-muted-foreground py-8">
            No files added yet
          </div>
        {/if}
      </div>
    </ScrollArea>
  </Dialog.Content>
</Dialog.Root>
