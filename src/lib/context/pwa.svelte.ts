import { getContext, setContext } from "svelte";

const PWA_CONTEXT_KEY = Symbol("pwa-context");

export class PWAContext {
    deferredPrompt = $state<any>(null);
    isStandalone = $state(false);
    showInstallPrompt = $state(false);
    userDismissed = $state(false);

    constructor() {
        if (typeof window !== "undefined") {
            this.isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone || false;
            
            // Show prompt by default if not installed (relying on userDismissed being false on init)
            if (!this.isStandalone) {
                this.showInstallPrompt = true;
            }

            window.addEventListener("beforeinstallprompt", (e) => {
                // Prevent the mini-infobar from appearing on mobile
                e.preventDefault();
                // Stash the event so it can be triggered later.
                this.deferredPrompt = e;
                
                // Show the prompt if not already installed and not dismissed in this session
                if (!this.isStandalone && !this.userDismissed) {
                    this.showInstallPrompt = true;
                }
            });

            window.addEventListener("appinstalled", () => {
                this.isStandalone = true;
                this.showInstallPrompt = false;
                this.deferredPrompt = null;
                console.log("PWA was installed");
            });
        }
    }

    install = async () => {
        if (!this.deferredPrompt) return;
        
        // Show the native install prompt
        this.deferredPrompt.prompt();
        
        // Wait for the user to respond to the prompt
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        
        // We've used the prompt, and can't use it again, throw it away
        this.deferredPrompt = null;
        this.showInstallPrompt = false;
    };

    dismiss = () => {
        this.showInstallPrompt = false;
        this.userDismissed = true;
    };

    static setContext() {
        const context = new PWAContext();
        setContext(PWA_CONTEXT_KEY, context);
        return context;
    }

    static fromContext(): PWAContext {
        return getContext(PWA_CONTEXT_KEY);
    }
}

export function usePWA() {
    return PWAContext.fromContext();
}
