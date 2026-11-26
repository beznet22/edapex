<script lang="ts">
  import ResponsiveSheet from "$lib/components/shared/responsive-sheet.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import Download from "@lucide/svelte/icons/download";
  import { usePdfiumEngine } from "@embedpdf/engines/svelte";
  import { EmbedPDF } from "@embedpdf/core/svelte";
  import { createPluginRegistration } from "@embedpdf/core";
  import { ViewportPluginPackage, Viewport } from "@embedpdf/plugin-viewport/svelte";
  import {
    Scroller,
    ScrollPluginPackage,
    type RenderPageProps,
  } from "@embedpdf/plugin-scroll/svelte";
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from "@embedpdf/plugin-document-manager/svelte";
  import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/svelte";

  /**
   * Result PDF preview (plan Gate 4).
   *
   * `ResponsiveSheet` gives a bottom sheet on mobile and a slide-over on desktop; `dvh` keeps the
   * scroller inside the sheet so vertical panning never dismisses it. Rendering uses the project's
   * existing `@embedpdf` setup, the same one `/files` uses — no new dependency and no `<iframe>`
   * (which cannot pinch-zoom and prints poorly on iOS).
   */
  let {
    open = $bindable(false),
    studentName = "",
    pdfUrl = null,
    loading = false,
    error = null,
    canPublish = false,
    publishing = false,
    onpublish,
  }: {
    open: boolean;
    studentName?: string;
    pdfUrl?: string | null;
    loading?: boolean;
    error?: string | null;
    canPublish?: boolean;
    publishing?: boolean;
    onpublish?: () => void;
  } = $props();

  let containerWidth = $state(0);
  let containerRef = $state<HTMLDivElement | null>(null);

  const pdfEngine = usePdfiumEngine();

  const plugins = $derived(
    pdfUrl
      ? [
          createPluginRegistration(DocumentManagerPluginPackage, {
            initialDocuments: [{ url: pdfUrl }],
          }),
          createPluginRegistration(ViewportPluginPackage),
          createPluginRegistration(ScrollPluginPackage),
          createPluginRegistration(RenderPluginPackage),
        ]
      : []
  );

  $effect(() => {
    if (!containerRef) return;
    const observer = new ResizeObserver((entries) => {
      containerWidth = entries[0]?.contentRect.width ?? 0;
    });
    observer.observe(containerRef);
    return () => observer.disconnect();
  });

  function download(): void {
    if (!pdfUrl) return;
    const anchor = document.createElement("a");
    anchor.href = pdfUrl;
    anchor.download = `${studentName || "result"}.pdf`;
    anchor.click();
  }
</script>

<ResponsiveSheet
  bind:open
  title="Result sheet"
  description={studentName || undefined}
  contentClass="md:max-w-4xl"
>
  {#snippet footer()}
    <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" disabled={!pdfUrl} onclick={download}>
        <Download class="size-4" />
        Download PDF
      </Button>
      {#if canPublish && onpublish}
        <Button disabled={publishing} onclick={onpublish}>
          {publishing ? "Publishing…" : "Publish"}
        </Button>
      {/if}
    </div>
  {/snippet}

  <div class="flex h-[70dvh] flex-col overflow-hidden px-4 pb-2" bind:this={containerRef}>
    {#if error}
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    {:else if loading || !pdfUrl}
      <div class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner class="size-4" />
        Preparing the result sheet…
      </div>
    {:else if !pdfEngine.engine}
      <div class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner class="size-4" />
        Loading the PDF engine…
      </div>
    {:else}
      <div class="min-h-0 flex-1 overflow-hidden">
        <EmbedPDF engine={pdfEngine.engine} {plugins}>
          {#snippet children({ activeDocumentId })}
            {#if activeDocumentId}
              {@const documentId = activeDocumentId}
              <DocumentContent {documentId}>
                {#snippet children(documentContent)}
                  {#if documentContent.isLoaded}
                    {#snippet renderPage(page: RenderPageProps)}
                      {@const pageScale = containerWidth ? containerWidth / page.width : 1}
                      <div
                        style:width="{page.width * pageScale}px"
                        style:height="{page.height * pageScale}px"
                        class="origin-top"
                      >
                        <RenderLayer {documentId} pageIndex={page.pageIndex} scale={pageScale} />
                      </div>
                    {/snippet}
                    <Viewport {documentId} class="relative size-full overflow-x-hidden">
                      <Scroller {documentId} {renderPage} />
                    </Viewport>
                  {/if}
                {/snippet}
              </DocumentContent>
            {/if}
          {/snippet}
        </EmbedPDF>
      </div>
    {/if}
  </div>
</ResponsiveSheet>
