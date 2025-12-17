<script lang="ts">
  import "./layout.css";
  import { ThemeProvider } from "@sejohnson/svelte-themes";
  import { Toaster } from "$lib/components/ui/sonner";
  import { onMount } from "svelte";

  let { children } = $props();

  const detectSWUpdate = async () => {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;

    registration.addEventListener("updatefound", () => {
      const sw = registration.installing;
      sw?.addEventListener("statechange", () => {
        if (sw.state === "installed") {
          if (confirm("A new version is available. Reload to update?")) {
            sw.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          }
        }
      });
    });
  };

  onMount(async () => {
    detectSWUpdate();
  });
</script>

<ThemeProvider attribute="class" disableTransitionOnChange>
  <Toaster position="top-center" />
  {@render children()}
</ThemeProvider>
