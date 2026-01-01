<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Carousel from "$lib/components/ui/carousel/index.js";
  import { BrushCleaning, RotateCcw, Upload } from "@lucide/svelte";
  import { Separator } from "./ui/separator";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import Button, { buttonVariants } from "./ui/button/button.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { CarouselAPI } from "$lib/components/ui/carousel/context.js";
  import { onMount } from "svelte";
  import Loader from "./prompt-kit/loader/loader.svelte";
  import { toast } from "svelte-sonner";
  import type { UploadedData } from "$lib/types/chat-types";
  import { useUser } from "$lib/context/user-context.svelte";
  import { useChat } from "$lib/context/chat-context.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { getResources } from "$lib/api/chat.remote";

  interface ChatResourceProps {
    onFileSelected?: (files: FileList) => void;
  }

  let { onFileSelected = () => {} }: ChatResourceProps = $props();

  let fileCtx = $derived(useFileActions());
  let userContext = $derived(useUser());
  let chat = $derived(useChat());

  let uploads = $state<UploadedData[]>([]);
  let loading = $state(true);

  const loadResources = async () => {
    loading = true;
    try {
      const result = await getResources({
        className: chat.selectedClass?.className || undefined,
        sectionName: chat.selectedClass?.sectionName || undefined,
      });

      if (result.success) {
        uploads = result.resources;
      } else {
        console.error("Failed to load resources:", result.message);
        uploads = [];
      }
    } catch (error) {
      console.error("Error loading resources:", error);
      uploads = [];
    } finally {
      loading = false;
    }
  };

  // Load resources when modal opens
  $effect(() => {
    if (fileCtx.openResourceModal) {
      loadResources();
    }
  });

  const clearResource = async () => {
    const resp = await fetch("/api/uploads?clear=all", {
      method: "DELETE",
    });

    if (!resp.ok) {
      toast("Failed to clear resources");
      return;
    }
    toast("Resources cleared");
    uploads = [];
  };

  const retryUpload = (upload: UploadedData) => {
    if (userContext.isCoordinator) {
      const selectedClass = userContext.classes.find((c) => c.id === chat.selectedClass?.id);
      if (!selectedClass) {
        toast("Failed to retry upload");
        return;
      }
      fileCtx.retryUpload(upload, selectedClass);
      return;
    }
    fileCtx.retryUpload(upload);
  };

  let selectedUpload = $state<UploadedData | null>(null);
  let previewOpen = $state(false);

  const openPreview = (upload: UploadedData) => {
    selectedUpload = upload;
    previewOpen = true;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      previewOpen = false;
      selectedUpload = null;
    }
  };

  const onPreviewOpenChange = (open: boolean) => {
    previewOpen = open;
    if (!open) {
      selectedUpload = null;
    }
  };

  // Close the resource modal
  const closeResourceModal = () => {
    fileCtx.openResourceModal = false;
  };
</script>

{#if fileCtx.openResourceModal}
  <Dialog.Root bind:open={fileCtx.openResourceModal}>
    <Dialog.Content
      preventScroll={false}
      class="w-[95%] rounded-lg sm:max-w-4xl max-h-[85vh] flex-col p-0 gap-0"
    >
      <div class="p-6 pb-2">
        <Dialog.Header>
          <Dialog.Title>Resources</Dialog.Title>
          <Dialog.Description>View and manage your uploaded resources.</Dialog.Description>
        </Dialog.Header>
      </div>

      <div class="flex-1 overflow-auto max-h-[50vh] px-6 pb-6">
        {#if loading}
          <div class="flex items-center justify-center h-40">
            <Loader variant="circular" />
          </div>
        {:else if uploads.length > 0}
          <Carousel.Root class="relative w-full pt-10">
            {#if !userContext.isCoordinator}
              <Tooltip.Provider delayDuration={0}>
                <Tooltip.Root>
                  <Tooltip.Trigger
                    class={buttonVariants({ variant: "ghost" }) +
                      "m-4 absolute left-0 top-0 z-10 cursor-pointer"}
                    onclick={clearResource}
                  >
                    <BrushCleaning class="size-5" />
                  </Tooltip.Trigger>
                  <Tooltip.Content>Clear Resources</Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
              <div class="flex min-h-full items-center text-sm mx-4">
                <Separator />
              </div>
            {/if}
            <div class="flex justify-center">
              <Carousel.Content class="flex-1 my-4 justify-center items-center">
                {#each uploads as upload, i (i)}
                  <Carousel.Item class="md:basis-1/2 lg:basis-1/3 h-full -ms-1">
                    <div class="h-full">
                      <Card.Root class="h-full rounded-2xl">
                        <Card.Content
                          class="relative flex aspect-square items-center justify-center px-4 h-full overflow-hidden"
                        >
                          <button
                            class="h-full w-full cursor-pointer outline-none border-none p-0 bg-transparent"
                            onclick={() => openPreview(upload)}
                          >
                            <img
                              src={`/api/uploads/${upload.filename}?token=${upload.token}`}
                              alt={upload.filename}
                              class="h-full w-full object-cover rounded-lg"
                            />
                          </button>

                          <Button
                            variant="ghost"
                            size="icon"
                            class="absolute bottom-2 right-2 bg-black/70 text-white text-2xl font-semibold px-2 py-1 rounded-md cursor-pointer"
                            onclick={() => retryUpload(upload)}
                          >
                            {#if uploads.some((u) => u.id === upload.id && u.status === "retrying")}
                              <Loader variant="circular" size="sm" />
                            {:else}
                              <RotateCcw class="size-4" />
                            {/if}
                          </Button>
                        </Card.Content>
                      </Card.Root>
                    </div>
                  </Carousel.Item>
                {/each}
              </Carousel.Content>
              <div class="absolute right-0 top-0 z-10 flex gap-2">
                <Carousel.Previous class="static translate-y-0 h-9 w-9" />
                <Carousel.Next class="static translate-y-0 h-9 w-9" />
              </div>
            </div>
          </Carousel.Root>
        {:else}
          <div class="text-center text-muted-foreground py-8">No resources uploaded yet</div>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>

  {#if selectedUpload}
    <Dialog.Root bind:open={previewOpen} onOpenChange={onPreviewOpenChange}>
      <Dialog.Content
        class="max-w-[90vw] max-h-[90vh] w-fit h-fit p-1 overflow-hidden flex flex-col items-center justify-center border-none bg-transparent shadow-none"
        onkeydown={(e: KeyboardEvent) => handleKeydown(e)}
      >
        <Dialog.Header class="sr-only">
          <Dialog.Title>{selectedUpload?.filename || "Preview"}</Dialog.Title>
        </Dialog.Header>
        <div class="relative w-full h-full flex items-center justify-center">
          <img
            src={`/api/uploads/${selectedUpload.filename}?token=${selectedUpload.token}`}
            alt={selectedUpload.filename}
            class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      </Dialog.Content>
    </Dialog.Root>
  {/if}
{/if}
