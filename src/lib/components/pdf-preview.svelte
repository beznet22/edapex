<script lang="ts">
  import { onDestroy } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { usePreview } from "$lib/context/fetch-preview.svelte";

  let {
    open = $bindable(false),
    token,
    title = "Preview",
  }: {
    open: boolean;
    token: string;
    title?: string;
  } = $props();

  let ctx = $derived(usePreview(`/api/results/${token}?preview=1`));

  // Fetch preview when token changes
  $effect(() => {
    if (open && token) {
      ctx.fetch();
    }
  });

  function handleClose() {
    // Clean up object URLs to prevent memory leaks
    ctx.clear();
    open = false;
 }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      ctx.next();
    } else if (event.key === "ArrowLeft") {
      ctx.prev(); // Fixed: was calling preview() instead of preview.prev()
    } else if (event.key === "Escape") {
      handleClose();
    }
  }

  // Clean up object URLs on destruction
  onDestroy(() => {
    ctx.clear();
  });

  export function onOpenChange(val: boolean) {
    open = val;
    if (!val) {
      ctx.clear();
    }
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content
    class="max-w-4xl max-h-[98vh] w-full overflow-hidden flex flex-col"
    onkeydown={(e: KeyboardEvent) => handleKeydown(e)}
  >
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>

    {#if !ctx.preview}
      <div class="flex-1 flex-col items-center justify-center p-8 text-center">
        <Spinner class="h-8 w-8 animate-spin mx-auto" />
        <p class="text-sm text-muted-foreground mt-2">Loading preview...</p>
      </div>
    {:else if ctx.preview && ctx.preview.images.length > 0}
      <div class="flex-1 flex-col overflow-hidden">
        <div class="flex-1 overflow-auto">
          <div class="flex items-center justify-center p-4">
            <img
              src={ctx.preview.images[ctx.currentIndex]}
              alt="Preview page {ctx.currentIndex + 1}"
              class="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        </div>

        <div class="p-4 border-t flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            Page {ctx.currentIndex + 1} of {ctx.preview.images.length}
          </div>

          <div class="flex items-center gap-2">
            {#if ctx.preview.pdfUrl}
              <a href={ctx.preview.pdfUrl} download={ctx.preview.pdfName || undefined} class="inline-flex">
                <Button variant="outline" size="sm">Download PDF</Button>
              </a>
            {/if}
            <Button variant="outline" size="sm" disabled={ctx.currentIndex === 0} onclick={() => ctx.prev()}>
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={ctx.currentIndex === ctx.preview.images.length - 1}
              onclick={() => ctx.next()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    {:else}
      <div class="flex-1 flex-col items-center justify-center p-8 text-center">
        <p class="text-sm text-muted-foreground">No preview images available</p>
      </div>
    {/if}
 </Dialog.Content>
</Dialog.Root>
