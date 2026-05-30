<script lang="ts">
  import { cn } from "$lib/utils/shadcn";
  import type { ArtifactGroup, FlatFile } from "./workspace-context.svelte.ts";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import FileAudioIcon from "@lucide/svelte/icons/file-audio";
  import FileVideoIcon from "@lucide/svelte/icons/file-video";
  import FileIcon from "@lucide/svelte/icons/file";
  import FilmIcon from "@lucide/svelte/icons/film";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import BookTextIcon from "@lucide/svelte/icons/book-text";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import MessageSquarePlusIcon from "@lucide/svelte/icons/message-square-plus";

  let {
    groups,
    viewMode = "list",
    activeFileKey,
    references = [],
    onFileClick,
    onToggleReference,
  }: {
    groups: ArtifactGroup[];
    viewMode: "list" | "grid";
    activeFileKey: string | null;
    references?: { key: string; name: string; type: "file" | "dir" }[];
    onFileClick: (file: FlatFile) => void;
    onToggleReference?: (file: FlatFile) => void;
  } = $props();

  // ── Icon helpers ────────────────────────────────────────────────────────────

  function getCategoryIcon(iconKey: string) {
    switch (iconKey) {
      case "media":    return FilmIcon;
      case "image":    return FileImageIcon;
      case "document": return FileTextIcon;
      case "data":     return DatabaseIcon;
      case "markdown": return BookTextIcon;
      default:         return LayersIcon;
    }
  }

  function getFileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf", "docx", "doc", "pptx", "xlsx"].includes(ext)) return FileTextIcon;
    if (["md", "mdx", "txt"].includes(ext))                    return BookTextIcon;
    if (["png", "jpg", "jpeg", "svg", "webp", "gif", "avif", "bmp"].includes(ext)) return FileImageIcon;
    if (["mp4", "mov", "avi", "webm"].includes(ext))            return FileVideoIcon;
    if (["mp3", "wav", "ogg", "flac"].includes(ext))            return FileAudioIcon;
    if (["json", "csv", "xml", "yaml", "yml"].includes(ext))    return FileJsonIcon;
    return FileIcon;
  }

  function getFileAccentClass(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf", "docx", "doc"].includes(ext))                   return "text-rose-400";
    if (["md", "mdx", "txt"].includes(ext))                     return "text-blue-400";
    if (["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(ext)) return "text-purple-400";
    if (["mp4", "mov", "avi", "webm"].includes(ext))             return "text-cyan-400";
    if (["mp3", "wav", "ogg"].includes(ext))                     return "text-green-400";
    if (["csv", "json", "xml"].includes(ext))                    return "text-amber-400";
    return "text-white/50";
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return "";
    const k = 1024;
    if (bytes < k)       return bytes + " B";
    if (bytes < k * k)   return (bytes / k).toFixed(1) + " KB";
    return (bytes / (k * k)).toFixed(1) + " MB";
  }

  function isReferenced(key: string): boolean {
    return references.some((r) => r.key === key);
  }

  function getFileName(key: string): string {
    return key.split("/").pop() ?? key;
  }
</script>

<!-- ── Empty state ──────────────────────────────────────────────────────────── -->
{#if groups.length === 0}
  <div class="h-full flex flex-col items-center justify-center text-center px-8 opacity-25">
    <div class="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
      <LayersIcon class="size-7 text-primary" />
    </div>
    <p class="text-[11px] font-black tracking-widest uppercase text-white mb-1">No Artifacts</p>
    <p class="text-[10px] text-white/50 leading-relaxed max-w-[200px]">
      Upload files to see them categorized here.
    </p>
  </div>
{:else}
  <div class="flex flex-col gap-0 overflow-y-auto h-full pb-4">
    {#each groups as group}
      {@const CategoryIcon = getCategoryIcon(group.icon)}
      <!-- Category header -->
      <div class="flex items-center gap-2 px-3 pt-3 pb-1.5 sticky top-0 bg-slate-950/80 backdrop-blur-sm z-10">
        <CategoryIcon class="size-3 text-primary/70 shrink-0" />
        <span class="text-[9px] font-black uppercase tracking-[0.18em] text-primary/70">{group.name}</span>
        <span class="text-[9px] text-white/20 font-semibold ml-auto">{group.files.length}</span>
      </div>

      <!-- Files -->
      {#if viewMode === "list"}
        <!-- ── List layout ──────────────────────────────────────────────────── -->
        <div class="flex flex-col gap-0">
          {#each group.files as file}
            {@const fileName = getFileName(file.key)}
            {@const Icon = getFileIcon(fileName)}
            {@const accentClass = getFileAccentClass(fileName)}
            {@const isActive = activeFileKey === file.key}
            {@const isRef = isReferenced(file.key)}
            <div
              role="button"
              tabindex="0"
              class={cn(
                "group relative flex items-center gap-2 w-full text-left px-3 py-1.5 transition-all duration-150",
                isActive
                  ? "bg-white/8 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white cursor-pointer",
              )}
              onclick={() => onFileClick(file)}
              onkeydown={(e) => e.key === "Enter" && onFileClick(file)}
            >
              <Icon class={cn("size-3.5 shrink-0", accentClass)} />
              <span class="text-[11px] font-medium truncate flex-1 min-w-0">{fileName}</span>
              <span class="text-[9px] text-white/25 shrink-0 tabular-nums">{formatSize(file.size)}</span>

              <!-- Chat-reference button, appears on hover -->
              {#if onToggleReference}
                <button
                  class={cn(
                    "absolute right-2 size-5 rounded flex items-center justify-center transition-all",
                    isRef
                      ? "opacity-100 text-primary bg-primary/10"
                      : "opacity-0 group-hover:opacity-100 text-white/40 hover:text-primary hover:bg-primary/10",
                  )}
                  onclick={(e) => { e.stopPropagation(); onToggleReference!(file); }}
                  title={isRef ? "Remove reference" : "Reference in chat"}
                >
                  <MessageSquarePlusIcon class="size-3" />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- ── Grid layout ──────────────────────────────────────────────────── -->
        <div class="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 px-2 pb-1">
          {#each group.files as file}
            {@const fileName = getFileName(file.key)}
            {@const Icon = getFileIcon(fileName)}
            {@const accentClass = getFileAccentClass(fileName)}
            {@const isActive = activeFileKey === file.key}
            {@const isRef = isReferenced(file.key)}
            <div
              role="button"
              tabindex="0"
              class={cn(
                "group relative flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all duration-150 cursor-pointer",
                isActive
                  ? "border-primary/40 bg-primary/10 text-white"
                  : "border-white/8 bg-white/3 text-white/60 hover:border-white/15 hover:bg-white/7 hover:text-white",
              )}
              onclick={() => onFileClick(file)}
              onkeydown={(e) => e.key === "Enter" && onFileClick(file)}
            >
              <Icon class={cn("size-6 shrink-0", accentClass)} />
              <span class="text-[10px] font-medium leading-tight line-clamp-2 w-full break-all">{fileName}</span>
              {#if file.size}
                <span class="text-[8px] text-white/25 tabular-nums">{formatSize(file.size)}</span>
              {/if}

              <!-- Chat-reference button overlay -->
              {#if onToggleReference}
                <button
                  class={cn(
                    "absolute top-1.5 right-1.5 size-5 rounded flex items-center justify-center transition-all",
                    isRef
                      ? "opacity-100 text-primary bg-primary/10"
                      : "opacity-0 group-hover:opacity-100 text-white/40 hover:text-primary hover:bg-primary/10",
                  )}
                  onclick={(e) => { e.stopPropagation(); onToggleReference!(file); }}
                  title={isRef ? "Remove reference" : "Reference in chat"}
                >
                  <MessageSquarePlusIcon class="size-3" />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
{/if}
