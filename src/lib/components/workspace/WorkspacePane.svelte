<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Badge } from "$lib/components/ui/badge";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileJsonIcon from "@lucide/svelte/icons/file-json";
  import FileIcon from "@lucide/svelte/icons/file";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import XIcon from "@lucide/svelte/icons/x";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import PinIcon from "@lucide/svelte/icons/pin";
  import TagIcon from "@lucide/svelte/icons/tag";

  interface FileEntry {
    name: string;
    type: "file" | "dir";
    size?: string;
    pinned?: boolean;
    tag?: "processed" | "invalid" | "reviewed";
    children?: FileEntry[];
  }

  let {
    entries = [],
    onClose,
  }: {
    entries?: FileEntry[];
    onClose?: () => void;
  } = $props();

  let expandedDirs = $state<Set<string>>(new Set(["agent-messages", "conversation-exports", "screenshots"]));

  function toggleDir(path: string) {
    const next = new Set(expandedDirs);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    expandedDirs = next;
  }

  function getFileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "md" || ext === "txt") return FileTextIcon;
    if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "svg" || ext === "webp") return FileImageIcon;
    if (ext === "json") return FileJsonIcon;
    return FileIcon;
  }

  function formatSize(size?: string) {
    if (!size) return "";
    return size;
  }

  const defaultEntries: FileEntry[] = [
    { name: ".git", type: "dir" },
    { name: "agent-messages", type: "dir", children: [
      { name: "archive", type: "dir" },
      { name: "README.md", type: "file", size: "0.9k" },
    ]},
    { name: "archive", type: "dir" },
    { name: "conversation-exports", type: "dir", children: [
      { name: "hermes_conversation_20260501.json", type: "file", size: "186.8k" },
      { name: "hermes_conversation_20260502.json", type: "file", size: "203.3k" },
    ]},
    { name: "docs", type: "dir", children: [
      { name: "mastra_migration_specs.md", type: "file", size: "12.4k", pinned: true },
      { name: "ui_spec.md", type: "file", size: "15.5k", pinned: true },
      { name: "slash_command_specs.md", type: "file", size: "8.8k" },
    ]},
    { name: "screenshots", type: "dir", children: [
      { name: "full_ui_3.png", type: "file", size: "539.4k" },
      { name: "glitch_a.png", type: "file", size: "123.2k" },
    ]},
  ];

  let resolvedEntries = $derived(entries.length > 0 ? entries : defaultEntries);
</script>

<aside class="flex h-full flex-col border-l bg-background">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2 border-b shrink-0">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Workspace</span>
      <Badge variant="outline" class="text-[0.5625rem] px-1.5 py-0 h-4">MAIN</Badge>
    </div>
    <div class="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" class="size-7 rounded-md" aria-label="Navigate back">
        <ChevronLeftIcon class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="size-7 rounded-md" aria-label="Navigate forward">
        <ChevronRightIcon class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="size-7 rounded-md">
        <PlusIcon class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="size-7 rounded-md">
        <FolderPlusIcon class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="size-7 rounded-md">
        <RefreshCwIcon class="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="size-7 rounded-md" onclick={onClose}>
        <XIcon class="size-3.5" />
      </Button>
    </div>
  </div>

  <!-- File Tree -->
  <ScrollArea class="flex-1">
    <div class="py-1">
      {#each resolvedEntries as entry (entry.name)}
        {@render treeItem(entry, "")}
      {/each}
    </div>
  </ScrollArea>
</aside>

{#snippet treeItem(entry: FileEntry, parentPath: string)}
  {@const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name}
  {@const isExpanded = expandedDirs.has(entry.name)}

  {#if entry.type === "dir"}
    <button
      class="flex w-full items-center gap-1.5 px-3 py-1 text-sm hover:bg-accent/50 transition-colors cursor-pointer text-left"
      style="padding-left: {(parentPath.split('/').length - 1) * 16 + 12}px"
      onclick={() => toggleDir(entry.name)}
    >
      <span class="size-3.5 shrink-0 flex items-center justify-center">
        {#if isExpanded}
          <ChevronDownIcon class="size-3" />
        {:else}
          <ChevronRightIcon class="size-3" />
        {/if}
      </span>
      {#if isExpanded}
        <FolderOpenIcon class="size-3.5 shrink-0 text-primary/70" />
      {:else}
        <FolderIcon class="size-3.5 shrink-0 text-muted-foreground" />
      {/if}
      <span class="flex-1 truncate text-xs">{entry.name}</span>
    </button>

    {#if isExpanded && entry.children}
      {#each entry.children as child (child.name)}
        {@render treeItem(child, fullPath)}
      {/each}
    {/if}
  {:else}
    {@const Icon = getFileIcon(entry.name)}
    <button
      class="group/file flex w-full items-center gap-1.5 px-3 py-1 text-sm hover:bg-accent/50 transition-colors cursor-pointer text-left"
      style="padding-left: {(parentPath.split('/').length - 1) * 16 + 28}px"
    >
      <Icon class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="flex-1 truncate text-xs">{entry.name}</span>
      <div class="flex items-center gap-1">
        {#if entry.tag}
          {@const tagStyles = entry.tag === "processed" ? "background: oklch(0.72 0.15 142 / 0.15); color: oklch(0.55 0.15 142);"
            : entry.tag === "invalid" ? "background: oklch(0.63 0.26 29 / 0.15); color: oklch(0.55 0.26 29);"
            : "background: oklch(0.62 0.18 250 / 0.15); color: oklch(0.50 0.18 250);"}
          <span
            class="inline-flex items-center gap-0.5 rounded-sm px-1 py-0 text-[0.5625rem] font-medium leading-tight"
            style={tagStyles}
          >
            <TagIcon class="size-2" />
            #{entry.tag}
          </span>
        {/if}
        {#if entry.pinned}
          <PinIcon class="size-2.5 text-primary" />
        {/if}
        {#if entry.size}
          <span class="text-[0.625rem] text-muted-foreground/60 tabular-nums">{formatSize(entry.size)}</span>
        {/if}
      </div>
    </button>
  {/if}
{/snippet}
