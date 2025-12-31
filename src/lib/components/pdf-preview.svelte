<script lang="ts">
  import { onDestroy } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { usePreview } from "$lib/context/fetch-preview.svelte";
  import {
    ChevronLeft,
    ChevronRight,
    Download,
    X,
    Maximize2,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cn } from "$lib/utils/shadcn";
  import { page } from "$app/state";

  let {
    open = $bindable(false),
    token,
    title = "Document Preview",
  }: {
    open: boolean;
    token: string;
    title?: string;
  } = $props();

  let ctx = $derived(usePreview(`/api/results/${token}?preview=1`));
  let isZoomed = $state(false);

  // Fetch preview when token or open status changes
  $effect(() => {
    if (open && token) {
      ctx.fetch();
    }
  });

  function handleClose() {
    onOpenChange(false);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      ctx.next();
    } else if (event.key === "ArrowLeft") {
      ctx.prev();
    } else if (event.key === "Escape") {
      handleClose();
    }
  }

  onDestroy(() => {
    ctx.clear();
  });

  function onOpenChange(val: boolean) {
    if (val === open) return;
    open = val;
    if (!val) {
      ctx.clear();
      if (page.url.hash.includes(token) && token) {
        history.back();
      }
    }
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content
    class="max-w-[95vw] lg:max-w-[85vw] h-[92vh] p-0 overflow-hidden border-none bg-background/80 backdrop-blur-xl shadow-2xl transition-all duration-300 sm:rounded-2xl"
    onkeydown={handleKeydown}
  >
    <div class="relative flex h-full w-full flex-col overflow-hidden">
      <!-- Header Area (Subtle) -->
      <div
        class="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 pointer-events-none"
      >
        <div
          class="px-4 py-2 rounded-full bg-background/20 backdrop-blur-md border border-white/10 pointer-events-auto"
        >
          <h2 class="text-sm font-medium text-foreground/80 tracking-tight">
            {title}
          </h2>
        </div>

        <button
          onclick={handleClose}
          class="p-2 rounded-full bg-background/20 backdrop-blur-md border border-white/10 hover:bg-background/40 transition-all pointer-events-auto"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Main Preview Area -->
      <div
        class="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-4 sm:p-8 custom-scrollbar"
      >
        {#if !ctx.preview}
          <div class="flex flex-col items-center gap-4 py-20" in:fade>
            <div class="relative">
              <Spinner class="h-12 w-12 text-primary" />
              <div
                class="absolute inset-0 h-12 w-12 border-4 border-primary/20 rounded-full animate-ping"
              ></div>
            </div>
            <p class="text-sm font-medium text-muted-foreground animate-pulse">
              Preparing your preview...
            </p>
          </div>
        {:else if ctx.preview && ctx.preview.images.length > 0}
          <div
            class="relative max-h-full max-w-full"
            in:scale={{ duration: 300, start: 0.95 }}
          >
            {#key ctx.currentIndex}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <img
                src={ctx.preview.images[ctx.currentIndex]}
                alt="Page {ctx.currentIndex + 1}"
                class={cn(
                  "shadow-2xl rounded-sm transition-all duration-500 hover:shadow-primary/5 select-none",
                  isZoomed
                    ? "max-w-none w-[120%] h-auto cursor-zoom-out"
                    : "max-w-full max-h-[75vh] object-contain cursor-zoom-in",
                )}
                onclick={toggleZoom}
                in:fly={{ x: 20, duration: 400, delay: 100 }}
              />
            {/key}
          </div>
        {:else}
          <div class="text-center p-12" in:fade>
            <div class="mb-4 inline-flex p-4 rounded-full bg-muted">
              <Maximize2 class="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
            <p class="text-base font-medium text-muted-foreground">
              No preview available for this document
            </p>
          </div>
        {/if}
      </div>

      <!-- Floating Controls Area -->
      {#if ctx.preview && ctx.preview.images.length > 0}
        <div
          class="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm sm:max-w-md px-4"
        >
          <div
            class="bg-background/40 backdrop-blur-xl border border-white/10 p-2 sm:p-3 rounded-2xl shadow-2xl flex items-center justify-between gap-2 overflow-hidden"
          >
            <!-- Pagination Controls -->
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={ctx.currentIndex === 0}
                onclick={() => ctx.prev()}
                class="rounded-xl h-10 w-10 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft class="h-5 w-5" />
              </Button>

              <div class="flex items-center justify-center min-w-16 px-2">
                <span class="text-xs font-semibold tabular-nums">
                  {ctx.currentIndex + 1}
                  <span class="text-muted-foreground/50 mx-0.5">/</span>
                  {ctx.preview.images.length}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                disabled={ctx.currentIndex === ctx.preview.images.length - 1}
                onclick={() => ctx.next()}
                class="rounded-xl h-10 w-10 hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight class="h-5 w-5" />
              </Button>
            </div>

            <div class="h-6 w-px bg-white/10 mx-1"></div>

            <!-- Action Controls -->
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onclick={toggleZoom}
                class="rounded-xl h-10 w-10 hover:bg-white/10"
                title={isZoomed ? "Zoom Out" : "Zoom In"}
              >
                {#if isZoomed}
                  <ZoomOut class="h-5 w-5" />
                {:else}
                  <ZoomIn class="h-5 w-5" />
                {/if}
              </Button>

              {#if ctx.preview.pdfUrl}
                <a
                  href={ctx.preview.pdfUrl}
                  download={ctx.preview.pdfName || "document.pdf"}
                  class="inline-flex"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    class="rounded-xl gap-2 font-medium bg-primary hover:scale-[1.02] transition-transform active:scale-[0.98]"
                  >
                    <Download class="h-4 w-4" />
                    <span class="hidden sm:inline">Download</span>
                  </Button>
                </a>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.custom-scrollbar::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }

  :global(.custom-scrollbar::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }

  :global(.custom-scrollbar::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Glassmorphism utility */
  .backdrop-blur-xl {
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }
</style>
