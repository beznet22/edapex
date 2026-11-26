<script lang="ts">
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import { Spinner } from "$lib/components/ui/spinner";
  import ScanViewfinder from "$lib/components/people/scan/scan-viewfinder.svelte";
  import {
    assessQuality,
    frameDelta,
    isSteady,
    sampleFrame,
    toLuma,
    STEADY_HOLD_MS,
    type QualityResult,
  } from "$lib/people/scan/capture-quality";
  import { compressScan } from "$lib/people/scan/scan-compress";
  import {
    advanceFeedback,
    captureFeedback,
    primeAudioFeedback,
  } from "$lib/people/scan/capture-feedback";
  import { canUseTorch, setTorch } from "$lib/people/scan/torch";
  import {
    createQueuedCaptureId,
    enqueueCapture,
  } from "$lib/people/scan/scan-queue";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let track = $state<MediaStreamTrack | null>(null);
  let torchOn = $state(false);
  let torchAvailable = $state(false);
  let auto = $state(false);
  let quality = $state<QualityResult | null>(null);
  let capturing = $state(false);
  let countdown = $state<number | null>(null);
  let errorMessage = $state<string | null>(null);
  let statusLine = $state<string | null>(null);
  let activeIndex = $state(0);

  const roster = $derived(data.roster);

  /**
   * Start on the student that was actually tapped, not the first row of the class.
   *
   * The URL carries the student id (that is what `Upload Mark` links to) and the server has already
   * resolved it into `data.student`, but the page ignored both and always opened on `roster[0]`.
   * Clicking a pupil therefore showed a different child's name, and a capture would have been filed
   * against the wrong student.
   */
  function indexOfStudent(studentId: number): number {
    const index = data.roster.findIndex((row) => row.id === studentId);
    return index >= 0 ? index : 0;
  }

  $effect(() => {
    const target = indexOfStudent(data.student.id);
    if (target !== activeIndex) activeIndex = target;
  });

  const student = $derived(roster[activeIndex] ?? data.roster[0] ?? data.student);

  /**
   * Return to the exact roster the teacher came from. Dropping `classId`/`sectionId` sent admins
   * back to "Choose a class": with more than one allowed class the loader's policy is `"single"`,
   * which cannot resolve without a requested class. The class/section come from the server load,
   * not the query string, so opening the scanner directly still returns somewhere sensible.
   */
  function backToRoster(): void {
    const params = new URLSearchParams({ tab: "students" });
    if (data.student.classId !== null) params.set("classId", String(data.student.classId));
    if (data.student.sectionId !== null) params.set("sectionId", String(data.student.sectionId));
    if (data.examTypeId !== null) params.set("exam", String(data.examTypeId));
    void goto(`/people?${params.toString()}`);
  }

  let rafId: number | null = null;
  let previousLuma: Uint8ClampedArray | null = null;
  let steadySince: number | null = null;
  let galleryInput = $state<HTMLInputElement | null>(null);

  const studentLine = $derived(
    student ? `${student.fullName} · ADM ${student.admissionNo}` : "No student"
  );

  async function startCamera(): Promise<void> {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      stream = media;
      track = media.getVideoTracks()[0] ?? null;
      torchAvailable = canUseTorch(track);
      // The viewfinder attaches the stream once it owns the element; nothing to do here.
      startQualityLoop();
    } catch (cause) {
      errorMessage =
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access, or import a photo from the gallery."
          : "The camera could not be started. Import a photo from the gallery instead.";
    }
  }

  function stopCamera(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    stream?.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    stream = null;
    track = null;
  }

  function startQualityLoop(): void {
    const tick = (): void => {
      if (!video || video.readyState < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const frame = sampleFrame(video);
      if (frame) {
        quality = assessQuality(frame);
        const luma = toLuma(frame);

        if (previousLuma && isSteady(frameDelta(previousLuma, luma))) {
          steadySince ??= performance.now();
          if (auto && quality.verdict === "good" && !capturing) {
            const held = performance.now() - steadySince;
            if (held >= STEADY_HOLD_MS) {
              steadySince = null;
              void capture();
            } else {
              countdown = Math.ceil((STEADY_HOLD_MS - held) / 1000);
            }
          }
        } else {
          steadySince = null;
          countdown = null;
        }
        previousLuma = luma;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  async function toggleTorch(): Promise<void> {
    if (!track || !torchAvailable) return;
    const next = await setTorch(track, !torchOn);
    if (next === null) {
      torchAvailable = false;
      return;
    }
    torchOn = next;
  }

  /** Sends the JPEG, then asks the server to extract. Both steps are separate by design. */
  async function uploadAndExtract(file: File): Promise<void> {
    if (!student || data.examTypeId === null) return;

    // Offline: hold the JPEG locally and let the banner replay it. The queued capture uses a
    // pre-generated id so the replay is idempotent even if this device comes back online while the
    // same capture is somehow also sent.
    //
    // Compress *before* enqueueing: a raw 12 MP frame is 1–2 MB and would blow the 5 MB IndexedDB
    // budget after a handful of pages, whereas the 1600 px JPEG is ~220 KB.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const compressedOffline = await compressScan(file);
      await enqueueCapture({
        captureId: createQueuedCaptureId(),
        studentId: student.id,
        examTypeId: data.examTypeId,
        classId: data.student.classId ?? 0,
        sectionId: data.student.sectionId ?? 0,
        studentName: student.fullName,
        blob: compressedOffline.file,
        createdAt: Date.now(),
      });
      toast.info(`Saved ${student.fullName} offline — it will sync when you are back online`);
      statusLine = "Queued offline";
      return;
    }

    const compressed = await compressScan(file);
    const form = new FormData();
    form.set("file", compressed.file);
    form.set("studentId", String(student.id));
    form.set("examTypeId", String(data.examTypeId));
    form.set("classId", String(data.student.classId ?? 0));
    form.set("sectionId", String(data.student.sectionId ?? 0));
    form.set("source", "camera");

    const captureResponse = await fetch("/api/people/marks/capture", {
      method: "POST",
      body: form,
    });
    if (!captureResponse.ok) {
      const failure = (await captureResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(failure.error ?? "The capture could not be saved");
    }
    const { captureId } = (await captureResponse.json()) as { captureId: string };

    statusLine = "Extracting…";
    const extractResponse = await fetch("/api/people/marks/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: student.id, examTypeId: data.examTypeId, captureId }),
    });
    const extracted = (await extractResponse.json().catch(() => ({}))) as {
      status?: string;
      failure?: { message?: string };
    };

    if (!extractResponse.ok || extracted.status === "failed") {
      throw new Error(extracted.failure?.message ?? "Extraction failed");
    }
    statusLine = "Draft ready";
  }

  async function capture(): Promise<void> {
    if (!video || capturing) return;
    primeAudioFeedback();
    capturing = true;
    errorMessage = null;
    countdown = null;

    try {
      const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("The camera frame could not be read");
      context.drawImage(video, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      const file = new File([blob], "scan.jpg", { type: "image/jpeg" });

      captureFeedback();
      await uploadAndExtract(file);
      advanceFeedback();

      // Confirmation only, no Undo: extraction is dispatched immediately, so by the time a
      // teacher could tap anything the request is already in flight and there is no safe cancel.
      // A fake Undo affordance would be worse than none — `Re-scan` is the real recovery path.
      if (student) {
        toast.success(`Sent ${student.fullName} — Re-scan if wrong`, { duration: 3000 });
      }

      // Auto-advance only after the capture is durably queued server-side.
      const next = activeIndex + 1;
      if (next < roster.length) activeIndex = next;
    } catch (cause) {
      errorMessage = cause instanceof Error ? cause.message : "Capture failed";
    } finally {
      capturing = false;
    }
  }

  async function onGallery(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    capturing = true;
    errorMessage = null;
    try {
      await uploadAndExtract(file);
    } catch (cause) {
      errorMessage = cause instanceof Error ? cause.message : "Upload failed";
    } finally {
      capturing = false;
    }
  }

  $effect(() => {
    void startCamera();
    return () => stopCamera();
  });
</script>

<svelte:head>
  <title>Scan marks · {studentLine}</title>
</svelte:head>

<ScanViewfinder
  bind:video
  {stream}
  {torchOn}
  {torchAvailable}
  {auto}
  {capturing}
  {countdown}
  quality={quality?.verdict ?? "unknown"}
  hint={quality?.message ?? ""}
  {studentLine}
  hasPrev={activeIndex > 0}
  hasNext={activeIndex < roster.length - 1}
  onclose={backToRoster}
  onshutter={() => void capture()}
  ongallery={() => galleryInput?.click()}
  ontoggleTorch={() => void toggleTorch()}
  onToggleAuto={() => {
    primeAudioFeedback();
    auto = !auto;
  }}
  onPrev={() => {
    if (activeIndex > 0) activeIndex -= 1;
  }}
  onNext={() => {
    if (activeIndex < roster.length - 1) activeIndex += 1;
  }}
/>

<Input
  bind:ref={galleryInput}
  type="file"
  accept="image/*"
  class="sr-only"
  aria-hidden="true"
  tabindex={-1}
  onchange={(event) => void onGallery(event)}
/>

{#if errorMessage || capturing || statusLine}
  <div class="fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    {#if errorMessage}
      <Alert variant="destructive">
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    {/if}
    {#if capturing && !errorMessage}
      <div class="flex items-center justify-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-medium text-white">
        <Spinner class="size-3" />
        {statusLine ?? "Saving capture…"}
      </div>
    {/if}
    {#if statusLine && !capturing && !errorMessage}
      <div class="flex justify-center">
        <Button size="sm" variant="secondary" onclick={backToRoster}>
          {statusLine} · Back to roster
        </Button>
      </div>
    {/if}
  </div>
{/if}
