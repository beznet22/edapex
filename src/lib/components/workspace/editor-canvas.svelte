<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
  import EditorModeToggle from "$lib/components/editor/EditorModeToggle.svelte";
  import { toast } from "svelte-sonner";

  // EmbedPDF imports
  import { usePdfiumEngine } from "@embedpdf/engines/svelte";
  import { EmbedPDF } from "@embedpdf/core/svelte";
  import { createPluginRegistration } from "@embedpdf/core";
  import {
    ViewportPluginPackage,
    Viewport,
  } from "@embedpdf/plugin-viewport/svelte";
  import {
    Scroller,
    ScrollPluginPackage,
    type RenderPageProps,
  } from "@embedpdf/plugin-scroll/svelte";
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from "@embedpdf/plugin-document-manager/svelte";
  import {
    RenderLayer,
    RenderPluginPackage,
  } from "@embedpdf/plugin-render/svelte";

  let {
    filename = "",
    url = "",
    content = "",
    type = "text",
    editorMode = $bindable("wysiwyg"),
    isSaving = $bindable(false),
    onClose,
    onDownload,
    onExtract,
  }: {
    filename?: string;
    url?: string;
    content?: string;
    type?: "text" | "image" | "pdf";
    editorMode?: "wysiwyg" | "raw";
    isSaving?: boolean;
    onClose?: () => void;
    onDownload?: () => void;
    onExtract?: (content: string) => void;
  } = $props();

  let textContent = $state("Loading...");
  let editContent = $state("");
  let containerWidth = $state(0);
  let containerRef = $state<HTMLDivElement | null>(null);

  // WYSIWYG mode state
  const isMarkdownFile = $derived(
    filename.endsWith(".md") || filename.endsWith(".markdown"),
  );
  let wysiwygContent = $state("");

  function handleWysiwygUpdate(markdown: string) {
    wysiwygContent = markdown;
    editContent = markdown;
  }

  export function save() {
    if (!url) return;
    isSaving = true;
    const content = editorMode === "wysiwyg" ? wysiwygContent : editContent;
    fetch(url, {
      method: "POST",
      body: new Blob([content], { type: "text/plain" }),
    })
      .then(() => {
        textContent = content;
        toast.success("File saved successfully");
      })
      .catch((err) => {
        console.error("Save error:", err);
        toast.error("Failed to save file");
      })
      .finally(() => (isSaving = false));
  }

  export function copy() {
    const content = editorMode === "wysiwyg" && isMarkdownFile ? wysiwygContent : editContent;
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    }
  }

  export function share() {
    toast.info("Share functionality coming soon");
  }

  export function toggleMode() {
    editorMode = editorMode === "wysiwyg" ? "raw" : "wysiwyg";
  }

  // PDF Engine initialization
  const pdfEngine = usePdfiumEngine();

  let plugins = $derived(
    url
      ? [
          createPluginRegistration(DocumentManagerPluginPackage, {
            initialDocuments: [{ url: url }],
          }),
          createPluginRegistration(ViewportPluginPackage),
          createPluginRegistration(ScrollPluginPackage),
          createPluginRegistration(RenderPluginPackage),
        ]
      : [],
  );

  $effect(() => {
    if (type === "text") {
      if (url) {
        textContent = "Loading...";
        editContent = "";
        fetch(url)
          .then((r) => r.text())
          .then((t) => {
            textContent = t;
            editContent = t; // keep raw editor in sync
          })
          .catch((e) => {
            textContent = `Error loading file: ${e.message}`;
            editContent = textContent;
          });
      } else if (content) {
        textContent = content;
        editContent = content;
      }
    }
  });

  $effect(() => {
    if (containerRef) {
      const observer = new ResizeObserver((entries) => {
        containerWidth = entries[0].contentRect.width;
      });
      observer.observe(containerRef);
      return () => observer.disconnect();
    }
  });
</script>

{#if filename}
  <div class="flex flex-col w-full h-full relative pb-4">
    <!-- Text/Markdown files -->
    {#if type === "text"}
      <!-- Mode toggle for markdown files (Floating FAB) -->
      {#if isMarkdownFile}
        <div
          class="absolute top-4 left-1/2 -translate-x-1/2 z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-2xl rounded-full pointer-events-auto"
        >
          <EditorModeToggle bind:mode={editorMode} />
        </div>
      {/if}

      {#if isMarkdownFile && editorMode === "wysiwyg"}
        <!-- WYSIWYG Markdown Editor -->
        <div class="flex-1 min-h-0 overflow-hidden">
          {#if textContent !== "Loading..."}
            <WysiwygEditor
              content={textContent}
              onUpdate={handleWysiwygUpdate}
              class="h-full"
            />
          {:else}
            <div
              class="flex items-center justify-center h-full text-muted-foreground text-sm"
            >
              Loading editor...
            </div>
          {/if}
        </div>
      {:else}
        <!-- Raw text / non-markdown files -->
        <ScrollArea
          class="flex-1 w-full bg-background overflow-hidden relative"
        >
          <textarea
            bind:value={editContent}
            class="w-full min-h-full absolute inset-0 p-4 text-[0.7rem] font-mono leading-relaxed bg-transparent resize-none outline-none border-none focus:ring-0"
          ></textarea>
        </ScrollArea>
      {/if}
    {:else if type === "image"}
      <ScrollArea class="flex-1">
        <div class="flex items-center justify-center p-4">
          <img
            src={url}
            alt={filename}
            class="max-w-full rounded-md shadow-sm"
          />
        </div>
      </ScrollArea>
    {:else if type === "pdf"}
      <div
        class="flex-1 overflow-hidden relative bg-white"
        bind:this={containerRef}
      >
        {#if pdfEngine.isLoading || !pdfEngine.engine}
          <div
            class="absolute inset-0 flex justify-center items-center text-sm font-medium text-muted-foreground"
          >
            Loading PDF Engine...
          </div>
        {:else}
          <EmbedPDF engine={pdfEngine.engine} {plugins}>
            {#snippet children({ activeDocumentId })}
              {#if activeDocumentId}
                {@const documentId = activeDocumentId}
                <DocumentContent {documentId}>
                  {#snippet children(documentContent)}
                    {#if documentContent.isLoaded}
                      {#snippet renderPage(page: RenderPageProps)}
                        {@const pageScale = containerWidth
                          ? containerWidth / page.width
                          : 1}
                        <div
                          style:width="{page.width * pageScale}px"
                          style:height="{page.height * pageScale}px"
                          class="bg-white origin-top transition-all duration-300"
                        >
                          <RenderLayer
                            {documentId}
                            pageIndex={page.pageIndex}
                            scale={pageScale}
                          />
                        </div>
                      {/snippet}
                      <Viewport
                        {documentId}
                        class="w-full h-full overflow-x-hidden relative"
                      >
                        <Scroller {documentId} {renderPage} />
                      </Viewport>
                    {/if}
                  {/snippet}
                </DocumentContent>
              {/if}
            {/snippet}
          </EmbedPDF>
        {/if}
      </div>
    {/if}


    <!-- Floating Action Buttons -->
    <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 pointer-events-auto">
      {#if content && onExtract}
        <button onclick={() => onExtract(editorMode === 'wysiwyg' ? wysiwygContent : editContent)} class="px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-full text-xs font-bold transition-all shadow-lg border border-green-500/30 backdrop-blur-md">
          Approve (✓)
        </button>
      {/if}
      {#if content && onClose}
        <button onclick={onClose} class="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-full text-xs font-bold transition-all shadow-lg border border-red-500/30 backdrop-blur-md">
          Reject / Retry (✗)
        </button>
      {/if}
    </div>

  </div>
{/if}
