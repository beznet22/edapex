<script lang="ts">
  import "./layout.css";
  import { ThemeProvider } from "@sejohnson/svelte-themes";
  import ThemeHead from "$lib/components/ThemeHead.svelte";
  import PWAInstallPrompt from "$lib/components/PWAInstallPrompt.svelte";
  import { Toaster } from "$lib/components/ui/sonner";
  import { PWAContext } from "$lib/context/pwa.svelte";
  import SettingsModal from "$lib/components/settings/index.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { isActive } from "$lib/state/global-context.svelte";

  let { children } = $props();

  // Initialize PWA Context
  PWAContext.setContext();

  const detectSWUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;

    registration.addEventListener("updatefound", () => {
      const sw = registration.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed") {
          toast("A new version is available", {
            action: {
              label: "Update",
              onClick: () => {
                sw.postMessage({ type: "SKIP_WAITING" });
                window.location.reload();
              },
            },
            duration: Infinity,
          });
        }
      });
    });
  };

  onMount(async () => {
    detectSWUpdate();
  });
</script>

<ThemeProvider attribute="class" disableTransitionOnChange>
  <ThemeHead />
  <PWAInstallPrompt />
  <Toaster position="bottom-right" />
  <SettingsModal />
  {#if isActive()}
    <div class="fixed top-0 left-0 w-full h-0.5 z-[9999] overflow-hidden bg-primary/20">
      <div class="h-full w-2/5 bg-primary progress-indeterminate" />
    </div>
  {/if}
  {@render children()}
</ThemeProvider>

<style>
  @keyframes progress-indeterminate {
    from { transform: translateX(-100%); }
    to { transform: translateX(400%); }
  }
  .progress-indeterminate {
    animation: progress-indeterminate 3s ease-in-out infinite;
  }
</style>

