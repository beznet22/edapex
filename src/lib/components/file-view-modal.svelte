<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Tabs from "$lib/components/ui/tabs";
    import * as Sheet from "$lib/components/ui/sheet";
    import { Button } from "$lib/components/ui/button";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Textarea } from "$lib/components/ui/textarea";
    import * as Select from "$lib/components/ui/select";
    import FileText from "@lucide/svelte/icons/file-text";
    import X from "@lucide/svelte/icons/x";
    import ZoomIn from "@lucide/svelte/icons/zoom-in";
    import ZoomOut from "@lucide/svelte/icons/zoom-out";
    import RotateCw from "@lucide/svelte/icons/rotate-cw";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import Check from "@lucide/svelte/icons/check";
    import Send from "@lucide/svelte/icons/send";
    import LoaderCircle from "@lucide/svelte/icons/loader-circle";
    import Grid3X3 from "@lucide/svelte/icons/grid-3x3";
    import Languages from "@lucide/svelte/icons/languages";
    import Search from "@lucide/svelte/icons/search";
    import LayoutGrid from "@lucide/svelte/icons/layout-grid";
    import { useFilestore } from "$lib/context/filestore.svelte";
    import { type UploadedData, getAssessmentStatusDescription } from "$lib/types/chat-types";
    import { AttributeRemark } from "$lib/constants/assessment";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";

    let { open = $bindable(false), file = null } = $props();

    const store = useFilestore();

    // Sync prop with store
    $effect(() => {
        store.viewModalOpen = open;
    });
    $effect(() => {
        if (store.viewModalOpen !== open) {
            open = store.viewModalOpen;
        }
    });

    // Gesture State
    let isPanning = $state(false);
    let panX = $state(0);
    let panY = $state(0);
    let startX = 0;
    let startY = 0;
    let startDist = 0;
    let startZoom = 1;
    let pointers = new Map<number, PointerEvent>();

    function handlePointerDown(e: PointerEvent) {
        pointers.set(e.pointerId, e);
        if (pointers.size === 1) {
            isPanning = true;
            const p = pointers.get(e.pointerId)!;
            startX = p.clientX - panX;
            startY = p.clientY - panY;
        } else if (pointers.size === 2) {
            isPanning = false;
            const pts = Array.from(pointers.values());
            startDist = Math.hypot(
                pts[0].clientX - pts[1].clientX,
                pts[0].clientY - pts[1].clientY,
            );
            startZoom = store.zoom;
        }
    }

    function handlePointerMove(e: PointerEvent) {
        pointers.set(e.pointerId, e);
        if (pointers.size === 1 && isPanning) {
            panX = e.clientX - startX;
            panY = e.clientY - startY;
        } else if (pointers.size === 2) {
            const pts = Array.from(pointers.values());
            const dist = Math.hypot(
                pts[0].clientX - pts[1].clientX,
                pts[0].clientY - pts[1].clientY,
            );
            const scale = dist / startDist;
            store.zoom = Math.min(Math.max(startZoom * scale, 0.5), 3);
        }
    }

    function handlePointerUp(e: PointerEvent) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) startDist = 0;
        if (pointers.size === 0) isPanning = false;
    }

    function resetPan() {
        panX = 0;
        panY = 0;
        store.zoom = 1;
    }

    $effect(() => {
        if (!store.viewModalOpen) {
            resetPan();
        }
    });

    // Helper to get display data handling both new and legacy formats
    const getDisplayData = () => {
        if (!store.extractedData) return null;
        return store.extractedData.data || (store.extractedData as any);
    };
</script>

<Dialog.Root bind:open={store.viewModalOpen}>
    <Dialog.Content
        class="w-screen sm:max-w-[95vw] lg:max-w-[90vw] h-dvh sm:h-[95vh] p-0 overflow-hidden border-none bg-background/95 backdrop-blur-3xl shadow-2xl flex flex-col gap-0 select-none animate-in fade-in zoom-in-95 duration-300 sm:rounded-[2.5rem] overscroll-contain"
    >
        <!-- Mobile Header -->
        <div
            class="sm:hidden flex items-center justify-between px-6 py-4 border-b bg-background/50 backdrop-blur-md"
        >
            <div class="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-2xl"
                    onclick={() => (store.drawerOpen = true)}
                    aria-label="Select assessment"
                >
                    <LayoutGrid class="h-5 w-5" />
                </Button>
                <div>
                    <h3
                        class="text-[10px] font-black uppercase tracking-widest text-foreground/80"
                    >
                        Assessment
                    </h3>
                    <p
                        class="text-[9px] font-bold text-muted-foreground uppercase opacity-60 truncate max-w-[120px]"
                    >
                        {store.selectedFile?.filename}
                    </p>
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                class="h-10 w-10 rounded-2xl"
                onclick={() => (store.viewModalOpen = false)}
                aria-label="Close"
            >
                <X class="h-5 w-5" />
            </Button>
        </div>

        <!-- Desktop Navigation Bar -->
        <div
            class="hidden sm:flex items-center justify-between px-8 py-4 border-b bg-background/50 backdrop-blur-md shrink-0"
        >
            <div class="flex items-center gap-6">
                <div class="flex items-center gap-2">
                    <div
                        class="w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    ></div>
                    <span
                        class="text-[10px] font-black uppercase tracking-[0.2em]"
                        >{store.selectedFile?.filename}</span
                    >
                </div>
                <div class="h-4 w-px bg-border/50"></div>
                <span
                    class="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full font-black tabular-nums"
                >
                    {store.currentIndex + 1} / {store.images.length}
                </span>
            </div>
            <div class="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-2xl hover:bg-primary/10"
                    onclick={store.handlePrev}
                    disabled={store.currentIndex === 0}
                >
                    <ChevronLeft class="h-5 w-5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-2xl hover:bg-primary/10"
                    onclick={store.handleNext}
                    disabled={store.currentIndex === store.images.length - 1}
                >
                    <ChevronRight class="h-5 w-5" />
                </Button>
                <div class="h-4 w-px bg-border/50 mx-2"></div>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-10 w-10 rounded-2xl hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => (store.viewModalOpen = false)}
                >
                    <X class="h-5 w-5" />
                </Button>
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="flex-1 flex flex-col sm:flex-row overflow-hidden">
            <!-- LEFT PANE: Desktop Thumbnails -->
            <div
                class="hidden sm:flex w-20 lg:w-60 border-r bg-muted/5 flex-col h-full overflow-hidden shrink-0 transition-all duration-300"
            >
                <ScrollArea class="flex-1 p-2 lg:p-3">
                    <div class="space-y-3 lg:space-y-4">
                        {#each store.images as img}
                            <div
                                class="group relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2
                                       {img.id === store.selectedFile?.id
                                    ? 'border-primary shadow-[0_0_20px_rgba(var(--primary),0.2)] scale-[1.02]'
                                    : 'border-transparent hover:border-primary/30'}"
                                onclick={() => store.handleView(img)}
                                onkeydown={(e) =>
                                    e.key === "Enter" && store.handleView(img)}
                                role="button"
                                tabindex="0"
                            >
                                <div class="aspect-4/5 bg-muted relative">
                                    <img
                                        src={img.url}
                                        alt={img.filename}
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    />
                                    {#if ["extracted", "approved", "published"].includes(img.status)}
                                        <div class="absolute top-2 right-2">
                                            <div
                                                class="bg-emerald-500 rounded-full p-1 shadow-lg border-2 border-white dark:border-black"
                                            >
                                                <Check
                                                    class="w-2.5 h-2.5 text-white"
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                                <div
                                    class="p-3 bg-background/50 backdrop-blur-md hidden lg:block"
                                >
                                    <p
                                        class="text-[9px] font-black truncate uppercase tracking-tight"
                                    >
                                        {img.filename}
                                    </p>
                                </div>
                            </div>
                        {/each}
                    </div>
                </ScrollArea>
            </div>

            <!-- CENTER AREA: Tab-based Viewer & Data Panes -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                <!-- Viewer Pane (Tab controlled on all screen sizes) -->
                <div
                    class="flex-1 relative overflow-hidden flex-col {store.activeTab ===
                    'viewer'
                        ? 'flex'
                        : 'hidden'}"
                >
                    <div
                        class="flex-1 relative flex flex-col bg-neutral-950 sm:bg-transparent overflow-hidden"
                    >
                        <!-- Viewer Toolbar -->
                        <div
                            class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 bg-background/20 backdrop-blur-2xl rounded-2xl border border-white/10 z-20 shadow-2xl"
                        >
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-11 w-11 sm:h-8 sm:w-8 text-white hover:bg-white/10 active:bg-white/20"
                                aria-label="Zoom out"
                                onclick={() =>
                                    (store.zoom = Math.max(
                                        store.zoom - 0.2,
                                        0.5,
                                    ))}
                            >
                                <ZoomOut class="h-4 w-4" />
                            </Button>
                            <span
                                class="text-[11px] text-white font-black w-10 text-center tabular-nums"
                            >
                                {Math.round(store.zoom * 100)}%
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-11 w-11 sm:h-8 sm:w-8 text-white hover:bg-white/10 active:bg-white/20"
                                aria-label="Zoom in"
                                onclick={() =>
                                    (store.zoom = Math.min(
                                        store.zoom + 0.2,
                                        3,
                                    ))}
                            >
                                <ZoomIn class="h-4 w-4" />
                            </Button>
                            <div class="w-px h-3 bg-white/20 mx-1.5"></div>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-11 w-11 sm:h-8 sm:w-8 text-white hover:bg-white/10 active:bg-white/20"
                                aria-label="Rotate"
                                onclick={() =>
                                    (store.rotation =
                                        (store.rotation + 90) % 360)}
                            >
                                <RotateCw class="h-4 w-4" />
                            </Button>
                        </div>

                        <!-- Image Display -->
                        <div
                            class="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-20 overflow-hidden touch-none"
                            onpointerdown={handlePointerDown}
                            onpointermove={handlePointerMove}
                            onpointerup={handlePointerUp}
                            onpointercancel={handlePointerUp}
                            onwheel={(e) => {
                                if (e.ctrlKey) {
                                    e.preventDefault();
                                    store.zoom = Math.min(
                                        Math.max(
                                            store.zoom +
                                                (e.deltaY < 0 ? 0.1 : -0.1),
                                            0.5,
                                        ),
                                        3,
                                    );
                                }
                            }}
                        >
                            {#if store.selectedFile?.url}
                                <div
                                    class="relative transition-transform duration-75 ease-out shadow-[0_0_100px_rgba(0,0,0,0.3)] origin-center"
                                    style="transform: translate({panX}px, {panY}px) scale({store.zoom}) rotate({store.rotation}deg);"
                                >
                                    <img
                                        src={store.selectedFile.url}
                                        alt={store.selectedFile.filename}
                                        class="max-w-[85vw] max-h-[70vh] sm:max-w-[40vw] lg:max-w-[50vw] sm:max-h-[80vh] object-contain bg-white rounded-xl shadow-2xl"
                                        draggable="false"
                                    />
                                    {#if store.showGrids}
                                        <div
                                            class="absolute inset-0 grid grid-cols-12 grid-rows-12 pointer-events-none opacity-30 mix-blend-overlay"
                                        >
                                            {#each Array(144) as _}
                                                <div
                                                    class="border-[0.5px] border-primary/50"
                                                ></div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {:else}
                                <div
                                    class="flex flex-col items-center justify-center text-muted-foreground/20 animate-pulse"
                                >
                                    <FileText class="h-32 w-32 mb-6" />
                                    <p
                                        class="text-xs font-black uppercase tracking-[0.4em]"
                                    >
                                        Empty Canvas
                                    </p>
                                </div>
                            {/if}
                        </div>

                        <!-- Bottom Overlays -->
                        <div
                            class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20"
                        >
                            <Button
                                variant={store.showGrids
                                    ? "default"
                                    : "secondary"}
                                size="sm"
                                class="h-10 px-5 rounded-xl shadow-2xl transition-all {store.showGrids
                                    ? 'bg-primary'
                                    : 'bg-background/20 backdrop-blur-xl text-white border border-white/10'}"
                                onclick={() =>
                                    (store.showGrids = !store.showGrids)}
                            >
                                <Grid3X3 class="w-4 h-4 mr-2" />
                                <span
                                    class="text-[9px] font-black uppercase tracking-widest"
                                    >Grids</span
                                >
                            </Button>
                            <Button
                                variant={store.showTranslation
                                    ? "default"
                                    : "secondary"}
                                size="sm"
                                class="h-10 px-5 rounded-xl shadow-2xl transition-all {store.showTranslation
                                    ? 'bg-primary'
                                    : 'bg-background/20 backdrop-blur-xl text-white border border-white/10'}"
                                onclick={() =>
                                    (store.showTranslation =
                                        !store.showTranslation)}
                            >
                                <Languages class="w-4 h-4 mr-2" />
                                <span
                                    class="text-[9px] font-black uppercase tracking-widest"
                                    >Translate</span
                                >
                            </Button>
                        </div>
                    </div>
                </div>

                <!-- Data Panes (Results or JSON) - Tab controlled on all screens -->
                <div
                    class="flex-1 min-h-0 w-full bg-background flex-col {[
                        'results',
                        'json',
                    ].includes(store.activeTab)
                        ? 'flex'
                        : 'hidden'}"
                >
                    <div
                        class="flex-1 overflow-y-auto overscroll-contain touch-pan-y scrollbar-hide"
                    >
                        {#if store.activeTab === "json"}
                            <div
                                class="p-8 font-mono text-[10px] whitespace-pre-wrap break-all text-muted-foreground/80 leading-relaxed"
                            >
                                {JSON.stringify(store.extractedData, null, 2)}
                            </div>
                        {:else}
                            <div class="px-6 py-8 sm:px-8 sm:py-10 space-y-10">
                                {#if store.isModalLoading}
                                    <div
                                        class="flex flex-col items-center justify-center py-24 space-y-6"
                                    >
                                        <div
                                            class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
                                        ></div>
                                        <p
                                            class="text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse"
                                        >
                                            Analyzing Assessment
                                        </p>

                                        <!-- ... -->
                                    </div>
                                {:else if store.extractedData}
                                    {@const data = getDisplayData() as any}
                                    {#if data}
                                        <div class="space-y-10">
                                            <!-- Context -->
                                            <div class="space-y-6">
                                                <div
                                                    class="flex items-center gap-4"
                                                >
                                                    <div
                                                        class="w-1.5 h-6 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                                                    ></div>
                                                    <h3
                                                        class="text-xs font-black uppercase tracking-[0.3em] text-foreground/80"
                                                    >
                                                        Extraction Context
                                                    </h3>
                                                </div>
                                                <div
                                                    class="grid gap-4 bg-muted/20 p-5 rounded-3xl border border-border/50"
                                                >
                                                    <div class="space-y-2">
                                                        <Label
                                                            class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                            >Full Name</Label
                                                        >
                                                        {#if data.studentData}
                                                            <Input
                                                                bind:value={
                                                                    data
                                                                        .studentData
                                                                        .fullName
                                                                }
                                                                class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4 uppercase"
                                                            />
                                                        {:else}
                                                            <Input
                                                                bind:value={
                                                                    data.fullName
                                                                }
                                                                class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4 uppercase"
                                                            />
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                                    >
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Admission No</Label
                                                            >
                                                            {#if data.studentData}
                                                                <Input
                                                                    type="number"
                                                                    bind:value={
                                                                        data
                                                                            .studentData
                                                                            .admissionNo
                                                                    }
                                                                    class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4"
                                                                />
                                                            {/if}
                                                        </div>
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Category</Label
                                                            >
                                                            {#if data.studentData}
                                                                <Input
                                                                    bind:value={
                                                                        data
                                                                            .studentData
                                                                            .studentCategory
                                                                    }
                                                                    class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4 uppercase"
                                                                />
                                                            {/if}
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                                    >
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Term</Label
                                                            >
                                                            {#if data.studentData}
                                                                <Input
                                                                    bind:value={
                                                                        data
                                                                            .studentData
                                                                            .term
                                                                    }
                                                                    class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4 uppercase"
                                                                />
                                                            {/if}
                                                        </div>
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Extracted At</Label
                                                            >
                                                            <div
                                                                class="h-11 flex items-center bg-background border-none shadow-sm font-black text-[10px] rounded-2xl px-4 uppercase truncate"
                                                            >
                                                                {store
                                                                    .extractedData
                                                                    .extractedAt
                                                                    ? new Date(
                                                                          store.extractedData.extractedAt,
                                                                      ).toLocaleDateString()
                                                                    : "N/A"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div
                                                        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                                    >
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Verified</Label
                                                            >
                                                            <div
                                                                class="h-11 flex items-center bg-background border-none shadow-sm font-black text-xs rounded-2xl px-4 uppercase {store
                                                                    .extractedData
                                                                    .verified
                                                                    ? 'text-emerald-500'
                                                                    : 'text-amber-500'}"
                                                            >
                                                                {store
                                                                    .extractedData
                                                                    .verified
                                                                    ? "YES"
                                                                    : "NO"}
                                                            </div>
                                                        </div>
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Status</Label
                                                            >
                                                            <Tooltip.Provider delayDuration={0}>
                                                                <Tooltip.Root>
                                                                    <Tooltip.Trigger class="w-full">
                                                                        <div
                                                                            class="h-11 flex items-center bg-background border-none shadow-sm font-black text-xs rounded-2xl px-4 uppercase {store.extractedData.status === 'published' ? 'text-blue-500' : store.extractedData.status === 'approved' ? 'text-emerald-500' : store.extractedData.status === 'extracted' ? 'text-amber-500' : store.extractedData.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}"
                                                                        >
                                                                            {store.extractedData.status || "UPLOADED"}
                                                                        </div>
                                                                    </Tooltip.Trigger>
                                                                    <Tooltip.Content>
                                                                        <p class="text-sm">{getAssessmentStatusDescription(store.extractedData.status, store.extractedData.error)}</p>
                                                                    </Tooltip.Content>
                                                                </Tooltip.Root>
                                                            </Tooltip.Provider>
                                                        </div>
                                                    </div>
                                                    {#if store.extractedData.error}
                                                        <div
                                                            class="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl"
                                                        >
                                                            <p
                                                                class="text-[10px] font-bold text-destructive uppercase tracking-tight leading-relaxed"
                                                            >
                                                                {store
                                                                    .extractedData
                                                                    .error}
                                                            </p>
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>

                                            <!-- Attendance -->
                                            {#if data.studentData?.attendance}
                                                <div class="space-y-6">
                                                    <div
                                                        class="flex items-center gap-4"
                                                    >
                                                        <div
                                                            class="w-1.5 h-6 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                                                        ></div>
                                                        <h3
                                                            class="text-xs font-black uppercase tracking-[0.3em] text-foreground/80"
                                                        >
                                                            Attendance
                                                        </h3>
                                                    </div>
                                                    <div
                                                        class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-muted/20 p-5 rounded-3xl border border-border/50"
                                                    >
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Opened</Label
                                                            >
                                                            <Input
                                                                type="number"
                                                                bind:value={
                                                                    data
                                                                        .studentData
                                                                        .attendance
                                                                        .daysOpened
                                                                }
                                                                class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4"
                                                            />
                                                        </div>
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Present</Label
                                                            >
                                                            <Input
                                                                type="number"
                                                                bind:value={
                                                                    data
                                                                        .studentData
                                                                        .attendance
                                                                        .daysPresent
                                                                }
                                                                class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4"
                                                            />
                                                        </div>
                                                        <div class="space-y-2">
                                                            <Label
                                                                class="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >Absent</Label
                                                            >
                                                            <Input
                                                                type="number"
                                                                bind:value={
                                                                    data
                                                                        .studentData
                                                                        .attendance
                                                                        .daysAbsent
                                                                }
                                                                class="h-11 bg-background border-none shadow-sm font-black text-sm rounded-2xl px-4"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            {/if}

                                            <!-- Scores -->
                                            <div class="space-y-6">
                                                <div
                                                    class="flex items-center gap-4"
                                                >
                                                    <div
                                                        class="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                                    ></div>
                                                    <h3
                                                        class="text-xs font-black uppercase tracking-[0.3em] text-foreground/80"
                                                    >
                                                        Extracted Marks
                                                    </h3>
                                                </div>
                                                <div
                                                    class="rounded-4xl overflow-hidden border border-border/50 bg-background shadow-xl"
                                                >
                                                    <table
                                                        class="w-full text-left"
                                                    >
                                                        <thead>
                                                            <tr
                                                                class="bg-muted/30 border-b border-border/50"
                                                            >
                                                                <th
                                                                    class="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60"
                                                                    >Subject</th
                                                                >
                                                                <th
                                                                    class="p-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center"
                                                                    >Marks</th
                                                                >
                                                            </tr>
                                                        </thead>
                                                        <tbody
                                                            class="divide-y divide-border/30"
                                                        >
                                                            {#if data.marksData}
                                                                {#each data.marksData as m}
                                                                    <tr
                                                                        class="hover:bg-muted/5 transition-colors group"
                                                                    >
                                                                        <td
                                                                            class="p-4"
                                                                        >
                                                                            <div
                                                                                class="flex flex-col"
                                                                            >
                                                                                <span
                                                                                    class="text-sm font-black uppercase tracking-tight"
                                                                                    >{m.subjectName ||
                                                                                        m.subjectCode}</span
                                                                                >
                                                                                <span
                                                                                    class="text-xs font-medium text-muted-foreground opacity-50 uppercase tracking-widest"
                                                                                    >{m.subjectCode}</span
                                                                                >
                                                                            </div>
                                                                        </td>
                                                                        <td
                                                                            class="p-4"
                                                                        >
                                                                            {#if m.marks && m.marks.length > 0}
                                                                                {#each m.marks as score, idx}
                                                                                    <input
                                                                                        type="number"
                                                                                        value={score}
                                                                                        oninput={(
                                                                                            e,
                                                                                        ) =>
                                                                                            store.updateScore(
                                                                                                m.subjectCode,
                                                                                                idx,
                                                                                                e
                                                                                                    .currentTarget
                                                                                                    .value,
                                                                                            )}
                                                                                        class="w-11 h-9 text-center bg-muted/40 border-none rounded-xl text-sm font-black focus:bg-background focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                                                                                    />
                                                                                {/each}
                                                                            {:else if m.learningOutcome !== undefined}
                                                                                <textarea
                                                                                    bind:value={
                                                                                        m.learningOutcome
                                                                                    }
                                                                                    class="w-full min-h-[60px] p-3 bg-muted/40 border-none rounded-xl text-sm font-medium focus:bg-background focus:ring-4 focus:ring-primary/10 transition-all outline-none resize-none"
                                                                                    placeholder="Learning outcome..."

                                                                                ></textarea>
                                                                            {/if}
                                                                        </td>
                                                                    </tr>
                                                                {/each}
                                                            {:else if data.scores}
                                                                {#each Object.entries(data.scores) as [subject, marks]}
                                                                    <tr
                                                                        class="hover:bg-muted/5 transition-colors group"
                                                                    >
                                                                        <td
                                                                            class="p-4"
                                                                        >
                                                                            <div
                                                                                class="flex flex-col"
                                                                            >
                                                                                <span
                                                                                    class="text-sm font-black uppercase tracking-tight"
                                                                                    >{subject}</span
                                                                                >
                                                                            </div>
                                                                        </td>
                                                                        <td
                                                                            class="p-4"
                                                                        >
                                                                            <div
                                                                                class="flex items-center justify-center gap-2"
                                                                            >
                                                                                {#each marks as any as score, idx}
                                                                                    <input
                                                                                        type="number"
                                                                                        value={score}
                                                                                        oninput={(
                                                                                            e,
                                                                                        ) =>
                                                                                            store.updateScore(
                                                                                                subject,
                                                                                                idx,
                                                                                                e
                                                                                                    .currentTarget
                                                                                                    .value,
                                                                                            )}
                                                                                        class="w-14 h-11 sm:w-11 sm:h-9 text-center bg-muted/40 border-none rounded-xl text-sm font-black focus:bg-background focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                                                                                    />
                                                                                {/each}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                {/each}
                                                            {/if}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                            <!-- Student Ratings -->
                                            {#if data.studentRatings}
                                                <div class="space-y-6">
                                                    <div
                                                        class="flex items-center gap-4"
                                                    >
                                                        <div
                                                            class="w-1.5 h-6 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                                                        ></div>
                                                        <h3
                                                            class="text-xs font-black uppercase tracking-[0.3em] text-foreground/80"
                                                        >
                                                            Student Ratings
                                                        </h3>
                                                    </div>
                                                    <div
                                                        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                                    >
                                                        {#each Object.entries(data.studentRatings) as [key, value]}
                                                            <div
                                                                class="space-y-2 bg-muted/20 p-4 rounded-3xl border border-border/50"
                                                            >
                                                                <Label
                                                                    class="text-[11px] font-black uppercase tracking-widest text-muted-foreground ml-1"
                                                                >
                                                                    {key.replace(
                                                                        /_/g,
                                                                        " ",
                                                                    )}
                                                                </Label>
                                                                <Select.Root
                                                                    type="single"
                                                                    value={String(
                                                                        value ||
                                                                            "",
                                                                    )}
                                                                    onValueChange={(
                                                                        v,
                                                                    ) => {
                                                                        if (v)
                                                                            data.studentRatings[
                                                                                key
                                                                            ] =
                                                                                Number(
                                                                                    v,
                                                                                );
                                                                    }}
                                                                >
                                                                    <Select.Trigger
                                                                        class="h-10 border-none bg-background rounded-2xl shadow-sm text-xs font-black px-4"
                                                                    >
                                                                        {AttributeRemark[
                                                                            value as any as keyof typeof AttributeRemark
                                                                        ] ||
                                                                            "Select rating"}
                                                                    </Select.Trigger>
                                                                    <Select.Content
                                                                    >
                                                                        {#each Object.entries(AttributeRemark) as [rKey, rLabel]}
                                                                            <Select.Item
                                                                                value={String(
                                                                                    rKey,
                                                                                )}
                                                                                label={rLabel}
                                                                                class="text-xs font-medium"
                                                                                >{rLabel}</Select.Item
                                                                            >
                                                                        {/each}
                                                                    </Select.Content>
                                                                </Select.Root>
                                                            </div>
                                                        {/each}
                                                    </div>
                                                </div>
                                            {/if}
                                            <!-- Teacher's Remark -->
                                            {#if data.teachersRemark}
                                                <div class="space-y-6">
                                                    <div
                                                        class="flex items-center gap-4"
                                                    >
                                                        <div
                                                            class="w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                                                        ></div>
                                                        <h3
                                                            class="text-xs font-black uppercase tracking-[0.3em] text-foreground/80"
                                                        >
                                                            Teacher's Remark
                                                        </h3>
                                                    </div>
                                                    <div
                                                        class="rounded-3xl border border-border/50 bg-background shadow-xl p-1"
                                                    >
                                                        <Textarea
                                                            bind:value={
                                                                data
                                                                    .teachersRemark
                                                                    .comment
                                                            }
                                                            class="min-h-[100px] border-none focus-visible:ring-0 resize-none p-4 text-xs font-medium leading-relaxed"
                                                            placeholder="Enter teacher's remark..."
                                                        />
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                {:else}
                                    <div
                                        class="flex flex-col items-center justify-center py-40 text-muted-foreground/30 text-center space-y-6"
                                    >
                                        <div
                                            class="p-8 rounded-[2.5rem] bg-muted/10 border border-dashed border-muted/50"
                                        >
                                            <Search
                                                class="w-12 h-12 opacity-20"
                                            />
                                        </div>
                                        <p
                                            class="text-[10px] font-black uppercase tracking-[0.3em]"
                                        >
                                            No Analysis Data Found
                                        </p>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <!-- Approval button shown when results tab is active -->
                    {#if store.activeTab === "results"}
                        <div
                            class="p-4 sm:p-6 border-t bg-background/50 backdrop-blur-xl"
                        >
                            <Button
                                class="w-full h-11 sm:h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 active:scale-[0.98]"
                                onclick={store.handleApprove}
                                disabled={!store.extractedData ||
                                    store.isModalLoading}
                            >
                                {#if store.isModalLoading}
                                    <RotateCw class="w-4 h-4 animate-spin" />
                                {:else}
                                    <Check class="w-4 h-4" />
                                    Approve & Save
                                {/if}
                            </Button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Unified Tab Switcher (All Screen Sizes) -->
        <div
            class="border-t bg-background/80 backdrop-blur-2xl px-4 sm:px-6 py-3 sm:py-4 safe-area-bottom"
        >
            <div
                class="grid grid-cols-3 bg-muted/50 p-1 sm:p-1.5 h-10 sm:h-11 rounded-xl sm:rounded-2xl shadow-inner max-w-md mx-auto"
            >
                <button
                    class="rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all duration-200 {store.activeTab ===
                    'viewer'
                        ? 'bg-background shadow-lg text-foreground'
                        : 'text-muted-foreground hover:text-foreground/70'}"
                    onclick={() => (store.activeTab = "viewer")}
                >
                    Viewer
                </button>
                <button
                    class="rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all duration-200 {store.activeTab ===
                    'results'
                        ? 'bg-background shadow-lg text-foreground'
                        : 'text-muted-foreground hover:text-foreground/70'}"
                    onclick={() => (store.activeTab = "results")}
                >
                    Results
                </button>
                <button
                    class="rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all duration-200 {store.activeTab ===
                    'json'
                        ? 'bg-background shadow-lg text-foreground'
                        : 'text-muted-foreground hover:text-foreground/70'}"
                    onclick={() => (store.activeTab = "json")}
                >
                    JSON
                </button>
            </div>
        </div>

        <!-- Old desktop tab switcher removed - now using unified bottom tabs -->
    </Dialog.Content>
</Dialog.Root>

<!-- Mobile Selection Drawer -->
<Sheet.Root bind:open={store.drawerOpen}>
    <Sheet.Content
        side="bottom"
        class="h-[80vh] rounded-t-[2.5rem] p-0 overflow-hidden border-none bg-background/95 backdrop-blur-3xl"
    >
        <div
            class="px-8 py-6 border-b flex items-center justify-between bg-muted/10"
        >
            <h3
                class="text-xs font-black uppercase tracking-[0.3em] text-foreground/60"
            >
                Select Assessment
            </h3>
            <Sheet.Title class="hidden">Assessments</Sheet.Title>
            <Button
                variant="ghost"
                size="icon"
                class="h-10 w-10 rounded-2xl"
                onclick={() => (store.drawerOpen = false)}
            >
                <X class="h-5 w-5" />
            </Button>
        </div>
        <ScrollArea class="h-full p-6 pb-20">
            <div class="grid grid-cols-2 gap-4 pb-20">
                {#each store.images as img}
                    <div
                        class="group relative rounded-2xl overflow-hidden cursor-pointer transition-all border-2
                               {img.id === store.selectedFile?.id
                            ? 'border-primary shadow-lg scale-95'
                            : 'border-transparent active:scale-95'}"
                        onclick={() => {
                            store.handleView(img);
                            store.drawerOpen = false;
                        }}
                        onkeydown={(e) =>
                            e.key === "Enter" &&
                            (store.handleView(img), (store.drawerOpen = false))}
                        role="button"
                        tabindex="0"
                    >
                        <div class="aspect-4/5 bg-muted relative">
                            <img
                                src={img.url}
                                alt={img.filename}
                                class="w-full h-full object-cover"
                            />
                            {#if ["extracted", "approved", "published"].includes(img.status)}
                                <div class="absolute top-2 right-2">
                                    <div
                                        class="bg-emerald-500 rounded-full p-1 shadow-lg border-2 border-white"
                                    >
                                        <Check class="w-2.5 h-2.5 text-white" />
                                    </div>
                                </div>
                            {/if}
                        </div>
                        <div class="p-3 bg-secondary/50 backdrop-blur-sm">
                            <p
                                class="text-[9px] font-black truncate uppercase tracking-tight"
                            >
                                {img.filename}
                            </p>
                        </div>
                    </div>
                {/each}
            </div>
        </ScrollArea>
    </Sheet.Content>
</Sheet.Root>

<style>
    :global(.scrollbar-hide::-webkit-scrollbar) {
        display: none;
    }
    :global(.scrollbar-hide) {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
