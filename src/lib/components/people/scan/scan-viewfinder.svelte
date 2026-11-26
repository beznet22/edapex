<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils/shadcn.js";
  import X from "@lucide/svelte/icons/x";
  import Zap from "@lucide/svelte/icons/zap";
  import ZapOff from "@lucide/svelte/icons/zap-off";
  import ImageUp from "@lucide/svelte/icons/image-up";
  import type { QualityVerdict } from "$lib/people/scan/capture-quality";

  /**
   * Full-screen camera surface, layered onto the base screen in `base-reference-camera-view.png`:
   * close top-left, torch top-right, gallery bottom-left, large centred shutter.
   *
   * Overlay chrome sits on a scrim rather than a token background, because it must stay legible
   * over live video — the same reason shadcn's `dialog-overlay`/`sheet-overlay` use `bg-black/50`.
   * Everything that is not a scrim uses design tokens; there are no palette classes.
   */
  let {
    video = $bindable<HTMLVideoElement | null>(null),
    stream = null,
    onclose,
    onshutter,
    ongallery,
    ontoggleTorch,
    torchOn = false,
    torchAvailable = true,
    auto = false,
    onToggleAuto,
    quality = "unknown",
    hint = "",
    capturing = false,
    countdown = null,
    studentLine = "",
    onPrev,
    onNext,
    hasPrev = false,
    hasNext = false,
  }: {
    video?: HTMLVideoElement | null;
    stream?: MediaStream | null;
    onclose: () => void;
    onshutter: () => void;
    ongallery: () => void;
    ontoggleTorch: () => void;
    torchOn?: boolean;
    torchAvailable?: boolean;
    auto?: boolean;
    onToggleAuto?: () => void;
    quality?: QualityVerdict;
    hint?: string;
    capturing?: boolean;
    countdown?: number | null;
    studentLine?: string;
    onPrev?: () => void;
    onNext?: () => void;
    hasPrev?: boolean;
    hasNext?: boolean;
  } = $props();

  // Bind the element straight to the bindable prop so the parent receives it as soon as it
  // exists. Previously the child bound a private `videoEl` and never told the parent, so the
  // parent's `video` stayed null and the camera never attached.
  $effect(() => {
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  });

  const guideTone = $derived(
    quality === "good"
      ? "border-primary"
      : quality === "blurry" || quality === "too_far"
        ? "border-destructive"
        : "border-background/70"
  );
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-black">
  <video
    bind:this={video}
    class="absolute inset-0 size-full object-cover"
    autoplay
    playsinline
    muted
  ></video>

  <!-- Top scrim keeps the status bar and white icons legible over bright paper. -->
  <div class="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent"></div>

  <div class="relative flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
    <Button
      variant="ghost"
      size="icon"
      aria-label="Close scanner"
      class="size-11 rounded-full text-white hover:bg-white/15 hover:text-white"
      onclick={onclose}
    >
      <X class="size-5" />
    </Button>

    <div class="flex items-center gap-2">
      {#if onToggleAuto}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={auto}
          class="rounded-full text-white hover:bg-white/15 hover:text-white"
          onclick={onToggleAuto}
        >
          {auto ? "Auto" : "Manual"}
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
        disabled={!torchAvailable}
        class="size-11 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-40"
        onclick={ontoggleTorch}
      >
        {#if torchOn}
          <Zap class="size-5" />
        {:else}
          <ZapOff class="size-5" />
        {/if}
      </Button>
    </div>
  </div>

  {#if studentLine}
    <div class="relative mx-auto mt-2 flex max-w-[92%] items-center gap-2 sm:mt-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous student"
        disabled={!hasPrev}
        class="shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
        onclick={() => onPrev?.()}
      >
        ‹
      </Button>
      <span
        class="min-w-0 flex-1 truncate rounded-full bg-black/70 px-3 py-1.5 text-center text-xs font-medium text-white"
      >
        {studentLine}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next student"
        disabled={!hasNext}
        class="shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white disabled:opacity-30"
        onclick={() => onNext?.()}
      >
        ›
      </Button>
    </div>
  {/if}

  <!-- Static A4 portrait guide (1:1.414). No contour detection, no snapping polygon. -->
  <div class="relative flex min-h-0 flex-1 items-center justify-center px-6 py-4">
    <div
      class={cn(
        "aspect-[1/1.414] h-[52vh] max-h-full w-auto max-w-full rounded-md border-2 transition-colors sm:h-[62vh]",
        guideTone
      )}
    ></div>

    {#if hint}
      <span
        class="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-center text-xs font-medium text-white"
      >
        {hint}
      </span>
    {/if}
  </div>

  <div
    class="relative flex items-center justify-between gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
  >
    <Button
      variant="ghost"
      size="icon"
      aria-label="Import from gallery"
      class="size-12 rounded-full border border-white/40 text-white hover:bg-white/15 hover:text-white"
      onclick={ongallery}
    >
      <ImageUp class="size-5" />
    </Button>

    <div class="relative flex items-center justify-center">
      {#if countdown !== null}
        <span
          class="absolute -inset-3 animate-pulse rounded-full border-2 border-white/70"
          aria-live="polite"
        ></span>
      {/if}
      <Button
        size="icon"
        aria-label="Capture page"
        disabled={capturing}
        class="size-[4.5rem] rounded-full border-4 border-white bg-white/25 hover:bg-white/35 disabled:opacity-60"
        onclick={onshutter}
      >
        <span class="size-11 rounded-full bg-white"></span>
      </Button>
    </div>

    <div class="size-12"></div>
  </div>
</div>
