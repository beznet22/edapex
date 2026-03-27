<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { usePreview } from "$lib/context/fetch-preview.svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import XIcon from "@lucide/svelte/icons/x";
  import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
  import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
  import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
  import { cn } from "$lib/utils/shadcn";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import SendIcon from "@lucide/svelte/icons/send";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { publishResult } from "$lib/api/assessment.remote";
  import { toast } from "svelte-sonner";
  import ResponsiveSheet from "./shared/responsive-sheet.svelte";

  let {
    title = "Document Preview",
  }: {
    title?: string;
  } = $props();

  let token = $derived(
    page.url.hash.startsWith("#")
      ? page.url.hash.slice(1)
      : (page.state.previewToken as string | null),
  );

  let ctx = usePreview("");
  let open = $state(false);
  // Gesture State
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isDragging = $state(false);
  let lastPinchDist = 0;
  let lastPinchCenter = { x: 0, y: 0 };
  let pointers = new Map<number, PointerEvent>();
  let startX = 0;
  let startY = 0;

  let isZoomed = $derived(zoom > 1.01);
  let isPublishing = $state(false);

  let processedToken = $state<string | null>(null);

  function resetGestures() {
    zoom = 1;
    panX = 0;
    panY = 0;
    pointers.clear();
  }

  function getPinchCenter(pts: PointerEvent[]) {
    return {
      x: (pts[0].clientX + pts[1].clientX) / 2,
      y: (pts[0].clientY + pts[1].clientY) / 2
    };
  }

  function handlePointerDown(e: PointerEvent) {
    const target = e.currentTarget as HTMLElement | null;
    if (target) {
      target.setPointerCapture(e.pointerId);
    }
    pointers.set(e.pointerId, e);

    if (pointers.size === 1) {
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      lastPinchDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      lastPinchCenter = getPinchCenter(pts);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);

    if (pointers.size === 1 && isDragging) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const center = getPinchCenter(pts);
      
      if (lastPinchDist > 0) {
        const delta = dist / lastPinchDist;
        zoom = Math.min(Math.max(zoom * delta, 1), 5);
        
        // Pan based on center movement
        panX += center.x - lastPinchCenter.x;
        panY += center.y - lastPinchCenter.y;
      }
      lastPinchDist = dist;
      lastPinchCenter = center;
    }

    // Constraints to keep image in view when not zoomed
    if (zoom <= 1) {
      panX = 0;
      panY = 0;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      isDragging = false;
    } else if (pointers.size === 1) {
      // Re-initialize 1-pointer drag state with remaining pointer
      const remainingPoint = Array.from(pointers.values())[0];
      startX = remainingPoint.clientX - panX;
      startY = remainingPoint.clientY - panY;
      lastPinchDist = 0;
    }
  }

  async function handlePublish() {
    if (!token) return;
    try {
      isPublishing = true;
      const payloadStr = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
      const { studentId, examId } = JSON.parse(payloadStr);

      if (!studentId || !examId) {
        toast.error("Invalid token format");
        return;
      }

      const res = await publishResult({ studentId, examTypeId: examId });
      if (res?.success) {
        toast.success(res.message || "Results published successfully");
      } else {
        toast.error(res?.errors?.join("\n") || "Failed to publish results");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to publish results");
    } finally {
      isPublishing = false;
    }
  }

  // Sync from URL to open state (one-way sync down, carefully)
  $effect(() => {
    if (token !== processedToken) {
      processedToken = token;
      open = !!token && token !== "settings";
    }
  });

  // Fetch preview when token or open status changes
  $effect(() => {
    if (open && token) {
      ctx.url = `/api/results/${token}?preview=1`;
      ctx.fetch();
    } else if (!open) {
      ctx.clear();
      resetGestures();
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      ctx.next();
      resetGestures();
    } else if (event.key === "ArrowLeft") {
      ctx.prev();
      resetGestures();
    } else if (event.key === "Escape") {
      onOpenChange(false);
    }
  }

  function onOpenChange(val: boolean) {
    open = val;
    if (!val) {
      ctx.clear();
      resetGestures();
      if (token) {
        // Use goto to clear both hash and state cleanly
        // Using replaceState: true ensures we don't add to window history
        goto(`${page.url.pathname}${page.url.search}`, {
          replaceState: true,
          noScroll: true,
          keepFocus: true,
          state: {},
        });
      }
    } else {
      processedToken = token;
    }
  }

  const toggleZoom = () => {
    if (zoom > 1) {
      resetGestures();
    } else {
      zoom = 2.5;
    }
  };
  onDestroy(() => ctx.clear());
</script>

{#snippet extra()}
    <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onclick={handlePublish}
          disabled={isPublishing}
          class="rounded-xl h-10 w-10 hover:bg-primary/10"
          title="Publish result via email"
        >
          {#if isPublishing}
            <LoaderCircleIcon class="h-5 w-5 animate-spin" />
          {:else}
            <SendIcon class="h-5 w-5" />
          {/if}
        </Button>

        <Button
            variant="ghost"
            size="icon"
            onclick={toggleZoom}
            class="rounded-xl h-10 w-10 hover:bg-primary/10"
            title={isZoomed ? "Zoom Out" : "Zoom In"}
        >
            {#if isZoomed}
                <ZoomOutIcon class="h-5 w-5" />
            {:else}
                <ZoomInIcon class="h-5 w-5" />
            {/if}
        </Button>

        {#if ctx.preview?.pdfUrl}
            <a href={ctx.preview.pdfUrl} download={ctx.preview.pdfName || "document.pdf"}>
                <Button variant="ghost" size="icon" class="h-10 w-10 rounded-xl hover:bg-primary/10">
                    <DownloadIcon class="h-5 w-5" />
                </Button>
            </a>
        {/if}
    </div>
{/snippet}

{#snippet footer()}
  {#if ctx.preview && ctx.preview.images.length > 0}
    <div class="flex items-center justify-between w-full">
      <!-- Pagination Controls (Bottom Left) -->
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          disabled={ctx.currentIndex === 0}
          onclick={() => { ctx.prev(); resetGestures(); }}
          class="rounded-xl h-9 w-9 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeftIcon class="h-5 w-5" />
        </Button>

        <div class="flex items-center justify-center min-w-16">
          <span class="text-[11px] font-black tabular-nums tracking-widest text-muted-foreground">
            {ctx.currentIndex + 1}
            <span class="text-muted-foreground/30 mx-1">/</span>
            {ctx.preview.images.length}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          disabled={ctx.currentIndex === ctx.preview.images.length - 1}
          onclick={() => { ctx.next(); resetGestures(); }}
          class="rounded-xl h-9 w-9 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRightIcon class="h-5 w-5" />
        </Button>
      </div>
    </div>
  {/if}
{/snippet}

<ResponsiveSheet
  {open}
  {onOpenChange}
  class="sm:max-w-fit"
  contentClass="p-0 bg-[#111]"
  title={title || "Document"}
  description={ctx.preview?.pdfName ?? undefined}
  {extra}
  {footer}
>
  <div
    class="relative flex h-full w-full flex-col overflow-hidden outline-none touch-none select-none"
    onkeydown={handleKeydown}
    role="presentation"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    data-vaul-no-drag
  >
    <!-- Main Preview Area -->
    <div
      class="flex-1 overflow-auto flex items-center justify-center custom-scrollbar p-4 sm:p-6"
    >
      {#if !ctx.preview}
        <div class="flex flex-col items-center gap-6 py-20">
          <div class="relative">
            <Spinner class="h-12 w-12 text-primary" />
            <div class="absolute inset-0 h-12 w-12 border-4 border-primary/20 rounded-full animate-ping"></div>
          </div>
          <p class="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">
            Rendering Document...
          </p>
        </div>
      {:else if ctx.preview && ctx.preview.images.length > 0}
        <div 
          class={cn(
            "relative will-change-transform cursor-grab active:cursor-grabbing",
            !(isDragging || pointers.size > 1) && "transition-transform duration-200 ease-out"
          )}
          style="transform: translate3d({panX}px, {panY}px, 0) scale({zoom});"
        >
          {#key ctx.currentIndex}
            <img
              src={ctx.preview.images[ctx.currentIndex]}
              alt="Page {ctx.currentIndex + 1}"
              class="shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] rounded-sm select-none bg-white ring-1 ring-white/20 border-t border-white max-w-full max-h-[80vh] object-contain"
              draggable="false"
            />
          {/key}
        </div>
      {:else}
        <div class="text-center p-12">
          <div class="mb-6 inline-flex p-8 rounded-4xl bg-white/5 border border-dashed border-white/10">
            <Maximize2Icon class="h-12 w-12 text-muted-foreground opacity-30" />
          </div>
          <p class="text-xs font-black uppercase tracking-widest text-muted-foreground">
            No preview available
          </p>
        </div>
      {/if}
    </div>
  </div>
</ResponsiveSheet>

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

</style>
