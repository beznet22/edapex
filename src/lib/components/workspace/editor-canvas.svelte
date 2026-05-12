<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Button } from "$lib/components/ui/button";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import ImageIcon from "@lucide/svelte/icons/image";
  import XIcon from "@lucide/svelte/icons/x";
  import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
  import MinimizeIcon from "@lucide/svelte/icons/minimize-2";

  let {
    filename = "",
    content = "",
    type = "text",
    onClose,
  }: {
    filename?: string;
    content?: string;
    type?: "text" | "image" | "pdf";
    onClose?: () => void;
  } = $props();

  let isMaximized = $state(false);
</script>

{#if filename}
  <div class="flex h-full flex-col border-t {isMaximized ? 'fixed inset-0 z-50 bg-background' : ''}">
    <div class="flex items-center justify-between px-3 py-1.5 border-b shrink-0 bg-muted/30">
      <div class="flex items-center gap-2 min-w-0">
        {#if type === "image"}
          <ImageIcon class="size-3.5 shrink-0 text-muted-foreground" />
        {:else}
          <FileTextIcon class="size-3.5 shrink-0 text-muted-foreground" />
        {/if}
        <span class="truncate text-xs font-medium">{filename}</span>
      </div>
      <div class="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          class="size-6 rounded-md"
          onclick={() => isMaximized = !isMaximized}
        >
          {#if isMaximized}
            <MinimizeIcon class="size-3" />
          {:else}
            <MaximizeIcon class="size-3" />
          {/if}
        </Button>
        <Button variant="ghost" size="icon" class="size-6 rounded-md" onclick={onClose}>
          <XIcon class="size-3" />
        </Button>
      </div>
    </div>

    <ScrollArea class="flex-1">
      {#if type === "text"}
        <pre class="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap wrap-break-word">{content}</pre>
      {:else if type === "image"}
        <div class="flex items-center justify-center p-4">
          <img src={content} alt={filename} class="max-w-full rounded-md shadow-sm" />
        </div>
      {:else if type === "pdf"}
        <div class="flex items-center justify-center p-8 text-sm text-muted-foreground">
          <p>PDF preview will be rendered by PrinceXML integration</p>
        </div>
      {/if}
    </ScrollArea>
  </div>
{/if}
