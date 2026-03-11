<script lang="ts">
    import { usePWA } from "$lib/context/pwa.svelte";
    import { Button } from "$lib/components/ui/button";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import XIcon from "@lucide/svelte/icons/x";
    import { fade, fly } from "svelte/transition";
    import { backOut } from "svelte/easing";
    import { page } from "$app/stores";
    import * as AlertDialog from "$lib/components/ui/alert-dialog";

    const pwa = usePWA();

    const isIOS = typeof window !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isAuthPage = $derived($page.route?.id?.includes("(auth)"));

    let showModal = $state(false);
    let modalTitle = $state("");
    let modalDescription = $state("");

    function handleInstall() {
        if (isIOS) {
            modalTitle = "Install on iOS";
            modalDescription = "To install: Tap the Share button in Safari and select 'Add to Home Screen' \u{1F446}";
            showModal = true;
        } else if (pwa.deferredPrompt) {
            pwa.install();
        } else {
            // Fallback for browsers that haven't fired beforeinstallprompt or don't support it
            modalTitle = "Install Edapex";
            modalDescription = "To install on this browser: Look for the 'Install' icon in your address bar or check the browser menu (three dots) for 'Install App' \u{1F4BB}";
            showModal = true;
        }
    }
</script>

{#if isAuthPage && pwa.showInstallPrompt && !pwa.isStandalone}
    <div 
        class="fixed bottom-6 left-4 right-4 z-100 flex justify-center sm:left-auto sm:right-6 sm:w-auto pointer-events-none"
        in:fly={{ y: 100, duration: 800, easing: backOut }}
        out:fade
    >
        <div class="pointer-events-auto flex items-center gap-4 bg-card/95 backdrop-blur-xl border border-border/50 p-4 pl-5 rounded-2xl shadow-2xl max-w-md w-full group">
            <div class="flex-1 flex items-center gap-3 min-w-0">
                <div class="size-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                    <DownloadIcon class="size-5 text-primary" />
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-[11px] font-black uppercase tracking-widest text-foreground truncate">Install Edapex</span>
                    <span class="text-[9px] text-muted-foreground font-medium truncate">Get the best experience on your home screen</span>
                </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
                <Button 
                    size="sm" 
                    class="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                    onclick={handleInstall}
                >
                    Install
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    class="size-8 rounded-full hover:bg-muted/50 transition-colors"
                    onclick={pwa.dismiss}
                >
                    <XIcon class="size-4 text-muted-foreground" />
                </Button>
            </div>
        </div>
    </div>
{/if}

<AlertDialog.Root bind:open={showModal}>
    <AlertDialog.Content class="rounded-2xl">
        <AlertDialog.Header>
            <AlertDialog.Title>{modalTitle}</AlertDialog.Title>
            <AlertDialog.Description>
                {modalDescription}
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Action onclick={() => {
                showModal = false;
                pwa.dismiss();
            }}>Got it</AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
