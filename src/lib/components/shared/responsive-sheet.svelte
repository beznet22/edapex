<script lang="ts">
    import * as Sheet from "$lib/components/ui/sheet/index.js";
    import { Drawer } from "vaul-svelte";
    import { IsMobile } from "$lib/hooks/is-mobile.svelte.js";
    import { cn } from "$lib/utils/shadcn.js";
    import { type Snippet } from "svelte";
    import X from "@lucide/svelte/icons/x";
    import { Button } from "$lib/components/ui/button/index.js";

    let {
        open = $bindable(false),
        onOpenChange,
        title,
        description,
        children,
        header,
        prefix,
        extra,
        footer,
        class: className,
        contentClass,
    }: {
        open: boolean;
        onOpenChange?: (open: boolean) => void;
        title?: string | Snippet;
        description?: string | Snippet;
        children: Snippet;
        header?: Snippet;
        prefix?: Snippet;
        extra?: Snippet;
        footer?: Snippet;
        class?: string;
        contentClass?: string;
    } = $props();

    const isMobile = new IsMobile();

    let drawerContentRef = $state<HTMLElement>(null!);

    function handleClose() {
        open = false;
        onOpenChange?.(false);
    }

    // Adjust drawer position when virtual keyboard opens on mobile
    $effect(() => {
        if (!isMobile.current || !open) return;

        const vv = window.visualViewport;
        if (!vv) return;

        const onViewportChange = () => {
            if (!drawerContentRef) return;
            // Calculate how much the visual viewport has shrunk (keyboard height)
            const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
            if (keyboardHeight > 50) {
                // Keyboard is open — lift the drawer above it
                drawerContentRef.style.bottom = `${keyboardHeight}px`;
                drawerContentRef.style.maxHeight = `${vv.height * 0.85}px`;
            } else {
                // Keyboard is closed — reset
                drawerContentRef.style.bottom = '';
                drawerContentRef.style.maxHeight = '';
            }
        };

        vv.addEventListener('resize', onViewportChange);
        vv.addEventListener('scroll', onViewportChange);

        return () => {
            vv.removeEventListener('resize', onViewportChange);
            vv.removeEventListener('scroll', onViewportChange);
            if (drawerContentRef) {
                drawerContentRef.style.bottom = '';
                drawerContentRef.style.maxHeight = '';
            }
        };
    });
</script>

{#if isMobile.current}
    <Drawer.Root
        bind:open
        onOpenChange={(val) => {
            if (!val) onOpenChange?.(false);
        }}
        shouldScaleBackground={true}
    >
        <Drawer.Portal>
            <Drawer.Overlay
                class="fixed inset-0 z-50 bg-black/50 backdrop-blur-md"
            />
            <Drawer.Content
                bind:ref={drawerContentRef}
                role="dialog"
                aria-modal="true"
                class={cn(
                    "fixed bottom-0 left-0 right-0 z-50 mt-24 flex max-h-[85vh] flex-col rounded-t-[2.5rem] bg-background/95 backdrop-blur-xl border-t border-white/10 outline-none transition-[bottom,max-height] duration-200",
                    className,
                )}
            >
                <div class="flex items-center justify-center py-3 shrink-0 cursor-grab active:cursor-grabbing">
                    <div
                        class="h-1.5 w-12 rounded-full bg-muted/40"
                    ></div>
                </div>

                <div class="flex flex-col flex-1 overflow-hidden">
                    {#if header || title || description || prefix || extra}
                        <div
                        class="shrink-0 px-4 pt-4 pb-4 border-b border-border/5 text-left flex items-center justify-between"
                    >
                        <div class="flex-1 flex flex-col min-w-0">
                            {#if header}
                                {@render header()}
                            {:else}
                                <div class="flex items-center gap-2.5">
                                    {#if prefix}
                                        <div class="shrink-0">
                                            {@render prefix()}
                                        </div>
                                    {/if}
                                    <div class="flex flex-col min-w-0">
                                        {#if title}
                                            <div class="inline-flex self-start px-2 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md mb-0.5 max-w-full">
                                                <h2 class="text-[10px] font-black text-primary tracking-[0.2em] uppercase truncate">
                                                    {#if typeof title === "string"}
                                                        {title}
                                                    {:else}
                                                        {@render title()}
                                                    {/if}
                                                </h2>
                                            </div>
                                        {/if}
                                        {#if description}
                                            <p class="text-[9px] font-bold text-muted-foreground uppercase opacity-60 tracking-widest truncate">
                                                {#if typeof description === "string"}
                                                    {description}
                                                {:else}
                                                    {@render description()}
                                                {/if}
                                            </p>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                        <div class="flex items-center gap-1 shrink-0 ml-2">
                            {#if extra}
                                {@render extra()}
                            {/if}
                            {#if !header}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-12 w-12 min-h-12 min-w-12 rounded-2xl shrink-0"
                                    onclick={handleClose}
                                    aria-label="Close"
                                >
                                    <X class="h-5 w-5" />
                                </Button>
                            {/if}
                        </div>
                    </div>
                    {/if}

                    <div
                        data-vaul-no-drag
                        class={cn(
                            "flex-1 overflow-y-auto overscroll-contain custom-scrollbar",
                            !contentClass && "px-6 py-6",
                            contentClass,
                        )}
                    >
                        {@render children()}
                    </div>
                </div>

                {#if footer}
                    <div
                        class="sticky bottom-0 shrink-0 border-t border-border/5 bg-background/50 px-6 py-5 backdrop-blur-md safe-area-bottom z-10"
                    >
                        {@render footer()}
                    </div>
                {/if}
            </Drawer.Content>
        </Drawer.Portal>
    </Drawer.Root>
{:else}
    <Sheet.Root bind:open {onOpenChange}>
        <Sheet.Content
            side="right"
            class={cn(
                "transition-all duration-500 w-full border-l border-white/5 sm:max-w-[30vw]",
                className,
            )}
        >
            <div class="flex h-full flex-col overflow-hidden">
                {#if header || title || description || prefix || extra}
                    <div
                    class="shrink-0 px-6 pt-8 pb-6 border-b border-border/5 text-left flex items-center justify-between"
                >
                    <div class="flex-1 flex flex-col min-w-0">
                        {#if header}
                            {@render header()}
                        {:else}
                            <div class="flex items-center gap-3">
                                {#if prefix}
                                    <div class="shrink-0">
                                        {@render prefix()}
                                    </div>
                                {/if}
                                <div class="flex flex-col min-w-0">
                                    {#if title}
                                        <div class="inline-flex self-start px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-md mb-1.5">
                                            <Sheet.Title class="text-[10px] font-black text-primary tracking-[0.2em] uppercase truncate">
                                                {#if typeof title === "string"}
                                                    {title}
                                                {:else}
                                                    {@render title()}
                                                {/if}
                                            </Sheet.Title>
                                        </div>
                                    {/if}
                                    {#if description}
                                        <Sheet.Description class="text-[9px] font-bold text-muted-foreground uppercase opacity-60 tracking-widest truncate">
                                            {#if typeof description === "string"}
                                                {description}
                                            {:else}
                                                {@render description()}
                                            {/if}
                                        </Sheet.Description>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                    <div class="flex items-center gap-2 shrink-0 ml-4">
                        {#if extra}
                            {@render extra()}
                        {/if}
                        {#if !header}
                            <Button
                                variant="ghost"
                                size="icon"
                                class="h-12 w-12 min-h-12 min-w-12 rounded-2xl shrink-0"
                                onclick={handleClose}
                                aria-label="Close"
                            >
                                <X class="h-5 w-5" />
                            </Button>
                        {/if}
                        </div>
                    </div>
                {/if}

                <div
                    class={cn(
                        "flex-1 overflow-y-auto overscroll-contain custom-scrollbar",
                        !contentClass && "px-6 py-6",
                        contentClass,
                    )}
                >
                    {@render children()}
                </div>

                {#if footer}
                    <div
                        class="sticky bottom-0 shrink-0 border-t border-border/5 bg-background/50 px-6 py-5 backdrop-blur-md safe-area-bottom z-10"
                    >
                        {@render footer()}
                    </div>
                {/if}
            </div>
        </Sheet.Content>
    </Sheet.Root>
{/if}

<style>
    :global(.custom-scrollbar::-webkit-scrollbar) {
        width: 4px;
        height: 4px;
    }

    :global(.custom-scrollbar::-webkit-scrollbar-track) {
        background: transparent;
    }

    :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
        background: rgba(var(--primary), 0.1);
        border-radius: 10px;
    }

    :global(.custom-scrollbar::-webkit-scrollbar-thumb:hover) {
        background: rgba(var(--primary), 0.2);
    }

    /* Hide default close buttons from Sheet/Drawer primitives globally when using ResponsiveSheet */
    :global([data-slot="sheet-content"] > button),
    :global([data-slot="sheet-content"] button[aria-label="Close"]),
    :global([data-slot="drawer-content"] button[aria-label="Close"]) {
        display: none !important;
    }
</style>
