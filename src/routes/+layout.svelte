<script lang="ts">
  import "./layout.css";
  import { ThemeProvider } from "@sejohnson/svelte-themes";
  import { Toaster } from "$lib/components/ui/sonner";
  import IntegrationsModal from "$lib/components/integrations-modal.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  let { children } = $props();

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
  <Toaster position="bottom-center" />
  <IntegrationsModal />
  {@render children()}
</ThemeProvider>

