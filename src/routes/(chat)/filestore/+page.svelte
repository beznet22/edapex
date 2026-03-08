<script lang="ts">
    import { useFileActions } from "$lib/context/file-context.svelte";
    import {
        FilestoreContext,
        useFilestore,
    } from "$lib/context/filestore.svelte";
    import FileViewModal from "$lib/components/file-view-modal.svelte";
    import DropZone from "$lib/components/drop-zone.svelte";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Skeleton } from "$lib/components/ui/skeleton";
    import ChatHeader from "$lib/components/chat-header.svelte";
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import Search from "@lucide/svelte/icons/search";
    import Folder from "@lucide/svelte/icons/folder";
    import Plus from "@lucide/svelte/icons/plus";
    import ImageIcon from "@lucide/svelte/icons/image";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index";
    import { Loader } from "$lib/components/prompt-kit/loader";
    import { toast } from "svelte-sonner";
    import { type UploadedData, getAssessmentStatusDescription } from "$lib/types/chat-types";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";

    const store = new FilestoreContext();
    store.setContext();

    function handleAddNew() {
        store.fileCtx.openModal = true;
    }

    function handleView(file: UploadedData) {
        store.handleView(file);
    }
    // ... (existing code)
    $effect(() => {
        store.loadResources();
    });
</script>

<div class="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
  <ChatHeader />

  <div class="flex-1 min-h-0 overflow-auto bg-background/50 scrollbar-hide">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <!-- Sticky Header & Filters -->
        <div
            class="sticky top-0 z-30 bg-background/80 backdrop-blur-xl -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 safe-area-top"
        >
            <!-- Header -->
            <div
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 sm:py-8"
            >
                <div class="space-y-1 hidden sm:block">
                    <h1
                        class="text-2xl sm:text-3xl font-black text-foreground tracking-tight uppercase"
                    >
                        File Store
                    </h1>
                    <p
                        class="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60"
                    >
                        Manage your uploaded assessment files
                    </p>
                </div>

                <div
                    class="flex flex-row items-center gap-3 w-full sm:w-auto"
                >
                    <div class="relative group flex-1 sm:flex-none">
                        <Search
                            class="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 group-focus-within:text-primary transition-colors"
                        />
                        <Input
                            type="search"
                            placeholder="Search..."
                            class="pl-10 h-11 w-full sm:w-72 bg-muted/30 border-none rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/20 font-medium transition-all"
                            bind:value={store.searchQuery}
                        />
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                        <Button
                            variant="secondary"
                            size="icon"
                            class="h-11 w-11 rounded-2xl bg-muted/30 border-none hover:bg-muted/50 transition-all"
                            onclick={() => store.loadResources()}
                        >
                            <RefreshCw
                                class="h-4 w-4 {store.isPageLoading
                                    ? 'animate-spin'
                                    : ''}"
                            />
                        </Button>

                        <Button
                            class="h-11 px-6 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all"
                            onclick={handleAddNew}
                        >
                            <Plus class="h-4 w-4 sm:mr-2" />
                            <span class="hidden sm:inline">Upload</span>
                        </Button>
                    </div>
                </div>
            </div>

            <!-- Folder Pills -->
            {#if store.folders.length > 0}
                <div
                    class="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide"
                >
                    <button
                        class="px-5 py-2.5 min-h-[44px] flex items-center rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none {store.selectedFolder ===
                        null
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 active:scale-95'}"
                        onclick={() => (store.selectedFolder = null)}
                    >
                        All Collections
                    </button>
                    {#each store.folders as folder}
                        <button
                            class="px-5 py-2.5 min-h-[44px] flex items-center rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none {store.selectedFolder ===
                            folder
                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 active:scale-95'}"
                            onclick={() => (store.selectedFolder = folder)}
                        >
                            {folder}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Loading State -->
        {#if store.isPageLoading}
            <div>
                <h2
                    class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4"
                >
                    Files
                </h2>
                <div
                    class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                >
                    {#each Array(8) as _}
                        <div class="bg-card rounded-2xl p-5">
                            <div class="flex justify-center mb-4">
                                <Skeleton
                                    class="bg-muted-foreground/10 w-16 h-20 rounded-lg"
                                />
                            </div>
                            <div class="text-center space-y-2">
                                <Skeleton
                                    class="bg-muted-foreground/10 h-4 w-3/4 mx-auto"
                                />
                                <Skeleton
                                    class="bg-muted-foreground/10 h-3 w-1/2 mx-auto"
                                />
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {:else}
            <!-- Files Grid -->
            <div>
                <h2
                    class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6 flex items-center gap-2"
                >
                    <div class="w-1 h-3 bg-primary rounded-full"></div>
                    {store.selectedFolder
                        ? store.selectedFolder
                        : "All Assessments"}
                </h2>

                <div
                    class="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6"
                >
                    {#if store.filteredFiles.length === 0}
                        <div
                            class="col-span-full flex flex-col items-center justify-center py-32 bg-muted/10 rounded-2xl sm:rounded-3xl border border-dashed border-muted/50"
                        >
                            <ImageIcon
                                class="w-8 h-8 text-muted-foreground/20 mb-2"
                            />
                            <p
                                class="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-widest"
                            >
                                No records found
                            </p>
                        </div>
                    {:else}
                        {#each store.filteredFiles as file (file.id)}
                        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
                        <div
                                class="group relative bg-card rounded-xl sm:rounded-2xl p-1.5 sm:p-2 lg:p-3 hover:shadow-lg transition-all duration-300 ease-out border border-border/50 text-left w-full focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
                            >
                                <div
                                    class="aspect-square sm:aspect-3/4 rounded-lg sm:rounded-xl bg-muted/40 overflow-hidden mb-1.5 sm:mb-2 relative cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 ease-out"
                                    role="button"
                                    tabindex="0"
                                    onclick={() => handleView(file)}
                                    onkeydown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            handleView(file);
                                        }
                                    }}
                                >
                                    {#if file.type?.startsWith("image/")}
                                        <img
                                            src={file.url}
                                            alt={file.filename}
                                            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    {:else}
                                        <div
                                            class="w-full h-full flex items-center justify-center"
                                        >
                                            <Folder
                                                class="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-muted-foreground/40 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                                            />
                                        </div>
                                    {/if}
                                    <div
                                        class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300"
                                    ></div>

                                    <!-- Status Overlay/Spinner -->
                                    {#if file.status === "uploading" || file.status === "retrying"}
                                        <div
                                            class="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 bg-background/60 backdrop-blur-md rounded-full p-1.5 shadow-sm border border-white/20 z-10 flex items-center justify-center"
                                        >
                                            <Loader
                                                variant="circular"
                                                size="sm"
                                            />
                                        </div>
                                    {/if}
                                </div>

                                <!-- Status indicator - Moved out of scaling container -->
                                <div
                                    class="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 pointer-events-auto"
                                    role="presentation"
                                >
                                    <Tooltip.Provider delayDuration={0}>
                                        <Tooltip.Root>
                                            <Tooltip.Trigger 
                                                onclick={(e) => e.stopPropagation()}
                                                onkeydown={(e) => e.stopPropagation()}
                                            >
                                                {#if ["extracted", "approved", "published"].includes(file.status)}
                                                    <div
                                                        class="px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                                                    >
                                                        {file.status}
                                                    </div>
                                                {:else if file.status === "error"}
                                                    <div
                                                        class="px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-destructive/20"
                                                    >
                                                        Error
                                                    </div>
                                                {:else if file.status === "uploaded"}
                                                    <div
                                                        class="px-3 py-1 rounded-full bg-amber-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/20"
                                                    >
                                                        Uploaded
                                                    </div>
                                                {:else}
                                                    <div
                                                        class="px-3 py-1 rounded-full bg-blue-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 animate-pulse"
                                                    >
                                                        {file.status || "..."}
                                                    </div>
                                                {/if}
                                            </Tooltip.Trigger>
                                            <Tooltip.Content side="bottom" sideOffset={5} portalProps={{ disabled: true }} class="z-100">
                                                <p class="text-[10px] font-bold uppercase tracking-widest max-w-[200px] text-wrap text-center px-3 py-1.5">{getAssessmentStatusDescription(file.status, file.error)}</p>
                                            </Tooltip.Content>
                                        </Tooltip.Root>
                                    </Tooltip.Provider>
                                </div>

                                <div class="space-y-0.5 px-0.5">
                                    <h3
                                        class="font-black text-[10px] sm:text-xs truncate uppercase tracking-tight"
                                        title={file.filename}
                                    >
                                        {file.filename}
                                    </h3>
                                    <div
                                        class="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground/60 font-medium"
                                    >
                                        <span class="truncate opacity-70">
                                            {file.originalName || file.filename}
                                        </span>
                                    </div>
                                    <div
                                        class="flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground/40"
                                    >
                                        {#if file.createdAt}
                                            <span class="truncate">
                                                {new Date(
                                                    file.createdAt,
                                                ).toLocaleDateString("en-GB", {
                                                    day: "2-digit",
                                                    month: "short",
                                                })}
                                            </span>
                                        {/if}
                                        {#if file.size}
                                            <span class="shrink-0">
                                                {(file.size / 1024).toFixed(0)}K
                                            </span>
                                        {/if}
                                    </div>
                                </div>

                                <div
                                    class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10"
                                >
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger
                                            class="flex items-center justify-center p-2 min-w-[44px] min-h-[44px] rounded-full bg-background/80 backdrop-blur-sm border border-border opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hover:bg-muted active:scale-95"
                                            onclick={(e) => e.stopPropagation()}
                                            aria-label="File actions"
                                        >
                                            <EllipsisVertical
                                                class="w-3.5 h-3.5"
                                            />
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Content align="center">
                                            <DropdownMenu.Group>
                                                <DropdownMenu.Label
                                                    >Actions</DropdownMenu.Label
                                                >
                                                <DropdownMenu.Separator />
                                                <DropdownMenu.Item
                                                    onclick={() =>
                                                        handleView(file)}
                                                >
                                                    View Details
                                                </DropdownMenu.Item>
                                                <DropdownMenu.Item
                                                    onclick={() =>
                                                        store.fileCtx.retryUpload(
                                                            file,
                                                        )}
                                                    class="text-primary"
                                                >
                                                    Retry Extraction
                                                </DropdownMenu.Item>
                                                <DropdownMenu.Separator />
                                                <DropdownMenu.Item
                                                    onclick={() =>
                                                        store.fileCtx.deleteFile(
                                                            file,
                                                        )}
                                                    class="text-destructive focus:text-destructive"
                                                >
                                                    Delete
                                                </DropdownMenu.Item>
                                            </DropdownMenu.Group>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Root>
                                </div>
                        </div>
                        {/each}
                        <!-- Add New Card -->
                        <button
                            class="border-muted hover:border-primary/50 hover:bg-primary/5 min-h-[120px] sm:min-h-[180px] lg:min-h-[220px] cursor-pointer rounded-xl sm:rounded-2xl border-2 border-dashed p-3 sm:p-4 transition-all duration-300 group flex flex-col items-center justify-center w-full active:scale-[0.98]"
                            onclick={handleAddNew}
                            type="button"
                            aria-label="Upload New Assessment"
                        >
                            <div
                                class="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-xl sm:rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center mb-2 sm:mb-3 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                            >
                                <Plus
                                    class="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-muted-foreground group-hover:text-primary transition-colors duration-300"
                                />
                            </div>
                            <span
                                class="text-[9px] sm:text-[10px] lg:text-xs font-semibold text-muted-foreground group-hover:text-primary uppercase tracking-wider transition-colors"
                                >Upload</span
                            >
                            <span
                                class="text-[8px] sm:text-[9px] text-muted-foreground/60 mt-0.5 whitespace-nowrap hidden sm:block"
                                >Max 5MB</span
                            >
                        </button>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
</div>

<FileViewModal bind:open={store.viewModalOpen} file={store.selectedFile} />
<DropZone />
</div>
