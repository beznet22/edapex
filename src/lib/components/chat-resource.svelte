<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Carousel from "$lib/components/ui/carousel/index.js";
  import BrushCleaningIcon from "@lucide/svelte/icons/brush";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import { useFileActions } from "$lib/context/file-context.svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import Loader from "./prompt-kit/loader/loader.svelte";
  import { toast } from "svelte-sonner";
  import type { UploadedData } from "$lib/types/chat-types";
  import { useUser } from "$lib/context/user-context.svelte";
  import { useChat } from "$lib/context/chat-context.svelte";
  import ResponsiveSheet from "./shared/responsive-sheet.svelte";
  import X from "@lucide/svelte/icons/x";

  let { onFileSelected }: { onFileSelected?: (file: UploadedData) => void } =
    $props();
  let fileCtx = $derived(useFileActions());
  let userContext = $derived(useUser());
  let chat = $derived(useChat());

  let loading = $state(false);

  // Load resources when modal opens
  $effect(() => {
    if (fileCtx.openResourceModal) {
      loading = true;
      fileCtx.loadResources().finally(() => {
        loading = false;
      });
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
    fileCtx.uploads = [];
  };

  const retryUpload = (upload: UploadedData) => {
    if (userContext.isCoordinator) {
      const selectedClass = userContext.classes.find(
        (c) => c.id === chat.selectedClass?.id,
      );
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

  const openManageFiles = () => {
    fileCtx.openFileStoreModal = true;
    fileCtx.openResourceModal = false;
  };
</script>

{#snippet resourceHeader()}
  <div class="flex items-center justify-between w-full">
    <div class="space-y-1">
      <h2 class="text-sm font-black uppercase tracking-widest text-primary">
        Resources
      </h2>
      <p class="text-[10px] font-medium text-muted-foreground/60">
        View and manage your uploaded resources.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={openManageFiles}
        class="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-background/50 border-border/50"
      >
        <FolderIcon class="size-3.5" />
        Manage Files
      </Button>
    </div>
  </div>
{/snippet}

{#snippet previewHeader()}
  <div class="flex items-center justify-between w-full py-2">
    <div class="px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
      <h2
        class="text-[10px] font-black text-primary tracking-widest uppercase truncate max-w-[200px]"
      >
        {selectedUpload?.filename || "Preview"}
      </h2>
    </div>
  </div>
{/snippet}

<ResponsiveSheet
  bind:open={fileCtx.openResourceModal}
  class="sm:max-w-4xl"
  header={resourceHeader}
  contentClass="p-0"
>
  <div class="flex-1 overflow-auto px-6 pb-6 pt-2 h-full">
    {#if loading}
      <div class="flex flex-col items-center justify-center h-64 space-y-4">
        <div
          class="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
        ></div>
        <p
          class="text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse"
        >
          Loading Resources
        </p>
      </div>
    {:else if fileCtx.uploads.length > 0}
      <Carousel.Root class="relative w-full">
        <div class="flex items-center justify-between mb-4">
          {#if !userContext.isCoordinator}
            <Tooltip.Provider delayDuration={0}>
              <Tooltip.Root>
                <Tooltip.Trigger
                  class={buttonVariants({ variant: "ghost" }) +
                    " rounded-xl hover:bg-destructive/10 hover:text-destructive"}
                  onclick={clearResource}
                >
                  <BrushCleaningIcon class="size-5" />
                </Tooltip.Trigger>
                <Tooltip.Content>Clear Resources</Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          {/if}
          <div class="flex gap-2">
            <Carousel.Previous
              class="static translate-y-0 h-10 w-10 rounded-2xl bg-muted/20 border-none hover:bg-primary/10 transition-colors"
            />
            <Carousel.Next
              class="static translate-y-0 h-10 w-10 rounded-2xl bg-muted/20 border-none hover:bg-primary/10 transition-colors"
            />
          </div>
        </div>

        <Carousel.Content class="gap-4 px-4 overflow-visible">
          {#each fileCtx.uploads as upload (upload.id)}
            <Carousel.Item class="md:basis-1/2 lg:basis-1/3 p-1">
              <Card.Root
                class="group relative aspect-square rounded-4xl overflow-hidden border-border/50 bg-muted/10 hover:border-primary/30 transition-all duration-500 shadow-xl hover:shadow-primary/5"
              >
                <Card.Content class="p-0 h-full w-full">
                  <button
                    class="h-full w-full cursor-pointer outline-none border-none p-0 bg-transparent overflow-hidden"
                    onclick={() => openPreview(upload)}
                  >
                    {#if ["uploaded", "extracted", "approved", "published"].includes(upload.status) && upload.token}
                      <img
                        src={`/api/uploads/${upload.filename}?token=${upload.token}`}
                        alt={upload.filename}
                        class="h-full w-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    {:else}
                      <div
                        class="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground/30"
                      >
                        <RotateCcwIcon class="size-16 opacity-20" />
                        <span
                          class="text-[9px] font-black uppercase tracking-widest"
                          >{upload.status}</span
                        >
                      </div>
                    {/if}
                  </button>

                  <div
                    class="absolute bottom-4 right-4 flex gap-2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300"
                  >
                    <Button
                      variant="secondary"
                      size="icon"
                      class="h-10 w-10 rounded-2xl bg-background/80 backdrop-blur-xl border border-white/20 shadow-2xl hover:bg-primary hover:text-white transition-colors"
                      onclick={() => retryUpload(upload)}
                    >
                      {#if upload.status === "retrying"}
                        <Loader variant="circular" size="sm" />
                      {:else}
                        <RotateCcwIcon class="size-4" />
                      {/if}
                    </Button>
                  </div>
                </Card.Content>
              </Card.Root>
            </Carousel.Item>
          {/each}
        </Carousel.Content>
      </Carousel.Root>
    {:else}
      <div
        class="flex flex-col items-center justify-center py-20 text-center space-y-6"
      >
        <div
          class="p-8 rounded-[2.5rem] bg-muted/10 border border-dashed border-muted/50"
        >
          <FolderIcon class="size-16 opacity-10" />
        </div>
        <p
          class="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]"
        >
          No resources found
        </p>
      </div>
    {/if}
  </div>
</ResponsiveSheet>

{#if selectedUpload}
  <ResponsiveSheet
    bind:open={previewOpen}
    class="sm:max-w-2xl"
    header={previewHeader}
    contentClass="p-0 bg-neutral-950/20"
    onOpenChange={onPreviewOpenChange}
  >
    <div
      class="relative w-full h-full flex items-center justify-center p-6 sm:p-12 outline-none"
      onkeydown={handleKeydown}
      role="presentation"
    >
      {#if ["uploaded", "extracted", "approved", "published"].includes(selectedUpload.status) && selectedUpload.token}
        <img
          src={`/api/uploads/${selectedUpload.id}.pdf?token=${selectedUpload.token}`}
          alt={selectedUpload.filename}
          class="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-white"
        />
      {:else}
        <div
          class="bg-background/20 backdrop-blur-2xl border border-white/10 p-12 rounded-[2.5rem] text-center max-w-sm"
        >
          <RotateCcwIcon
            class="size-16 mx-auto mb-6 opacity-20 text-muted-foreground"
          />
          <p
            class="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-relaxed"
          >
            Preview unavailable for {selectedUpload.status} items.
          </p>
        </div>
      {/if}
    </div>
  </ResponsiveSheet>
{/if}
