<script lang="ts">
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import { Spinner } from "$lib/components/ui/spinner";
  import ScanViewfinder from "$lib/components/people/scan/scan-viewfinder.svelte";
  import MarksReviewSheet from "$lib/components/people/scan/marks-review-sheet.svelte";
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
  import type { Marksheet } from "$lib/schema/marksheet";
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
  /**
   * After a capture the teacher lands in the review grid for THAT student, on top of the camera.
   * Nothing advances automatically: closing the drawer returns to the viewfinder, where Prev/Next
   * is the teacher's own decision.
   */
  let reviewOpen = $state(false);
  let reviewMarksheet = $state<Marksheet | null>(null);
  let reviewWarnings = $state<string[]>([]);
  let reviewErrors = $state<string[]>([]);
  let reviewImageUrl = $state<string | null>(null);
  let reviewSaving = $state(false);
  let reviewLoading = $state(false);
  let reviewStudentId = $state<number | null>(null);
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
    const targetStudentId = student.id;

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
    await openReview(targetStudentId);
  }

  /**
   * Slides the review grid in over the camera for one student.
   *
   * Opens immediately with a skeleton — extraction is still running in most cases, and a blank
   * sheet would look broken. Polls until the draft lands, then fills the grid. The camera stays
   * mounted underneath, so closing returns to a live viewfinder rather than a cold start.
   */
  async function openReview(studentId: number): Promise<void> {
    if (data.examTypeId === null) return;
    reviewStudentId = studentId;
    reviewMarksheet = null;
    reviewWarnings = [];
    reviewErrors = [];
    reviewImageUrl = null;
    reviewLoading = true;
    reviewOpen = true;

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const payload = await fetchDraft(studentId);
      if (payload === null) break;

      if (payload.marksheet) {
        reviewMarksheet = payload.marksheet;
        reviewWarnings = payload.warnings ?? [];
        reviewErrors = payload.errors ?? [];
        reviewImageUrl = payload.imageUrl ?? null;
        reviewLoading = false;
        return;
      }

      // `failed` is terminal — stop polling and show the reason.
      if (payload.status === "failed") {
        reviewErrors = [
          payload.failure?.message ?? "Extraction failed. Re-scan or retry this student.",
        ];
        reviewLoading = false;
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    reviewErrors = ["Extraction is taking longer than expected. You can review it from the roster."];
    reviewLoading = false;
  }

  async function fetchDraft(studentId: number): Promise<{
    status?: string;
    marksheet?: Marksheet | null;
    warnings?: string[];
    errors?: string[];
    imageUrl?: string | null;
    failure?: { message?: string };
  } | null> {
    if (data.examTypeId === null) return null;
    try {
      const response = await fetch(
        `/api/people/marks/draft?student=${studentId}&exam=${data.examTypeId}`,
        { headers: { accept: "application/json" } }
      );
      if (!response.ok) return null;
      return (await response.json()) as {
        status?: string;
        marksheet?: Marksheet | null;
        warnings?: string[];
        errors?: string[];
        imageUrl?: string | null;
        failure?: { message?: string };
      };
    } catch {
      return null;
    }
  }

  /** Next student with nothing saved yet, wrapping past the end. -1 when the class is done. */
  function nextUngradedIndex(from: number): number {
    for (let offset = 1; offset <= roster.length; offset += 1) {
      const index = (from + offset) % roster.length;
      const row = roster[index];
      if (row && (row.status === "not_uploaded" || row.status === "failed" || row.status === "draft")) {
        return index;
      }
    }
    return -1;
  }

  async function saveReview(marksheet: Marksheet): Promise<void> {
    if (reviewStudentId === null || data.examTypeId === null) return;
    reviewSaving = true;
    try {
      const response = await fetch("/api/people/marks/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: reviewStudentId,
          examTypeId: data.examTypeId,
          marksheet,
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as { error?: string };
        reviewErrors = [failure.error ?? "Could not save these marks"];
        return;
      }
      const savedName = reviewMarksheet?.student.fullName ?? "marks";
      toast.success(`Saved ${savedName}`);
      reviewOpen = false;

      // Verified → move to the next student who still needs marks.
      const next = nextUngradedIndex(activeIndex);
      if (next >= 0) activeIndex = next;
      else toast.info("Every student in this class has been scanned");
    } finally {
      reviewSaving = false;
    }
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
      // No auto-advance. The review drawer is open in front of the camera; the teacher closes it
      // when they are done, then moves on with Prev/Next or the next row.
      advanceFeedback();
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

<MarksReviewSheet
  bind:open={reviewOpen}
  marksheet={reviewMarksheet}
  loading={reviewLoading}
  status={reviewLoading ? "extracting" : "draft"}
  imageUrl={reviewImageUrl}
  warnings={reviewWarnings}
  errors={reviewErrors}
  busy={reviewSaving}
  onsave={(marksheet) => void saveReview(marksheet)}
  onrescan={() => {
    reviewOpen = false;
    void capture();
  }}
  onclose={() => {
    // Draft is kept server-side; the teacher is simply back on the camera.
    reviewMarksheet = null;
    reviewErrors = [];
    reviewWarnings = [];
  }}
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
