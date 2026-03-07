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
        footer?: Snippet;
        class?: string;
        contentClass?: string;
    } = $props();

    const isMobile = new IsMobile();
    
    function handleClose() {
        open = false;
        onOpenChange?.(false);
    }
</script>

{#if isMobile.current}
    <Drawer.Root bind:open onOpenChange={(val) => {
        if (!val) onOpenChange?.(false);
    }} shouldScaleBackground={true}>
        <Drawer.Portal>
            <Drawer.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-md" />
            <Drawer.Content
                class={cn(
                    "fixed bottom-0 left-0 right-0 z-50 mt-24 flex max-h-[96vh] flex-col rounded-t-[2.5rem] bg-background/95 backdrop-blur-xl border-t border-white/10 outline-none",
                    className
                )}
            >
                <div class="mx-auto mt-4 h-1.5 w-12 shrink-0 rounded-full bg-muted/40"></div>
                
                <div class="flex flex-col flex-1 overflow-hidden">
                    <div class="shrink-0 px-6 pt-4 pb-4 border-b border-border/5 text-left flex items-center justify-between">
                        <div class="space-y-1.5 overflow-hidden">
                            {#if header}
                                {@render header()}
                            {:else}
                                {#if typeof title === "string"}
                                    <h2 class="text-xl font-bold tracking-tight text-foreground/90 truncate">
                                        {title}
                                    </h2>
                                {:else if title}
                                    {@render title()}
                                {/if}

                                {#if typeof description === "string"}
                                    <p class="text-[13px] font-medium text-muted-foreground/60 leading-relaxed max-w-[90%] truncate">
                                        {description}
                                    </p>
                                {:else if description}
                                    {@render description()}
                                {/if}
                            {/if}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-10 w-10 rounded-2xl shrink-0 ml-2"
                            onclick={handleClose}
                        >
                            <X class="h-5 w-5" />
                        </Button>
                    </div>

                    <div class={cn(
                        "flex-1 overflow-y-auto overscroll-contain custom-scrollbar",
                        !contentClass && "px-6 py-6",
                        contentClass
                    )}>
                        {@render children()}
                    </div>
                </div>

                {#if footer}
                    <div class="sticky bottom-0 shrink-0 border-t border-border/5 bg-background/50 px-6 py-5 backdrop-blur-md safe-area-bottom z-10">
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
                "flex h-full flex-col bg-background/95 p-0 backdrop-blur-xl transition-all duration-500 w-full border-l border-white/5 sm:max-w-xl",
                className
            )}
        >
            <!-- Hide default close button -->
            <style>
                [data-slot="sheet-content"] > button[type="button"] {
                    display: none !important;
                }
            </style>
            
            <div class="flex h-full flex-col overflow-hidden">
                <div class="shrink-0 px-6 pt-8 pb-4 border-b border-border/5 text-left flex items-center justify-between">
                    <div class="space-y-1.5 overflow-hidden">
                        {#if header}
                            {@render header()}
                        {:else}
                            {#if typeof title === "string"}
                                <Sheet.Title class="text-xl font-bold tracking-tight text-foreground/90 truncate">
                                    {title}
                                </Sheet.Title>
                            {:else if title}
                                <Sheet.Title>{@render title()}</Sheet.Title>
                            {/if}

                            {#if typeof description === "string"}
                                <Sheet.Description class="text-[13px] font-medium text-muted-foreground/60 leading-relaxed max-w-[90%] truncate">
                                    {description}
                                </Sheet.Description>
                            {:else if description}
                                <Sheet.Description>{@render description()}</Sheet.Description>
                            {/if}
                        {/if}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-10 w-10 rounded-2xl shrink-0 ml-2"
                        onclick={handleClose}
                    >
                        <X class="h-5 w-5" />
                    </Button>
                </div>

                <div class={cn(
                    "flex-1 overflow-y-auto overscroll-contain custom-scrollbar",
                    !contentClass && "px-6 py-6",
                    contentClass
                )}>
                    {@render children()}
                </div>

                {#if footer}
                    <div class="sticky bottom-0 shrink-0 border-t border-border/5 bg-background/50 px-6 py-5 backdrop-blur-md safe-area-bottom z-10">
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
</style>
