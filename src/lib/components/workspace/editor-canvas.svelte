<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import ImageIcon from "@lucide/svelte/icons/image";
  import XIcon from "@lucide/svelte/icons/x";
  import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
  import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
  import SaveIcon from "@lucide/svelte/icons/save";
  import EditIcon from "@lucide/svelte/icons/edit-3";
  import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import { onMount } from "svelte";
  import { cn } from "$lib/utils/shadcn";
  import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
  import EditorModeToggle from "$lib/components/editor/EditorModeToggle.svelte";

  // EmbedPDF imports
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration } from '@embedpdf/core';
  import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, ScrollPluginPackage, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { DocumentManagerPluginPackage, DocumentContent } from '@embedpdf/plugin-document-manager/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';

  let {
    filename = "",
    url = "",
    type = "text",
    onClose,
    onDownload,
    onExtract
  }: {
    filename?: string;
    url?: string;
    type?: "text" | "image" | "pdf";
    onClose?: () => void;
    onDownload?: () => void;
    onExtract?: () => void;
  } = $props();

  let isMaximized = $state(false);
  let textContent = $state("Loading...");
  let isEditing = $state(false);
  let editContent = $state("");
  let isSaving = $state(false);
  let containerWidth = $state(0);
  let containerRef = $state<HTMLDivElement | null>(null);

  // WYSIWYG mode state
  let editorMode = $state<"wysiwyg" | "raw">("wysiwyg");
  const isMarkdownFile = $derived(filename.endsWith(".md") || filename.endsWith(".markdown"));
  let wysiwygContent = $state("");

  function handleWysiwygUpdate(markdown: string) {
    wysiwygContent = markdown;
    editContent = markdown;
  }

  function saveWysiwygFile() {
    if (!url) return;
    isSaving = true;
    const content = editorMode === "wysiwyg" ? wysiwygContent : editContent;
    fetch(url, {
      method: "POST",
      body: new Blob([content], { type: 'text/plain' })
    }).then(() => {
      textContent = content;
    }).catch(err => console.error("Save error:", err))
      .finally(() => isSaving = false);
  }

  function startEdit() {
     isEditing = true;
     editContent = textContent;
  }

  function saveFile() {
     if (!url) return;
     isSaving = true;
     fetch(url, {
        method: "POST",
        body: new Blob([editContent], { type: 'text/plain' })
     }).then(() => {
        textContent = editContent;
        isEditing = false;
     }).catch(err => console.error("Save error:", err))
       .finally(() => isSaving = false);
  }
  
  // PDF Engine initialization
  const pdfEngine = usePdfiumEngine();

  let plugins = $derived(url ? [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: url }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ] : []);

  $effect(() => {
    if (type === "text" && url) {
       textContent = "Loading...";
       fetch(url)
         .then(r => r.text())
         .then(t => textContent = t)
         .catch(e => textContent = `Error loading file: ${e.message}`);
    }
  });
  
  $effect(() => {
    if (containerRef) {
      const observer = new ResizeObserver(entries => {
        containerWidth = entries[0].contentRect.width;
      });
      observer.observe(containerRef);
      return () => observer.disconnect();
    }
  });


</script>

{#if filename}
  <div class="flex flex-col w-full overflow-hidden border-t {isMaximized ? 'fixed inset-0 z-100 bg-background border-none' : 'h-full'}">

    <!-- Text/Markdown files -->
    {#if type === "text"}
      <!-- Mode toggle for markdown files -->
      {#if isMarkdownFile}
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-background/50 shrink-0">
          <span class="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">{filename}</span>
          <div class="flex items-center gap-2">
            {#if editorMode === "wysiwyg" || isEditing}
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
                onclick={editorMode === "wysiwyg" ? saveWysiwygFile : saveFile}
                disabled={isSaving}
              >
                <SaveIcon class="size-3 mr-1" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            {/if}
            <EditorModeToggle bind:mode={editorMode} />
          </div>
        </div>
      {/if}

      {#if isMarkdownFile && editorMode === "wysiwyg"}
        <!-- WYSIWYG Markdown Editor -->
        <div class="flex-1 min-h-0 overflow-hidden bg-background">
          {#if textContent !== "Loading..."}
            <WysiwygEditor
              content={textContent}
              onUpdate={handleWysiwygUpdate}
              class="h-full"
            />
          {:else}
            <div class="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading editor...
            </div>
          {/if}
        </div>
      {:else}
        <!-- Raw text / non-markdown files -->
        <ScrollArea class="flex-1 w-full bg-background overflow-hidden relative group">
          {#if isEditing}
            <textarea bind:value={editContent} class="w-full min-h-full absolute inset-0 p-4 text-[0.7rem] font-mono leading-relaxed bg-transparent resize-none outline-none border-none focus:ring-0"></textarea>
          {:else}
            <pre class="p-4 w-full text-[0.7rem] font-mono leading-relaxed whitespace-pre-wrap wrap-break-word">{textContent}</pre>
          {/if}
        </ScrollArea>
      {/if}
    {:else if type === "image"}
      <ScrollArea class="flex-1">
        <div class="flex items-center justify-center p-4">
          <img src={url} alt={filename} class="max-w-full rounded-md shadow-sm" />
        </div>
      </ScrollArea>
    {:else if type === "pdf"}
      <div 
        class="flex-1 overflow-hidden relative bg-white" 
        bind:this={containerRef}
      >
        {#if pdfEngine.isLoading || !pdfEngine.engine}
          <div class="absolute inset-0 flex justify-center items-center text-sm font-medium text-muted-foreground">
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
                        {@const pageScale = containerWidth ? containerWidth / page.width : 1}
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
                      <Viewport {documentId} class="w-full h-full overflow-x-hidden relative">
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

    <!-- Dual FABs -->
    <div class="absolute bottom-10 right-10 flex flex-col gap-2 z-50">
      {#if type === "pdf" || type === "image"}
        <Button 
          variant="secondary"
          size="icon"
          class="rounded-full bg-primary hover:bg-primary/80 text-slate-950 shadow-[0_0_30px_rgba(212,175,55,0.4)] border border-white/20 transition-all duration-500 scale-100 hover:scale-110 active:scale-95 cursor-pointer group/fab"
          onclick={onExtract}
        >
          <ZapIcon class="size-4 fill-current group-hover/fab:animate-pulse" />
        </Button>
      {/if}
      
      <Button 
        variant="secondary"
        size="icon"
        class="rounded-full bg-slate-900/60 backdrop-blur-3xl hover:bg-slate-800 border border-white/10 text-white shadow-2xl transition-all duration-500 scale-100 hover:scale-110 active:scale-95 cursor-pointer group/fab"
        onclick={onDownload}
      >
        <ArrowDownToLine class="size-4 opacity-60 group-hover/fab:opacity-100" />
      </Button>
    </div>
  </div>
{/if}
